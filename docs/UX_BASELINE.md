# UX behavior baseline

This document defines the user-visible contract that must remain stable while Delta
Board's interface changes. Automated checks cover the deterministic items. The release
checklist covers device-, browser-, and assistive-technology-specific behavior.

The baseline complements [DESIGN.md](DESIGN.md), [LIFE_CYCLE.md](LIFE_CYCLE.md), and
[PROTOCOL.md](PROTOCOL.md). An item marked **existing defect** is observed behavior, not
a requirement to preserve the defect. An item marked **proposed change** requires
separate approval and updated acceptance evidence.

## Landing and board lifecycle

| State | Action | Required result |
| --- | --- | --- |
| Landing page | Create a board | Navigate to a unique `/board/{id}` URL and persist an empty forming board locally. |
| Landing page with saved boards | Reopen a board | Navigate to that board with its locally persisted cards, votes, and phase. |
| Saved board | Delete it and confirm | Remove only that local board. Other participants and their data are unaffected. |
| Reviewing board | Clone it | Create a new forming board. The native prompt's OK path retains votes; its Cancel path clears votes. |
| Unknown route | Navigate directly | Return the branded 404 page with HTTP 404. |

The clone prompt's use of “Cancel” to mean “clear votes” is an **existing defect**. A
future copy or interaction change must be reviewed separately.

## Forming phase

| Action | Local result | Peer result |
| --- | --- | --- |
| Add a Went Well or Delta card | The trimmed text appears in the selected column and persists across reload. | Connected peers receive the same card. |
| Press Ctrl/Cmd+Enter | Add to Went Well. | Same as clicking the Went Well action. |
| Press Ctrl/Cmd+Shift+Enter | Add to Delta. | Same as clicking the Delta action. |
| Edit an owned card | Save text and optionally move columns with a higher revision. Escape, Cancel, or the overlay abandons the edit. | Peers converge on the edit. |
| Delete an owned card and confirm | Hide its tombstoned card and remove its active votes. | Peers converge on the deletion. |
| View another participant's card | Do not show edit or delete actions. | Ownership remains tied to the persistent client identity. |
| Vote on another participant's card | Toggle one vote for the local identity. | Count and vote state converge for peers. |
| View an owned card | Disable voting on that card. | No vote operation is sent. |

Unsaved composer text triggers a confirmation when returning to the board list.

## Presence, synchronization, and failures

- A successful handshake shows the participant count, connection status, and readiness
  action. Joining clients merge available states during the synchronization window.
- Duplicate operations remain idempotent. Newer card and vote revisions win; tombstones
  are not resurrected by stale state.
- A transient disconnect retries with bounded exponential backoff. A permanent close
  exposes the reconnect action and hides readiness/presence controls.
- Duplicate client identity and board-capacity rejection show friendly full-page errors.
- The supported participant limit is 20. A browser identity persists in local storage.
- Storage parse failures do not load invalid board state. Storage write failures surface
  to the caller; the application must not report a successful save.

## Readiness and review

- Required readiness is all participants for groups of one or two, then 60% rounded up.
- Reaching quorum shows the review banner. Dropping below quorum hides it.
- Starting review requires confirmation and is irreversible for the board.
- Review hides the composer and readiness controls, freezes edits and votes, shows the
  phase and export controls, and sorts each column by descending vote count.
- A late joiner or reload of a reviewing board receives the same frozen review state.

## Export

Export downloads `{boardId}.md` with a board heading, Went Well and Delta sections,
multiline card text, and singular/plural vote counts. Cards are ordered by descending
votes. Empty columns contain `_No cards._`; deleted cards are omitted.

## Theme, responsive layout, and accessibility

- Theme preference cycles Auto → Dark → Light → Auto and persists in local storage.
  Auto follows operating-system changes. The pre-paint script and theme-color metadata
  must agree with the resolved theme.
- The board is two columns above the current 768 px breakpoint and one column at or
  below it. Header actions, composer controls, cards, and long text must remain usable
  without horizontal page overflow.
- Critical flows must work with the keyboard. Visible focus, reduced-motion behavior,
  accessible names/states, reflow, contrast, and target size are product requirements.
  Automated axe checks are a regression gate, not proof of WCAG conformance.

Card actions remain visible and operable on touch-only viewports and when keyboard focus
enters a card. The application disables transitions and animations when the operating
system requests reduced motion. Automated checks require accessible review vote badges
and a main landmark on the 404 page.

## Offline and PWA

- The versioned service-worker app shell contains every runtime asset and installs
  without missing requests.
- Cached navigation loads the landing page and locally persisted boards while offline.
  Local edits remain stored; collaboration reconnects and converges when connectivity
  returns.
- A new version removes older Delta Board caches. Installed-app update, mixed-version
  tabs, and rollback are prerelease checks because they require two deployable builds.

## Evidence boundaries

Automated tests provide bounded guarantees for their explicit data, browser versions,
and viewports. Before stable release, manually validate real iOS Safari and Android
Chrome, installed-PWA update and rollback, two physical devices, touch keyboards,
200–400% zoom/reflow, interrupted networks, and VoiceOver or NVDA. These checks cover
residual risk; they cannot create an absolute no-regression guarantee.
