# Implementation Plan: Protocol Redesign

This plan implements the redesigned protocol (PROTOCOL.md) and lifecycle (LIFE_CYCLE.md) for the board editing experience. No backwards compatibility with existing boards.

## Scope

**In scope:**
- Board WebSocket connection and messaging
- State management and synchronization
- Conflict resolution (LWW with revisions)
- Board phases (forming/reviewing)
- Presence and readiness

**Out of scope:**
- Landing page / board list (already working)
- Visual design changes

---

## Phase 1: Foundation

### 1.1 Define New State Types

**File:** `wwwroot/js/types.js` (new)

```javascript
// State shape
{
  phase: "forming" | "reviewing",
  cards: [
    {
      id: string,
      column: "well" | "delta",
      text: string,
      authorId: string,      // clientId of creator
      rev: number,           // monotonic revision
      isDeleted: boolean     // tombstone flag
    }
  ],
  votes: [
    {
      odId: string,          // `${cardId}:${voterId}`
      cardId: string,
      voterId: string,       // clientId of voter
      rev: number,
      isDeleted: boolean
    }
  ]
}
```

**Tasks:**
- [x] Create `types.js` with JSDoc type definitions
- [x] Create `createEmptyState()` factory function
- [x] Create `createCard(column, text, authorId)` factory
- [x] Create `createVote(cardId, voterId)` factory

### 1.2 Server Presence Tracking

**File:** `BoardHub.cs`

The server currently tracks connections but not client identity. Add:

**Tasks:**
- [x] Add `ConcurrentDictionary<string, HashSet<string>>` to track `boardId → Set<clientId>`
- [x] Parse `hello` message to extract `clientId`
- [x] Reject duplicate `clientId` per board (send `error`, close connection)
- [x] Send `welcome` with `participantCount` and `readyCount` (initially 0)
- [x] Broadcast `participantsUpdate` on join/leave to all other clients (initiator relies on `welcome`)
- [x] Track readiness state per client: `boardId → clientId → isReady`

### 1.3 Client Connection Handshake

**File:** `wwwroot/js/connection.js` (new, replaces WebSocket code in app.js)

**Tasks:**
- [x] Generate/persist `clientId` in localStorage
- [x] On connect: send `hello { clientId }`
- [x] Wait for `welcome` before considering connection ready
- [x] Store `participantCount` and `readyCount` from welcome
- [x] Handle `participantsUpdate` messages
- [x] Implement connection state machine: `connecting → handshaking → ready → closed`

### 1.4 Heartbeat

**Files:** `BoardHub.cs`, `wwwroot/js/connection.js`

**Tasks:**
- [x] Client: send `ping` every 10 seconds when connected
- [x] Server: respond with `pong`
- [x] Server: track last message time per connection, close after 30s inactivity
- [x] Client: detect missed pongs, trigger reconnect

---

## Phase 2: Sync & Conflict Resolution

### 2.1 LWW Merge Logic

**File:** `wwwroot/js/merge.js` (new, replaces sync.js)

Implement merge rules from PROTOCOL.md:

**Tasks:**
- [x] `mergeCard(local, remote)` — compare rev, then authorId, then isDeleted
- [x] `mergeVote(local, remote)` — compare rev, then voterId, then isDeleted
- [x] `mergePhase(local, remote)` — reviewing always wins
- [x] `mergeState(local, remote)` — merge all cards, votes, phase
- [x] Unit tests for merge edge cases

### 2.2 Join-Time Sync Flow

**File:** `wwwroot/js/sync.js` (rewrite)

**Tasks:**
- [x] On `welcome`: request sync from existing clients (server notifies them)
- [x] Buffer incoming `cardOp`/`vote` messages during sync window (1-2s)
- [x] Collect `syncState` messages, merge them all
- [x] After sync window: apply buffered operations
- [x] If local state changed from merge: broadcast `syncState` once

### 2.3 opId Deduplication

**File:** `wwwroot/js/dedup.js` (new)

**Tasks:**
- [x] Maintain `Set<string>` of seen opIds (in-memory, session lifetime)
- [x] Check opId before applying any operation
- [x] Generate unique opIds: `${clientId}:${timestamp}:${counter}`

---

## Phase 3: Operations

### 3.1 Card Operations

**File:** `wwwroot/js/operations.js` (rewrite)

Replace `createCard`/`editCard`/`deleteCard` with unified `cardOp`:

