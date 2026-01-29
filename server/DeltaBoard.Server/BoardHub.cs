using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;

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
        var buffer = new byte[4096];

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
                await BroadcastMessage(boardId, senderId, message);
            }
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
