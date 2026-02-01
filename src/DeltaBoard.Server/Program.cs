using DeltaBoard.Server;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<BoardHub>();

builder.WebHost.UseUrls("http://localhost:5173");

var app = builder.Build();

app.UseWebSockets();

// Serve static files from wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

// WebSocket endpoint for board collaboration
app.Map("/board/{boardId}/ws", async (HttpContext context, BoardHub hub, IHostApplicationLifetime lifetime, string boardId) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    // Link request abort with application shutdown for fast cleanup
    using var cts = CancellationTokenSource.CreateLinkedTokenSource(
        context.RequestAborted,
        lifetime.ApplicationStopping);

    using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
    await hub.HandleConnection(boardId, webSocket, cts.Token);
});

// SPA fallback: serve index.html for board routes
app.MapGet("/board/{boardId}", async context =>
{
    context.Response.ContentType = "text/html";
    await context.Response.SendFileAsync(
        Path.Combine(app.Environment.WebRootPath, "index.html"));
});

app.MapGet("/health", () => "OK");

app.Run();

// Make Program accessible for integration tests
public partial class Program;
