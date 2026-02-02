using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace DeltaBoard.Server;

public sealed class BoardHub
{
    private readonly ILogger<BoardHub> _logger;

    public BoardHub(ILogger<BoardHub> logger)
    {
        _logger = logger;
    }

    private const int MaxParticipantsPerBoard = 20;
    private const int BufferSize = 64 * 1024; // 64KB for sync payloads
    private const int HelloTimeoutSeconds = 5;
    private const int InactivityTimeoutSeconds = 30;
    private const int InactivityCheckSeconds = 5;

    // Board state: boardId → board data
    private readonly ConcurrentDictionary<string, BoardState> _boards = [];

    public async Task HandleConnection(string boardId, WebSocket webSocket, CancellationToken cancellationToken)
    {
        var board = _boards.GetOrAdd(boardId, _ => new BoardState());
        var connectionId = Guid.NewGuid().ToString("N");
        _logger.LogInformation("ws-connect {ConnectionId} {BoardId}", connectionId, boardId);

        // Check capacity before handshake
        if (board.Participants.Count >= MaxParticipantsPerBoard)
        {
            await SendError(webSocket, "Board is full (max 20 participants)", "unknown", cancellationToken);
            await webSocket.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Board is full",
                cancellationToken);
            return;
        }

        // Wait for hello message
        var clientId = await WaitForHello(webSocket, cancellationToken);
        if (clientId is null)
        {
            _logger.LogWarning("ws-no-hello {ConnectionId} {BoardId}", connectionId, boardId);
            return; // Connection closed or invalid hello
        }

