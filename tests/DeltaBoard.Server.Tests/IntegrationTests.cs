using System.Net;
using System.Net.WebSockets;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace DeltaBoard.Server.Tests;

public class IntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public IntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsOk()
    {
        // Arrange
        var client = _factory.CreateClient();

        // Act
        var response = await client.GetAsync("/health");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var content = await response.Content.ReadAsStringAsync();
        Assert.Equal("OK", content);
    }

    [Fact]
    public async Task BoardRoute_ReturnsHtml()
    {
        // Arrange
        var client = _factory.CreateClient();

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
    public async Task WebSocket_AcceptsConnection()
    {
        // Arrange
        var client = _factory.CreateClient();
        var wsClient = _factory.Server.CreateWebSocketClient();

        // Act
        var ws = await wsClient.ConnectAsync(
            new Uri(_factory.Server.BaseAddress, "/board/test-board/ws"),
            CancellationToken.None);

        // Assert
        Assert.Equal(WebSocketState.Open, ws.State);

        // Cleanup
        await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
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
            // Act - Connect 20 clients (should all succeed)
            for (int i = 0; i < 20; i++)
            {
                var ws = await wsClient.ConnectAsync(
                    new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
                    CancellationToken.None);
                Assert.Equal(WebSocketState.Open, ws.State);
                connections.Add(ws);
            }

            // Act - Try to connect 21st client (should be rejected)
            var extraWs = await wsClient.ConnectAsync(
                new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
                CancellationToken.None);

            // The server closes the connection with PolicyViolation
            // We need to receive to see the close status
            var buffer = new byte[1024];
            var result = await extraWs.ReceiveAsync(buffer, CancellationToken.None);

            // Assert
            Assert.Equal(WebSocketMessageType.Close, result.MessageType);
            Assert.Equal(WebSocketCloseStatus.PolicyViolation, extraWs.CloseStatus);
            Assert.Contains("max 20", extraWs.CloseStatusDescription);
        }
        finally
        {
            // Cleanup
            foreach (var ws in connections)
            {
                if (ws.State == WebSocketState.Open)
                {
                    await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Test complete", CancellationToken.None);
                }
            }
        }
    }

    [Fact]
    public async Task WebSocket_BroadcastsMessages()
    {
        // Arrange
        var wsClient = _factory.Server.CreateWebSocketClient();
        var boardId = $"broadcast-test-{Guid.NewGuid():N}";

        var ws1 = await wsClient.ConnectAsync(
            new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);
        var ws2 = await wsClient.ConnectAsync(
            new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        try
        {
            // Act - Send message from ws1
            var message = """{"type":"createCard","card":{"id":"test-card","text":"Hello"}}""";
            var sendBuffer = System.Text.Encoding.UTF8.GetBytes(message);
            await ws1.SendAsync(sendBuffer, WebSocketMessageType.Text, true, CancellationToken.None);

            // Assert - ws2 should receive the message
            var receiveBuffer = new byte[1024];
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var result = await ws2.ReceiveAsync(receiveBuffer, cts.Token);

            Assert.Equal(WebSocketMessageType.Text, result.MessageType);
            var received = System.Text.Encoding.UTF8.GetString(receiveBuffer, 0, result.Count);
            Assert.Contains("createCard", received);
            Assert.Contains("test-card", received);
        }
        finally
        {
            // Cleanup
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

        var ws1 = await wsClient.ConnectAsync(
            new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);
        var ws2 = await wsClient.ConnectAsync(
            new Uri(_factory.Server.BaseAddress, $"/board/{boardId}/ws"),
            CancellationToken.None);

        try
        {
            // Act - ws1 sends requestSync, which should be broadcast with connection ID
            var requestSync = """{"type":"requestSync"}""";
            await ws1.SendAsync(
                System.Text.Encoding.UTF8.GetBytes(requestSync),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);

            // ws2 receives the requestSync with _connectionId
            var buffer = new byte[1024];
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            var result = await ws2.ReceiveAsync(buffer, cts.Token);

            var received = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
            Assert.Contains("requestSync", received);
            Assert.Contains("_connectionId", received);
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
        var client = _factory.CreateClient();

        // Act - Regular HTTP request to WebSocket endpoint
        var response = await client.GetAsync("/board/test-board/ws");

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
