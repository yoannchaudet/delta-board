using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace DeltaBoard.Server;

public sealed class BoardHub
{
    private const int MaxParticipantsPerBoard = 20;
    private const int BufferSize = 64 * 1024; // 64KB for sync payloads
    private const int HelloTimeoutSeconds = 5;
    private const int InactivityTimeoutSeconds = 30;
    private const int ReceiveTimeoutSeconds = 10; // Check interval for inactivity

    // Board state: boardId → board data
    private readonly ConcurrentDictionary<string, BoardState> _boards = [];

    public async Task HandleConnection(string boardId, WebSocket webSocket, CancellationToken cancellationToken)
    {
        var board = _boards.GetOrAdd(boardId, _ => new BoardState());

        // Check capacity before handshake
        if (board.Participants.Count >= MaxParticipantsPerBoard)
        {
            await SendError(webSocket, "Board is full (max 20 participants)", cancellationToken);
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
            return; // Connection closed or invalid hello
        }

        // Check for duplicate clientId
        if (!board.Participants.TryAdd(clientId, new ParticipantState(webSocket)))
        {
            await SendError(webSocket, "Client ID already connected to this board", cancellationToken);
            await webSocket.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Duplicate client ID",
                cancellationToken);
            return;
        }

        try
        {
            // Send welcome
            await SendWelcome(webSocket, board, cancellationToken);

            // Notify existing participants
            await BroadcastParticipantsUpdate(board, null);

            // Main message loop
            await ReceiveMessages(board, clientId, webSocket, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            // Server shutting down or request aborted
        }
        finally
        {
            board.Participants.TryRemove(clientId, out _);
            await BroadcastParticipantsUpdate(board, clientId);

            if (board.Participants.IsEmpty)
            {
                _boards.TryRemove(boardId, out _);
            }
        }
    }

    private static async Task<string?> WaitForHello(WebSocket webSocket, CancellationToken cancellationToken)
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
            // Invalid JSON - fall through to close
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

    private static async Task SendWelcome(WebSocket webSocket, BoardState board, CancellationToken cancellationToken)
    {
        var welcome = new
        {
            type = "welcome",
            participantCount = board.Participants.Count,
            readyCount = board.Participants.Values.Count(p => p.IsReady)
        };

        await SendJson(webSocket, welcome, cancellationToken);
    }

    private static async Task SendError(WebSocket webSocket, string message, CancellationToken cancellationToken)
    {
        var error = new { type = "error", message };
        await SendJson(webSocket, error, cancellationToken);
    }

    private static async Task SendJson(WebSocket webSocket, object payload, CancellationToken cancellationToken)
    {
        if (webSocket.State is not WebSocketState.Open)
            return;

        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        await webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
    }

    private async Task ReceiveMessages(BoardState board, string clientId, WebSocket webSocket, CancellationToken cancellationToken)
    {
        var buffer = new byte[BufferSize];

        while (webSocket.State is WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var receiveCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                receiveCts.CancelAfter(TimeSpan.FromSeconds(ReceiveTimeoutSeconds));

                var (messageType, message) = await ReceiveMessage(webSocket, BufferSize, receiveCts.Token);

                // Update last activity timestamp
                if (board.Participants.TryGetValue(clientId, out var participant))
                {
                    participant.LastActivity = DateTime.UtcNow;
                }

                if (messageType is WebSocketMessageType.Close)
                {
                    await webSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Closing",
                        CancellationToken.None);
                    break;
                }

                if (messageType is WebSocketMessageType.Text && message is not null)
                {
                    await HandleMessage(board, clientId, message);
                }
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                // Receive timeout - check for inactivity
                if (board.Participants.TryGetValue(clientId, out var participant))
                {
                    var inactiveSeconds = (DateTime.UtcNow - participant.LastActivity).TotalSeconds;
                    if (inactiveSeconds >= InactivityTimeoutSeconds)
                    {
                        await webSocket.CloseAsync(
                            WebSocketCloseStatus.NormalClosure,
                            "Inactivity timeout",
                            CancellationToken.None);
                        break;
                    }
                }
            }
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
                        await SendJson(sender.Socket, new { type = "pong" }, CancellationToken.None);
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
                    // Ack the sender, then broadcast to others
                    await AckAndBroadcast(board, senderId, doc.RootElement, message);
                    break;

                default:
                    // Unknown message type - ignore
                    break;
            }
        }
        catch (JsonException)
        {
            // Invalid JSON - ignore
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

            // Send ack if opId is present
            if (root.TryGetProperty("opId", out var opIdEl))
            {
                var ack = new { type = "ack", opId = opIdEl.GetString() };
                await SendJson(participant.Socket, ack, CancellationToken.None);
            }

            await BroadcastParticipantsUpdate(board, clientId);
        }
    }

    private static async Task HandleSyncState(BoardState board, string message, JsonElement root)
    {
        // Route to specific client if targetClientId is present
        if (root.TryGetProperty("targetClientId", out var targetEl))
        {
            var targetId = targetEl.GetString();
            if (targetId is not null && board.Participants.TryGetValue(targetId, out var target))
            {
                await SendRaw(target.Socket, message, CancellationToken.None);
            }
        }
        else
        {
            // Broadcast to all (rare case after join-time merge)
            foreach (var participant in board.Participants.Values)
            {
                await SendRaw(participant.Socket, message, CancellationToken.None);
            }
        }
    }

    private async Task AckAndBroadcast(BoardState board, string senderId, JsonElement root, string message)
    {
        // Send ack to sender if opId is present
        if (root.TryGetProperty("opId", out var opIdEl) &&
            board.Participants.TryGetValue(senderId, out var sender))
        {
            var ack = new { type = "ack", opId = opIdEl.GetString() };
            await SendJson(sender.Socket, ack, CancellationToken.None);
        }

        // Broadcast to all except sender
        await BroadcastMessage(board, senderId, message);
    }

    private static async Task SendRaw(WebSocket webSocket, string message, CancellationToken cancellationToken)
    {
        if (webSocket.State is not WebSocketState.Open)
            return;

        var bytes = Encoding.UTF8.GetBytes(message);
        await webSocket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
    }

    private static async Task BroadcastParticipantsUpdate(BoardState board, string? excludeClientId)
    {
        var update = new
        {
            type = "participantsUpdate",
            participantCount = board.Participants.Count,
            readyCount = board.Participants.Values.Count(p => p.IsReady)
        };

        var json = JsonSerializer.Serialize(update);
        var bytes = Encoding.UTF8.GetBytes(json);

        var tasks = board.Participants
            .Where(kvp => excludeClientId is null || kvp.Key != excludeClientId)
            .Where(kvp => kvp.Value.Socket.State is WebSocketState.Open)
            .Select(kvp => SendRaw(kvp.Value.Socket, Encoding.UTF8.GetString(bytes), CancellationToken.None));

        await Task.WhenAll(tasks);
    }

    private static async Task BroadcastMessage(BoardState board, string excludeClientId, string message)
    {
        var tasks = board.Participants
            .Where(kvp => kvp.Key != excludeClientId && kvp.Value.Socket.State is WebSocketState.Open)
            .Select(kvp => SendRaw(kvp.Value.Socket, message, CancellationToken.None));

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
}
