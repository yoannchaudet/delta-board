# Delta Board - Design Documentation

This document covers the technical design and architecture of Delta Board.

## Architecture

- **Server**: Lightweight C# WebSocket broker (message routing only, no data storage)
- **Client**: Vanilla HTML/CSS/JavaScript (no build step, no frameworks)
- **Data**: Operation-based event sourcing stored in browser localStorage
- **Sync**: Real-time operation broadcasting across all participants

## Operation-Based Design

Instead of syncing entire board state, Delta Board broadcasts atomic operations:

- Create card
- Edit card
- Delete card
- Add vote
- Remove vote

This approach eliminates most concurrency issues and enables clean conflict resolution. Under the hood, we may leverage [CRDTs](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) (Conflict-free Replicated Data Types) as an implementation detail.

## Technology Stack

- **Server**: C# / .NET (WebSocket support)
- **Client**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Communication**: WebSocket protocol
- **Storage**: Browser localStorage API

## URL Format

Boards use human-readable URLs with collision-resistant hashing, as an example:

```
deltaboard.app/retro-bright-delta-a3f9
```

## Limitations by Design

- Maximum 20 concurrent participants per board
- No server-side persistence (privacy feature)
- No authentication system (simplicity feature)
- Boards are ephemeral unless exported (minimalism feature)
