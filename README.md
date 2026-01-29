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
├── server/              # C# WebSocket server
│   ├── DeltaBoard.Server/
│   └── README.md
├── client/              # Web application
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── README.md
├── docs/
│   └── DESIGN.md       # Detailed design documentation
└── README.md
```

## Getting Started

### Server

```bash
cd server/DeltaBoard.Server
dotnet run
```

### Client

Simply open `client/index.html` in a browser, or serve via any static file server.

## Documentation

See [docs/DESIGN.md](docs/DESIGN.md) for detailed technical design and architecture.

## License

[MIT](LICENSE)
