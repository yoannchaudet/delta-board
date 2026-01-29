using DeltaBoard.Server;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<BoardHub>();

var app = builder.Build();

app.UseWebSockets();

app.Map("/ws/{boardId}", async (HttpContext context, BoardHub hub, string boardId) =>
{
    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        return;
    }

    using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
    await hub.HandleConnection(boardId, webSocket);
});

app.MapGet("/health", () => "OK");

app.Run();
