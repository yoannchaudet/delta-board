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

The server starts at `http://localhost:5173` and serves both the web application and WebSocket API.

### Run Tests

```bash
# Server tests (C#)
dotnet test

# Client tests (JavaScript)
npm install
npm test
```

## CI

GitHub Actions runs on every push to `main` and on pull requests:

- Build the .NET server
- Run .NET server tests (xUnit)
- Run JavaScript client tests (Vitest)

## Documentation

See [docs/DESIGN.md](docs/DESIGN.md) for detailed technical design and architecture.

## License

[MIT](LICENSE)