        // Check for duplicate clientId
        if (!board.Participants.TryAdd(clientId, new ParticipantState(webSocket)))
        {
            _logger.LogWarning("ws-duplicate-client {ConnectionId} {BoardId} {ClientId}", connectionId, boardId, clientId);
            await SendError(webSocket, "Client ID already connected to this board", clientId, cancellationToken);
            await webSocket.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Duplicate client ID",
                cancellationToken);
            return;
        }

        try
        {
            // Send welcome
            await SendWelcome(webSocket, board, clientId, cancellationToken);
            _logger.LogInformation("ws-welcome-sent {ConnectionId} {BoardId} {ClientId}", connectionId, boardId, clientId);

            // Notify existing participants (exclude the joiner; they already got welcome)
            await BroadcastParticipantsUpdate(board, clientId);

            // Main message loop
            await ReceiveMessages(board, clientId, webSocket, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Server shutting down or request aborted
            _logger.LogInformation("ws-canceled {ConnectionId} {BoardId} {ClientId}", connectionId, boardId, clientId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ws-exception {ConnectionId} {BoardId} {ClientId}", connectionId, boardId, clientId);
            throw;
        }
        finally
        {
            board.Participants.TryRemove(clientId, out _);
            await BroadcastParticipantsUpdate(board, clientId);
            _logger.LogInformation("ws-closed {ConnectionId} {BoardId} {ClientId} {State} {CloseStatus}",
                connectionId,
                boardId,
                clientId,
                webSocket.State,
                webSocket.CloseStatus);

            if (board.Participants.IsEmpty)
            {
                _boards.TryRemove(boardId, out _);
            }
        }
    }

    private async Task<string?> WaitForHello(WebSocket webSocket, CancellationToken cancellationToken)
    {
        try
        {
            using var helloCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            helloCts.CancelAfter(TimeSpan.FromSeconds(HelloTimeoutSeconds));

            var (messageType, message) = await ReceiveMessage(webSocket, 1024, helloCts.Token);

            if (messageType is WebSocketMessageType.Close)
            {
                return null;
            }

            if (messageType is WebSocketMessageType.Text && message is not null)
            {
                LogProtocol("RX", "unknown", message);
                using var doc = JsonDocument.Parse(message);

                if (doc.RootElement.TryGetProperty("type", out var typeEl) &&
                    typeEl.GetString() == "hello" &&
                    doc.RootElement.TryGetProperty("clientId", out var clientIdEl))
                {
                    return clientIdEl.GetString();
                }
            }
        }
        catch (JsonException)
        {
            _logger.LogWarning("ws-invalid-hello-json");
        }
        catch (OperationCanceledException)
        {
            // Timeout or server shutdown - fall through to close
        }

        if (webSocket.State is WebSocketState.Open)
        {
            await webSocket.CloseAsync(
                WebSocketCloseStatus.ProtocolError,
                "Expected hello message",
                CancellationToken.None);
        }
        return null;
    }

    private async Task SendWelcome(WebSocket webSocket, BoardState board, string clientId, CancellationToken cancellationToken)
    {
        var welcome = new
        {
            type = "welcome",
            participantCount = board.Participants.Count,
            readyCount = board.Participants.Values.Count(p => p.IsReady)
        };

        await SendJson(webSocket, welcome, clientId, cancellationToken);
    }

    private async Task SendError(WebSocket webSocket, string message, string clientId, CancellationToken cancellationToken)
    {
        var error = new { type = "error", message };
        await SendJson(webSocket, error, clientId, cancellationToken);
    }

    private async Task SendJson(WebSocket webSocket, object payload, string clientId, CancellationToken cancellationToken)
    {
        if (webSocket.State is not WebSocketState.Open)
            return;

        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        LogProtocol("TX", clientId, json);
        await webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
    }

    private async Task ReceiveMessages(BoardState board, string clientId, WebSocket webSocket, CancellationToken cancellationToken)
    {
        var buffer = new byte[BufferSize];
        using var inactivityCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var inactivityTask = MonitorInactivity(board, clientId, webSocket, inactivityCts.Token);

        try
        {
            while (webSocket.State is WebSocketState.Open && !cancellationToken.IsCancellationRequested)
            {
                var (messageType, message) = await ReceiveMessage(webSocket, BufferSize, cancellationToken);

                // Update last activity timestamp
                if (board.Participants.TryGetValue(clientId, out var participant))
                {
                    participant.LastActivity = DateTime.UtcNow;
                }

                if (messageType is WebSocketMessageType.Close)
                {
                    _logger.LogInformation("ws-close-received {ClientId} {CloseStatus}", clientId, webSocket.CloseStatus);
                    await webSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Closing",
                        CancellationToken.None);
                    break;
                }

                if (messageType is WebSocketMessageType.Text && message is not null)
                {
                    LogProtocol("RX", clientId, message);
                    await HandleMessage(board, clientId, message);
                }
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("ws-receive-canceled {ClientId}", clientId);
        }
        catch (WebSocketException ex)
        {
            _logger.LogWarning(ex, "ws-receive-error {ClientId} {State}", clientId, webSocket.State);
        }
        finally
        {
            inactivityCts.Cancel();
            await inactivityTask;
        }
    }

    private async Task MonitorInactivity(
        BoardState board,
        string clientId,
        WebSocket webSocket,
        CancellationToken cancellationToken)
    {
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(InactivityCheckSeconds));
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                if (board.Participants.TryGetValue(clientId, out var participant))
                {
                    var inactiveSeconds = (DateTime.UtcNow - participant.LastActivity).TotalSeconds;
                    if (inactiveSeconds >= InactivityTimeoutSeconds)
                    {
                        _logger.LogWarning("ws-inactivity-timeout {ClientId} {InactiveSeconds}", clientId, inactiveSeconds);
                        if (webSocket.State is WebSocketState.Open)
                        {
                            await webSocket.CloseAsync(
                                WebSocketCloseStatus.NormalClosure,
                                "Inactivity timeout",
                                CancellationToken.None);
                        }
                        break;
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (WebSocketException ex)
        {
            _logger.LogWarning(ex, "ws-inactivity-monitor-error {ClientId} {State}", clientId, webSocket.State);
        }
    }

    private static async Task<(WebSocketMessageType type, string? text)> ReceiveMessage(
        WebSocket webSocket,
        int bufferSize,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[bufferSize];
        var builder = new StringBuilder();
        WebSocketReceiveResult result;

        do
        {
            result = await webSocket.ReceiveAsync(buffer, cancellationToken);

            if (result.MessageType is WebSocketMessageType.Close)
            {
                return (WebSocketMessageType.Close, null);
            }

            if (result.MessageType is WebSocketMessageType.Text && result.Count > 0)
            {
                builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            }
        } while (!result.EndOfMessage);

        if (result.MessageType is WebSocketMessageType.Text)
        {
            return (WebSocketMessageType.Text, builder.ToString());
        }

        return (result.MessageType, null);
    }

    private async Task HandleMessage(BoardState board, string senderId, string message)
    {
        try
        {
            using var doc = JsonDocument.Parse(message);
            var messageType = doc.RootElement.TryGetProperty("type", out var typeEl)
                ? typeEl.GetString()
                : null;

            switch (messageType)
            {
                case "ping":
                    if (board.Participants.TryGetValue(senderId, out var sender))
                    {
                        await SendJson(sender.Socket, new { type = "pong" }, senderId, CancellationToken.None);
                    }
                    break;

                case "setReady":
                    await HandleSetReady(board, senderId, doc.RootElement);
                    break;

                case "syncState":
                    await HandleSyncState(board, message, doc.RootElement);
                    break;

                case "cardOp":
                case "vote":
                case "phaseChanged":
                    // Broadcast to others
                    await BroadcastMessage(board, senderId, message);
                    break;

                default:
                    // Unknown message type - ignore
                    break;
            }
        }
        catch (JsonException)
        {
            _logger.LogWarning("ws-invalid-json {ClientId}", senderId);
        }
    }

    private async Task HandleSetReady(BoardState board, string clientId, JsonElement root)
    {
        if (!root.TryGetProperty("ready", out var readyEl))
            return;

        var ready = readyEl.GetBoolean();

        if (board.Participants.TryGetValue(clientId, out var participant))
        {
            participant.IsReady = ready;

            await BroadcastParticipantsUpdate(board, clientId);
        }
    }

    private async Task HandleSyncState(BoardState board, string message, JsonElement root)
    {
        // Route to specific client if targetClientId is present
        if (root.TryGetProperty("targetClientId", out var targetEl))
        {
            var targetId = targetEl.GetString();
            if (targetId is not null && board.Participants.TryGetValue(targetId, out var target))
            {
                await SendRaw(target.Socket, message, targetId, CancellationToken.None);
            }
        }
        else
        {
            // Broadcast to all (rare case after join-time merge)
            foreach (var kvp in board.Participants)
            {
                await SendRaw(kvp.Value.Socket, message, kvp.Key, CancellationToken.None);
            }
        }
    }

    private async Task AckAndBroadcast(BoardState board, string senderId, JsonElement root, string message)
    {
        // Broadcast to all except sender
        await BroadcastMessage(board, senderId, message);
    }

    private async Task SendRaw(WebSocket webSocket, string message, string clientId, CancellationToken cancellationToken)
    {
        if (webSocket.State is not WebSocketState.Open)
            return;

        var bytes = Encoding.UTF8.GetBytes(message);
        LogProtocol("TX", clientId, message);
        await webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
    }

    private async Task BroadcastParticipantsUpdate(BoardState board, string? excludeClientId)
    {
        var update = new
        {
            type = "participantsUpdate",
            participantCount = board.Participants.Count,
            readyCount = board.Participants.Values.Count(p => p.IsReady)
        };

        var json = JsonSerializer.Serialize(update);

        var tasks = board.Participants
            .Where(kvp => excludeClientId is null || kvp.Key != excludeClientId)
            .Where(kvp => kvp.Value.Socket.State is WebSocketState.Open)
            .Select(kvp => SendRaw(kvp.Value.Socket, json, kvp.Key, CancellationToken.None));

        await Task.WhenAll(tasks);
    }

    private async Task BroadcastMessage(BoardState board, string excludeClientId, string message)
    {
        var tasks = board.Participants
            .Where(kvp => kvp.Key != excludeClientId && kvp.Value.Socket.State is WebSocketState.Open)
            .Select(kvp => SendRaw(kvp.Value.Socket, message, kvp.Key, CancellationToken.None));

        await Task.WhenAll(tasks);
    }

    private sealed class BoardState
    {
        public ConcurrentDictionary<string, ParticipantState> Participants { get; } = [];
    }

    private sealed class ParticipantState(WebSocket socket)
    {
        public WebSocket Socket { get; } = socket;
        public bool IsReady { get; set; }
        public DateTime LastActivity { get; set; } = DateTime.UtcNow;
    }

    private void LogProtocol(string direction, string clientId, string payload)
    {
        if (!_logger.IsEnabled(LogLevel.Information))
            return;

        var type = "unknown";
        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (doc.RootElement.TryGetProperty("type", out var typeEl))
            {
                type = typeEl.GetString() ?? "unknown";
            }
        }
        catch (JsonException)
        {
            type = "invalid-json";
        }

        _logger.LogInformation("ws-message {Direction} {ClientId} {Type} {Size} {Payload}",
            direction,
            clientId,
            type,
            Encoding.UTF8.GetByteCount(payload),
            payload);
    }
}
