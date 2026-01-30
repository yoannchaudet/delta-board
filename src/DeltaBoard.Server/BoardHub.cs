using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace DeltaBoard.Server;

public sealed class BoardHub
{
    private const int MaxParticipantsPerBoard = 20;
    private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, WebSocket>> _boards = [];

    public async Task HandleConnection(string boardId, WebSocket webSocket)
    {
        var connectionId = Guid.NewGuid().ToString();
        var board = _boards.GetOrAdd(boardId, _ => []);

        if (board.Count >= MaxParticipantsPerBoard)
        {
            await webSocket.CloseAsync(
                WebSocketCloseStatus.PolicyViolation,
                "Board is full (max 20 participants)",
                CancellationToken.None);
            return;
        }

        board.TryAdd(connectionId, webSocket);

        try
        {
            await ReceiveMessages(boardId, connectionId, webSocket);
        }
        finally
        {
            board.TryRemove(connectionId, out _);
            if (board.IsEmpty)
            {
                _boards.TryRemove(boardId, out _);
            }
        }
    }

    private async Task ReceiveMessages(string boardId, string senderId, WebSocket webSocket)
    {
        var buffer = new byte[64 * 1024]; // 64KB for potentially large sync payloads

        while (webSocket.State is WebSocketState.Open)
        {
            var result = await webSocket.ReceiveAsync(buffer, CancellationToken.None);

            if (result.MessageType is WebSocketMessageType.Close)
            {
                await webSocket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Closing",
                    CancellationToken.None);
                break;
            }

            if (result.MessageType is WebSocketMessageType.Text)
            {
                var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                await HandleMessage(boardId, senderId, message);
            }
        }
    }

    private async Task HandleMessage(string boardId, string senderId, string message)
    {
        try
        {
            var json = JsonNode.Parse(message);
            var messageType = json?["type"]?.GetValue<string>();

            switch (messageType)
            {
                case "requestSync":
                    // Broadcast to ALL clients - each will respond with their state
                    // Client merges all responses for resilience against partitioned clients
                    json!["_connectionId"] = senderId;
                    await BroadcastMessage(boardId, senderId, json.ToJsonString());
                    break;

                case "syncState":
                    // Route only to the requesting client
                    var targetId = json?["_targetConnectionId"]?.GetValue<string>();
                    if (!string.IsNullOrEmpty(targetId))
                    {
                        await SendToConnection(boardId, targetId, message);
                    }
                    break;

                default:
                    // Broadcast all other operations to everyone except sender
                    await BroadcastMessage(boardId, senderId, message);
                    break;
            }
        }
        catch (JsonException)
        {
            // Invalid JSON, broadcast as-is
            await BroadcastMessage(boardId, senderId, message);
        }
    }

    private async Task SendToConnection(string boardId, string connectionId, string message)
    {
        if (!_boards.TryGetValue(boardId, out var board))
            return;

        if (board.TryGetValue(connectionId, out var socket) && socket.State is WebSocketState.Open)
        {
            var messageBytes = Encoding.UTF8.GetBytes(message);
            await socket.SendAsync(
                messageBytes,
                WebSocketMessageType.Text,
                endOfMessage: true,
                CancellationToken.None);
        }
    }

    private async Task BroadcastMessage(string boardId, string senderId, string message)
    {
        if (!_boards.TryGetValue(boardId, out var board))
            return;

        var messageBytes = Encoding.UTF8.GetBytes(message);

        var sendTasks = board
            .Where(kvp => kvp.Key != senderId && kvp.Value.State is WebSocketState.Open)
            .Select(async kvp => await kvp.Value.SendAsync(
                messageBytes,
                WebSocketMessageType.Text,
                endOfMessage: true,
                CancellationToken.None));

        await Task.WhenAll(sendTasks);
    }
}