**Tasks:**
- [ ] `applyCardOp(state, op)` — handles create/edit/delete based on presence and rev
- [ ] Local operations increment rev before broadcast
- [ ] Remote operations use LWW merge
- [ ] Tombstone deleted cards (don't remove from array)
- [ ] Filter tombstones in UI queries: `getVisibleCards(state, column)`

### 3.2 Vote Operations

**File:** `wwwroot/js/operations.js`

**Tasks:**
- [ ] `applyVote(state, op)` — add or remove vote
- [ ] Vote entity model: one entry per (cardId, voterId) pair
- [ ] Tombstone removed votes
- [ ] `getVoteCount(state, cardId)` — count non-deleted votes
- [ ] `hasVoted(state, cardId, voterId)` — check vote exists and not deleted

### 3.3 Message Broadcasting

**File:** `wwwroot/js/connection.js`

**Tasks:**
- [ ] `broadcast(message)` — add opId, send via WebSocket
- [ ] Handle incoming messages by type: `cardOp`, `vote`, `syncState`, `participantsUpdate`, etc.
- [ ] Route to appropriate handlers

---

## Phase 4: Phases & Readiness

### 4.1 Readiness Toggle

**Files:** `wwwroot/js/app.js`, `BoardHub.cs`

**Tasks:**
- [ ] Add "Ready" button to UI
- [ ] Send `setReady { ready: true/false }` on toggle
- [ ] Server tracks readiness, broadcasts `participantsUpdate`
- [ ] Display ready count in UI: "X of Y ready"

### 4.2 Phase Transition

**Files:** `wwwroot/js/app.js`, `wwwroot/js/operations.js`

**Tasks:**
- [ ] Calculate quorum threshold: `ceil(0.6 * participantCount)` (min 1 for solo, both for 2)
- [ ] When quorum reached: any ready client may broadcast `phaseChanged { phase: "reviewing" }`
- [ ] `applyPhaseChanged(state, op)` — transition to reviewing (monotonic)
- [ ] Persist phase in state

### 4.3 Phase Enforcement

**File:** `wwwroot/js/app.js`

**Tasks:**
- [ ] In reviewing phase: disable card creation, editing, deletion
- [ ] In reviewing phase: disable voting
- [ ] In reviewing phase: hide ready button
- [ ] Visual indication of current phase

---

## Phase 5: Polish

### 5.1 Duplicate Tab Prevention

**File:** `wwwroot/js/connection.js`

**Tasks:**
- [ ] Use Web Locks API: `navigator.locks.request(`delta-board-${boardId}`, ...)`
- [ ] If lock unavailable: show error, don't connect
- [ ] Fallback for browsers without Web Locks: server-side rejection (already in 1.2)

### 5.2 Reconnection

**File:** `wwwroot/js/connection.js`

**Tasks:**
- [ ] On disconnect: attempt reconnect with exponential backoff (existing logic)
- [ ] On reconnect: go through full handshake + sync flow
- [ ] Preserve local state across reconnects

### 5.3 Old Board Handling

**File:** `wwwroot/js/app.js`

**Tasks:**
- [ ] Detect old board format in localStorage (missing `phase`, `rev` fields)
- [ ] Show message: "This board uses an old format. Please create a new board."
- [ ] Optionally: offer to delete old board data

### 5.4 UI Updates

**File:** `wwwroot/index.html`, `wwwroot/css/styles.css`

**Tasks:**
- [ ] Add participant count display
- [ ] Add ready count display
- [ ] Add ready toggle button
- [ ] Add phase indicator
- [ ] Style disabled state for reviewing phase

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `wwwroot/js/types.js` | Create | Type definitions and factories |
| `wwwroot/js/connection.js` | Create | WebSocket + handshake + heartbeat |
| `wwwroot/js/merge.js` | Create | LWW merge logic |
| `wwwroot/js/dedup.js` | Create | opId deduplication |
| `wwwroot/js/sync.js` | Rewrite | Join-time sync flow |
| `wwwroot/js/operations.js` | Rewrite | cardOp, vote, phase operations |
| `wwwroot/js/app.js` | Rewrite | UI logic, phase enforcement |
| `wwwroot/js/board.js` | Delete | Merged into other modules |
| `BoardHub.cs` | Modify | Presence, readiness, hello/welcome |
| `wwwroot/index.html` | Modify | New UI elements |
| `wwwroot/css/styles.css` | Modify | Phase/readiness styling |

---

## Implementation Order

Execute phases sequentially. Within each phase, tasks can often be parallelized.

Recommended order for Phase 1:
1. `types.js` (no dependencies)
2. Server changes to `BoardHub.cs` (hello/welcome/presence)
3. `connection.js` (depends on server changes)
4. Heartbeat (both sides)

After Phase 1, the app won't work until Phase 2-3 are complete. Consider feature-flagging or a separate branch.

---

## Testing Strategy

- **Unit tests:** Merge logic (Phase 2.1) is critical — test all edge cases
- **Integration tests:** Extend existing `IntegrationTests.cs` for new message types
- **Manual testing:** Multi-tab scenarios, reconnection, phase transitions

---

## Migration Notes

- Old localStorage keys (`deltaboard-{id}`) will be ignored or flagged
- No server-side data to migrate (stateless relay)
- Users create fresh boards after upgrade
