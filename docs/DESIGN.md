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

Delta Board broadcasts atomic operations rather than syncing a single authoritative board snapshot.

This reduces merge complexity, but convergence still requires handling unreliable networks. The protocol is designed to tolerate loss, duplication, and out of order delivery.

Key properties:

- Operations are idempotent via a unique `opId`
- Senders retry operations until the server acknowledges receipt
- Card edits use a per card monotonically increasing `rev` so late operations cannot overwrite newer ones
- Vote state converges by unioning voter IDs

CRDTs may be used as a future implementation detail, but the current design relies on simple idempotency, retries, and per entity revisions.

## Technology Stack

- **Server**: C# / .NET (ASP.NET Core with WebSocket support)
- **Client**: HTML5, CSS3, Vanilla JavaScript (ES6+ modules)
- **Communication**: WebSocket protocol (see [PROTOCOL.md](PROTOCOL.md) for details)
- **Storage**: Browser localStorage API
- **Testing**: xUnit (server), Vitest (client)

### Local Storage Schema

Client state is persisted in localStorage using a versioned schema.
Clients should store a `schemaVersion` alongside board data and reset or migrate when the stored version is unsupported.

## URL Format

Boards use human-readable URLs with collision-resistant hashing:

```
<domain>/board/sleepy-penguin-a3f9
```

- **Board route**: `/board/{id}` - serves the SPA for a specific board
- **WebSocket**: `/board/{id}/ws` - real-time collaboration endpoint
- **Board ID format**: `{adjective}-{noun}-{hash}` (e.g., `cosmic-waffle-x7k2`)
- **Total combinations**: 20 adjectives × 20 nouns × 36⁴ = 671,846,400 unique boards

## Limitations by Design

- Maximum 20 concurrent participants per board
- No server-side persistence (privacy feature)
- No authentication system (simplicity feature)
- Boards are ephemeral unless exported (minimalism feature)
