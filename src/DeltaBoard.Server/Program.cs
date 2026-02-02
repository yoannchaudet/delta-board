using DeltaBoard.Server;
using Serilog;

// Logging
Log.Logger = new LoggerConfiguration()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .CreateLogger();

// Crash + log handling
try
{
    RunApp(args);
}
catch (Exception ex)
{
    Log.Fatal(ex, "Server terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

static void RunApp(string[] args)
{
    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog();
    builder.Services.AddSingleton<BoardHub>();

    var app = builder.Build();
    // Serilog
    app.UseSerilogRequestLogging();
    // WS
    app.UseWebSockets();
    // Serve static files from wwwroot
    app.UseDefaultFiles();
    app.UseStaticFiles();

    // WS endpoint
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

    // Board route (index is handled by default files)
    app.MapGet("/board/{boardId}", async context =>
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(
            Path.Combine(app.Environment.WebRootPath, "index.html"));
    });

    // Health check
    app.MapGet("/health", () => "OK");

    // Run
    app.Run();
}

// Make Program accessible for integration tests
public partial class Program;
