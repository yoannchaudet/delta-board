# Delta Board

A lightweight, privacy-first retrospective tool for teams to collaboratively reflect on their work.

## Philosophy

- **Lightweight** - Minimal dependencies, fast loading, simple architecture
- **Minimalist** - Two columns: What Went Well and Delta (what to adjust)
- **Single Purpose** - Built specifically for retrospectives, nothing more
- **Privacy Aware** - No server-side data storage, all data lives in your browser

## How It Works

1. **Create a board** - Generate a unique URL instantly, no signup required
2. **Share with your team** - Send the URL to participants (up to 20 people)
3. **Collaborate in real-time** - Add cards, vote on items, discuss improvements
4. **Export and close** - Download as Markdown when done

## Key Features

- **Real-time collaboration** via WebSockets
- **Persistent local storage** - Your boards survive browser restarts
- **Voting system** - Prioritize what matters most
- **Card ownership** - Edit your own cards, vote on anyone's
- **Export to Markdown** - Archive your retrospectives
- **No accounts** - Anonymous, instant access

## Project Structure

```
delta-board/
├── src/
│   └── DeltaBoard.Server/       # C# server (serves API + static files)
│       ├── wwwroot/             # Client web application
│       │   ├── index.html
│       │   ├── 404.html
│       │   ├── css/
│       │   │   ├── shared.css
│       │   │   └── styles.css
│       │   └── js/
│       │       └── app.js
│       ├── Program.cs
│       ├── BoardHub.cs
│       └── DeltaBoard.Server.csproj
├── tests/
│   ├── DeltaBoard.Server.Tests/ # C# xUnit tests
│   └── client/                  # JavaScript Vitest tests
├── docs/
│   ├── DESIGN.md               # Technical design documentation
│   └── PROTOCOL.md             # WebSocket protocol specification
├── package.json                # JS test tooling
├── vitest.config.js
└── delta-board.sln
```

## Getting Started

### Run the Server

```bash
cd src/DeltaBoard.Server
dotnet run
```

The server starts at `http://localhost:5123` and serves both the web application and WebSocket API.

### Run Tests

```bash
# Server tests (C#)
dotnet test

# Client tests (JavaScript)
npm install
npm test
```

### Run with Docker

```bash
# Build the image
docker build -t delta-board .

# Run it
docker run -p 8080:8080 delta-board
```

The server starts at `http://localhost:8080`. The container listens on port 8080 by default (configurable via `ASPNETCORE_HTTP_PORTS`).

## CI

GitHub Actions runs on every push to `main` and on pull requests:

- Build the .NET server
- Run .NET server tests (xUnit)
- Run JavaScript client tests (Vitest)

## Releases

When a [GitHub release](https://docs.github.com/en/repositories/releasing-projects-on-github) is published, a workflow builds a multi-platform Docker image (`linux/amd64`, `linux/arm64`) and pushes it to GHCR.

| Release type | Example tag        | Container tags    |
| ------------ | ------------------ | ----------------- |
| Pre-release  | `v0.1.0-preview.1` | `0.1.0-preview.1` |
| Stable       | `v1.0.0`           | `1.0.0`, `latest` |

```bash
# Pull and run a specific version
docker run -p 8080:8080 ghcr.io/yoannchaudet/delta-board:1.0.0
```

## Version Display

Container images built from releases embed the Git tag as the app version, shown in the footer. Local dev builds (`dotnet run`) show no version.

## Documentation

See [docs/DESIGN.md](docs/DESIGN.md) for detailed technical design and architecture.

## License

[MIT](LICENSE)
