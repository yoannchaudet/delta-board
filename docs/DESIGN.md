# Delta Board - Design Documentation

This document covers the technical design and architecture of Delta Board.

## Architecture

Delta Board uses a unified deployment model where the server serves both the WebSocket API and the client application:

- **Server**: C# ASP.NET Core application that handles WebSocket connections and serves static files
- **Client**: Vanilla HTML/CSS/JavaScript served from the server's `wwwroot` folder
- **Data**: Operation-based event sourcing stored in browser localStorage
- **Sync**: Real-time operation broadcasting across all participants

This approach simplifies deployment (single artifact), eliminates CORS concerns, and reduces infrastructure complexity.

## Operation-Based Design

Instead of syncing entire board state, Delta Board broadcasts atomic operations:

- Create card
- Edit card
- Delete card
- Add vote
- Remove vote

This approach eliminates most concurrency issues and enables clean conflict resolution. Under the hood, we may leverage [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) (Conflict-free Replicated Data Types) as an implementation detail.

## Technology Stack

- **Server**: C# / .NET (ASP.NET Core with WebSocket support)
- **Client**: HTML5, CSS3, Vanilla JavaScript (ES6+ modules)
- **Communication**: WebSocket protocol (see [PROTOCOL.md](PROTOCOL.md) for details)
- **Storage**: Browser localStorage API
- **Testing**: xUnit (server), Vitest (client)

## URL Format

Boards use human-readable URLs with collision-resistant hashing, as an example:

```
deltaboard.app/#board-bright-delta-a3f9
```

## Limitations by Design

- Maximum 20 concurrent participants per board
- No server-side persistence (privacy feature)
- No authentication system (simplicity feature)
- Boards are ephemeral unless exported (minimalism feature)
