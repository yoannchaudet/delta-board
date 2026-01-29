using DeltaBoard.Server;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<BoardHub>();

var app = builder.Build();

app.UseWebSockets();

// Serve static files from the client directory
var clientPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "..", "client"));
if (Directory.Exists(clientPath))
{
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = new PhysicalFileProvider(clientPath)
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(clientPath)
    });
}

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
