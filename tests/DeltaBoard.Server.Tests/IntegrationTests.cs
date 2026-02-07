using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Linq;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace DeltaBoard.Server.Tests;

public class IntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private static readonly Uri TestBaseAddress = new("http://localhost:5005");

    public IntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsOk()
    {
        // Arrange
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = TestBaseAddress
        });

        // Act
        var response = await client.GetAsync("/health");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal("OK", content);
    }

    [Fact]
    public async Task LandingPage_ReturnsHtml()
    {
        // Arrange
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = TestBaseAddress
        });

        // Act
        var response = await client.GetAsync("/");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("<!DOCTYPE html>", content);
        Assert.Contains("Delta Board", content);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/board/test-board-123")]
    public async Task HtmlRoutes_DoNotContainVersionPlaceholder(string path)
    {
        // Arrange
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = TestBaseAddress
        });

        // Act
        var response = await client.GetAsync(path);

        // Assert
        var content = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("{{VERSION}}", content);
    }

    [Fact]
    public async Task BoardRoute_ReturnsHtml()
    {
        // Arrange
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = TestBaseAddress
        });

        // Act
        var response = await client.GetAsync("/board/test-board-123");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);

        var content = await response.Content.ReadAsStringAsync();
        Assert.Contains("<!DOCTYPE html>", content);
        Assert.Contains("Delta Board", content);
    }

    [Fact]
    public async Task WebSocket_AcceptsConnectionAndHandshake()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"accept-test-{Guid.NewGuid():N}";

        // Act
        var ws = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        Assert.Equal(WebSocketState.Open, ws.State);

        // Send hello
        await SendJson(ws, new { type = "hello", clientId = "test-client-1" });

        // Receive welcome
        var welcome = await ReceiveJson(ws);

        // Assert
        Assert.Equal("welcome", welcome.GetProperty("type").GetString());
        Assert.Equal(1, welcome.GetProperty("participantCount").GetInt32());
        Assert.Equal(0, welcome.GetProperty("readyCount").GetInt32());

        // Cleanup
        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
    }

    [Fact]
    public async Task WebSocket_RejectsDuplicateClientId()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"dup-test-{Guid.NewGuid():N}";
        var clientId = "duplicate-client";

        // Connect first client
        var ws1 = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);
        await SendJson(ws1, new { type = "hello", clientId });
        var welcome1 = await ReceiveJson(ws1);
        Assert.Equal("welcome", welcome1.GetProperty("type").GetString());

        // Connect second client with same clientId
        var ws2 = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);
        await SendJson(ws2, new { type = "hello", clientId });

        // Should receive error
        var response = await ReceiveJson(ws2);
        Assert.Equal("error", response.GetProperty("type").GetString());
        Assert.Contains("already connected", response.GetProperty("message").GetString());

        // Connection should be closed
        var buffer = new byte[1024];
        var result = await ws2.ReceiveAsync(buffer, CancellationToken.None);
        Assert.Equal(WebSocketMessageType.Close, result.MessageType);

        // Cleanup
        await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
    }

    [Fact]
    public async Task WebSocket_EnforcesMaxParticipants()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"max-test-{Guid.NewGuid():N}";
        var connections = new List<WebSocket>();

        try
        {
            // Act - Connect 20 clients with handshake
            for (int i = 0; i < 20; i++)
            {
                var ws = await wsClient.ConnectAsync(
                    new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
                    CancellationToken.None);
                await SendJson(ws, new { type = "hello", clientId = $"client-{i}" });
                var welcome = await ReceiveMessageOfType(ws, "welcome");
                connections.Add(ws);
            }

            // Act - Try to connect 21st client (should be rejected before handshake)
            var extraWs = await wsClient.ConnectAsync(
                new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
                CancellationToken.None);

            // Should receive error immediately (board full)
            var response = await ReceiveJson(extraWs);
            Assert.Equal("error", response.GetProperty("type").GetString());

            // The server closes the connection
            var buffer = new byte[1024];
            var result = await extraWs.ReceiveAsync(buffer, CancellationToken.None);
            Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        }
        finally
        {
            // Cleanup - connections may already be closed by the server due to
            // participantsUpdate broadcasts racing with our cleanup
            foreach (var ws in connections)
            {
                try
                {
                    if (ws.State == WebSocketState.Open)
                    {
                        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
                    }
                }
                catch (Exception)
                {
                    // Connection already closed/disposed by server
                }
            }
        }
    }

    [Fact]
    public async Task WebSocket_BroadcastsCardOp()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"broadcast-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

        // ws1 should receive participantsUpdate when ws2 joins
        var update = await ReceiveMessageOfType(ws1, "participantsUpdate");
        Assert.True(update.GetProperty("participantCount").GetInt32() >= 1);

        try
        {
            // Act - Send cardOp from ws1
            await SendJson(ws1, new
            {
                type = "cardOp",
                opId = "op-1",
                cardId = "card-1",
                column = "well",
                text = "Test card",
                authorId = "client-1",
                rev = 1
            });

            // ws2 should receive the cardOp
            var received = await ReceiveMessageOfType(ws2, "cardOp");
            Assert.Equal("card-1", received.GetProperty("cardId").GetString());
            Assert.Equal("client-1", received.GetProperty("senderId").GetString());
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_BroadcastsVote()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"vote-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

        // Consume participantsUpdate on ws1
        await ReceiveJson(ws1);

        try
        {
            // Act - Send vote from ws1
            await SendJson(ws1, new
            {
                type = "vote",
                opId = "vote-op-1",
                cardId = "card-1",
                voterId = "client-1",
                rev = 1,
                isDeleted = false
            });

            // ws2 should receive the vote
            var received = await ReceiveMessageOfType(ws2, "vote");
            Assert.Equal("card-1", received.GetProperty("cardId").GetString());
            Assert.Equal("client-1", received.GetProperty("senderId").GetString());
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_SetReadyUpdatesParticipants()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"ready-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

        // Consume participantsUpdate on ws1 from ws2 joining
        await ReceiveJson(ws1);

        try
        {
            // Act - ws1 sets ready
            await SendJson(ws1, new { type = "setReady", isReady = true });

            // ws2 should receive participantsUpdate with readyCount = 1
            var update = await ReceiveParticipantsUpdate(ws2, expectedReadyCount: 1);
            Assert.Equal(2, update.GetProperty("participantCount").GetInt32());
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_RoutesSyncStateToTarget()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"sync-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");
        var ws3 = await ConnectAndHandshake(wsClient, boardId, "client-3");

        // Consume participantsUpdates
        await ReceiveJson(ws1); // ws2 joined
        await ReceiveJson(ws1); // ws3 joined
        await ReceiveJson(ws2); // ws3 joined

        try
        {
            // Act - ws1 sends syncState targeted at client-2
            await SendJson(ws1, new
            {
                type = "syncState",
                targetClientId = "client-2",
                state = new { phase = "forming", cards = Array.Empty<object>(), votes = Array.Empty<object>() }
            });

            // ws2 should receive the syncState
            var received = await ReceiveMessageOfType(ws2, "syncState");

            // ws3 should NOT receive it - verify by expecting timeout
            await AssertNoMessageOfType(ws3, "syncState", TimeSpan.FromMilliseconds(500));
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws3.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_NewClientJoin_TriggersParticipantsUpdateWithSyncForClientId()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"sync-notify-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");

        try
        {
            // Act - Connect second client
            var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

            // ws1 should receive participantsUpdate with syncForClientId = "client-2"
            var update = await ReceiveMessageOfType(ws1, "participantsUpdate");

            // Assert
            Assert.Equal(2, update.GetProperty("participantCount").GetInt32());
            Assert.True(update.TryGetProperty("syncForClientId", out var syncForEl));
            Assert.Equal("client-2", syncForEl.GetString());

            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_ClientLeave_ParticipantsUpdateHasNoSyncForClientId()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"leave-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

        // Consume the join participantsUpdate on ws1
        await ReceiveMessageOfType(ws1, "participantsUpdate");

        try
        {
            // Act - ws2 leaves
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Leaving", CancellationToken.None);

            // ws1 should receive participantsUpdate WITHOUT syncForClientId
            var update = await ReceiveMessageOfType(ws1, "participantsUpdate");

            // Assert
            Assert.Equal(1, update.GetProperty("participantCount").GetInt32());
            Assert.False(update.TryGetProperty("syncForClientId", out _));
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_PingPong()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"ping-test-{Guid.NewGuid():N}";

        var ws = await ConnectAndHandshake(wsClient, boardId, "client-1");

        try
        {
            // Act - Send ping
            await SendJson(ws, new { type = "ping" });

            // Should receive pong
            var pong = await ReceiveMessageOfType(ws, "pong");
        }
        finally
        {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_DoesNotAbortBeforeInactivityTimeout()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"idle-test-{Guid.NewGuid():N}";

        var ws = await ConnectAndHandshake(wsClient, boardId, "client-1");

        try
        {
            // Act - stay idle longer than the old receive timeout
            await Task.Delay(TimeSpan.FromSeconds(12));

            await SendJson(ws, new { type = "ping" });
            var pong = await ReceiveMessageOfType(ws, "pong", TimeSpan.FromSeconds(5));
            Assert.Equal("pong", pong.GetProperty("type").GetString());
        }
        finally
        {
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task WebSocket_HelloTimeout()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"timeout-test-{Guid.NewGuid():N}";

        // Act - Connect but don't send hello
        var ws = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        // Wait for timeout (5 seconds + buffer)
        var buffer = new byte[1024];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(7));
        var result = await ws.ReceiveAsync(buffer, cts.Token);

        // Assert - Connection should be closed due to timeout
        Assert.Equal(WebSocketMessageType.Close, result.MessageType);
        Assert.Equal(WebSocketCloseStatus.ProtocolError, ws.CloseStatus);
    }

    [Fact]
    public async Task WebSocket_AcceptsFragmentedHello()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"hello-frag-test-{Guid.NewGuid():N}";

        var ws = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        // Act - Send hello in two frames
        var payload = "{\"type\":\"hello\",\"clientId\":\"frag-client\"}";
        var part1 = Encoding.UTF8.GetBytes(payload.Substring(0, 10));
        var part2 = Encoding.UTF8.GetBytes(payload.Substring(10));
        await ws.SendAsync(part1, WebSocketMessageType.Text, false, CancellationToken.None);
        await ws.SendAsync(part2, WebSocketMessageType.Text, true, CancellationToken.None);

        // Assert - Receive welcome
        var welcome = await ReceiveJson(ws);
        Assert.Equal("welcome", welcome.GetProperty("type").GetString());
    }

    [Fact]
    public async Task WebSocket_HandlesFragmentedCardOp()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"cardop-frag-test-{Guid.NewGuid():N}";

        var ws1 = await ConnectAndHandshake(wsClient, boardId, "client-1");
        var ws2 = await ConnectAndHandshake(wsClient, boardId, "client-2");

        // Consume participantsUpdate on ws1 from ws2 joining
        await ReceiveJson(ws1);

        try
        {
            // Act - Send cardOp in two frames
            var payload = JsonSerializer.Serialize(new
            {
                type = "cardOp",
                opId = "op-frag-1",
                cardId = "card-1",
                column = "well",
                text = "Test card",
                authorId = "client-1",
                rev = 1
            });
            var bytes = Encoding.UTF8.GetBytes(payload);
            var split = bytes.Length / 2;
            await ws1.SendAsync(new ArraySegment<byte>(bytes, 0, split), WebSocketMessageType.Text, false, CancellationToken.None);
            await ws1.SendAsync(new ArraySegment<byte>(bytes, split, bytes.Length - split), WebSocketMessageType.Text, true, CancellationToken.None);

            // ws2 should receive the cardOp
            var received = await ReceiveMessageOfType(ws2, "cardOp");
            Assert.Equal("card-1", received.GetProperty("cardId").GetString());
        }
        finally
        {
            await ws1.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
            await ws2.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
        }
    }

    [Fact]
    public async Task NonWebSocketRequest_ToBoardWsEndpoint_Returns400()
    {
        // Arrange
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = TestBaseAddress
        });

        // Act - Regular HTTP request to WebSocket endpoint
        var response = await client.GetAsync("/board/test-board/ws");

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // Helper methods

    private async Task<WebSocket> ConnectAndHandshake(Microsoft.AspNetCore.TestHost.WebSocketClient wsClient, string boardId, string clientId)
    {
        var ws = await wsClient.ConnectAsync(
            new Uri(TestBaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        await SendJson(ws, new { type = "hello", clientId });
        var welcome = await ReceiveMessageOfType(ws, "welcome");

        return ws;
    }

    private static async Task SendJson(WebSocket ws, object payload)
    {
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static async Task<JsonElement> ReceiveJson(WebSocket ws)
    {
        var buffer = new byte[4096];
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var result = await ws.ReceiveAsync(buffer, cts.Token);

        if (result.MessageType == WebSocketMessageType.Close)
        {
            throw new InvalidOperationException($"WebSocket closed: {ws.CloseStatus} - {ws.CloseStatusDescription}");
        }

        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
        return JsonDocument.Parse(json).RootElement;
    }

    private static async Task<JsonElement> ReceiveJsonWithTimeout(WebSocket ws, TimeSpan timeout)
    {
        var buffer = new byte[4096];
        using var cts = new CancellationTokenSource(timeout);
        var result = await ws.ReceiveAsync(buffer, cts.Token);

        var json = Encoding.UTF8.GetString(buffer, 0, result.Count);
        return JsonDocument.Parse(json).RootElement;
    }

    private static async Task<JsonElement> ReceiveMessageOfType(WebSocket ws, string expectedType, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(5));
        while (true)
        {
            try
            {
                var message = await ReceiveJsonWithTimeout(ws, TimeSpan.FromMilliseconds(250));
                if (message.TryGetProperty("type", out var typeEl) &&
                    typeEl.GetString() == expectedType)
                {
                    return message;
                }
            }
            catch (OperationCanceledException)
            {
                // No message in this slice; keep waiting.
            }
            catch (TimeoutException)
            {
                // No matching message in this slice; keep waiting.
            }

            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException($"Timed out waiting for message type '{expectedType}'.");
            }
        }
    }

    private static async Task<JsonElement> ReceiveParticipantsUpdate(WebSocket ws, int? expectedParticipantCount = null, int? expectedReadyCount = null)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(5);
        while (true)
        {
            try
            {
                var update = await ReceiveMessageOfType(ws, "participantsUpdate", TimeSpan.FromMilliseconds(250));
                var participantCount = update.GetProperty("participantCount").GetInt32();
                var readyCount = update.GetProperty("readyCount").GetInt32();

                if ((expectedParticipantCount is null || participantCount == expectedParticipantCount) &&
                    (expectedReadyCount is null || readyCount == expectedReadyCount))
                {
                    return update;
                }
            }
            catch (OperationCanceledException)
            {
                // No message in this slice; keep waiting.
            }

            if (DateTime.UtcNow >= deadline)
            {
                throw new TimeoutException("Timed out waiting for participantsUpdate with expected counts.");
            }
        }
    }

    private static async Task AssertNoMessageOfType(WebSocket ws, string unexpectedType, TimeSpan duration)
    {
        var deadline = DateTime.UtcNow + duration;
        while (DateTime.UtcNow < deadline)
        {
            try
            {
                var message = await ReceiveJsonWithTimeout(ws, TimeSpan.FromMilliseconds(100));
                if (message.TryGetProperty("type", out var typeEl) &&
                    typeEl.GetString() == unexpectedType)
                {
                    throw new InvalidOperationException($"Unexpected message type '{unexpectedType}' received.");
                }
            }
            catch (OperationCanceledException)
            {
                // No message in this slice; keep waiting.
            }
        }
    }
}
