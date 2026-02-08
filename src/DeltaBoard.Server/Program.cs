using System.Reflection;
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
    app.UseStaticFiles();

    // Read assembly version and prepare index.html + sw.js with version stamp
    var version = Assembly.GetExecutingAssembly()
        .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "unknown version";
    var indexHtml = File.ReadAllText(Path.Combine(app.Environment.WebRootPath, "index.html"))
        .Replace("{{VERSION}}", version);
    var swJs = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "sw.js"))
        .Replace("{{VERSION}}", version);

    // Landing page
    app.MapGet("/", context =>
    {
        context.Response.ContentType = "text/html";
        return context.Response.WriteAsync(indexHtml);
    });

    // Service worker (version-stamped, must not be cached by browser)
    app.MapGet("/sw.js", context =>
    {
        context.Response.ContentType = "application/javascript";
        context.Response.Headers.CacheControl = "no-cache";
        return context.Response.WriteAsync(swJs);
    });

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
    app.MapGet("/board/{boardId}", context =>
    {
        context.Response.ContentType = "text/html";
        return context.Response.WriteAsync(indexHtml);
    });

    // Health check
    app.MapGet("/health", () => "OK");

    // 404 fallback
    app.MapFallback(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(
            Path.Combine(app.Environment.WebRootPath, "404.html"));
    });

    // Run
    app.Run();
}

// Make Program accessible for integration tests
public partial class Program;
