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
- Senders do not wait for acknowledgments; operations are eventually consistent
- Card edits use a per card monotonically increasing `rev` so late operations cannot overwrite newer ones
- Vote state converges with an LWW boolean per (cardId, voterId) using a monotonic rev

CRDTs may be used as a future implementation detail, but the current design relies on simple idempotency, retries, and per entity revisions.

## Technology Stack

- **Server**: C# / .NET (ASP.NET Core with WebSocket support)
- **Client**: HTML5, CSS3, Vanilla JavaScript (ES6+ modules)
- **Communication**: WebSocket protocol (see [PROTOCOL.md](PROTOCOL.md) for details)
- **Storage**: Browser localStorage API
- **Testing**: xUnit (server), Vitest (client)

### Local Storage Schema

Client state is persisted in localStorage using a versioned schema.
Each board carries a `version` field (currently `1`). Boards loaded without a version are treated as version `1`.
When the schema changes in the future, clients can migrate or reset boards with an unsupported version.

## URL Format

Boards use human-readable URLs with collision-resistant hashing:

```
<domain>/board/sleepy-penguin-a3f9
```

- **Board route**: `/board/{id}` - serves the SPA for a specific board
- **WebSocket**: `/board/{id}/ws` - real-time collaboration endpoint
- **Fallback**: Any unmatched route returns a server-rendered 404 page
- **Board ID format**: `{adjective}-{noun}-{hash}` (e.g., `cosmic-waffle-x7k2`)
- **Total combinations**: 20 adjectives × 20 nouns × 36⁴ = 671,846,400 unique boards

## Container Deployment

The server is packaged as a multi-stage Docker image (Alpine-based, self-contained single-file publish).

- **Local development**: `dotnet run` reads `launchSettings.json` and binds to `http://localhost:5123`
- **Container**: No Kestrel override in `appsettings.json`, so .NET defaults to port 8080 on all interfaces
- **Port override**: Set `ASPNETCORE_HTTP_PORTS` environment variable to change the listening port

### Release Pipeline

A GitHub Actions workflow (`.github/workflows/release.yml`) publishes container images to GHCR on every GitHub release:

- **Trigger**: `release` → `published` event
- **Auth**: Built-in `GITHUB_TOKEN` (no additional secrets required)
- **Platforms**: `linux/amd64` and `linux/arm64` via QEMU + buildx
- **Tagging**: `docker/metadata-action` strips the `v` prefix from the git tag (e.g. `v1.0.0` → `1.0.0`). The `latest` tag is only applied to non-pre-release versions.

### Azure Container Apps

When deploying to Azure Container Apps:

- Set ingress transport to **HTTP** (HTTP/1.1) — `auto` and `http2` break WebSocket upgrades
- Set target port to **8080** to match the container's default listening port
- The app implements ping/pong keepalives (30s interval) which prevents Azure's 240s idle timeout from disconnecting WebSocket clients
- Enable sticky sessions if scaling to multiple replicas

## Limitations by Design

- Maximum 20 concurrent participants per board
- No server-side persistence (privacy feature)
- No authentication system (simplicity feature)
- Boards are ephemeral unless exported (minimalism feature)
