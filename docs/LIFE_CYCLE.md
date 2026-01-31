# Life Cycle

At the core of Delta Board is a board.

Each board follows a simple, mostly one way life cycle designed to support a smooth retrospective without complex controls or roles.

## Phases

A board has two phases.

### 1. Forming

This is the writing and voting phase.

Participants can:

- Create, edit, and delete their own cards
- Vote on cards, following product rules such as no self voting
- Mark themselves as ready to move to discussion

The goal of this phase is to gather input from everyone.

### 2. Reviewing

This is the discussion phase.

Participants can:

- Read cards
- See votes
- Discuss each item with the group

During this phase:

- Cards cannot be edited
- New cards cannot be added
- Votes cannot be changed

The board is considered locked for writing so the group can focus on conversation.

## Phase Transition

Boards move from Forming to Reviewing through a soft vote process.

### Readiness

Each participant can indicate they are ready to move on.

Being ready means "I am done adding and voting for now".

Participants can still edit and vote after marking ready until the board actually transitions.

If a participant adds or edits a card, their ready state may be automatically cleared to keep the signal meaningful.

### Quorum

The board can move to Reviewing when a readiness quorum is reached.

Quorum is based on the number of currently connected participants and is designed to represent a clear majority without requiring unanimity.

When quorum is reached

- A button to move to Reviewing becomes visible
- Any participant may trigger the transition

If all connected participants are ready, the transition may also happen automatically.

The system shows readiness as a simple count, such as **5 of 8 people are ready**.

No names are displayed.

### Transition Behavior

When the board moves to Reviewing

- The phase changes globally for all participants
- Editing and voting are disabled

This transition is one way within a single board.

## No Reopening Within a Board

A board cannot move back from Reviewing to Forming.

This keeps the life cycle simple and avoids confusion about which edits or votes are valid.

If the group decides they need more writing time after discussion has started, they should start a new writing round using a cloned board.

## Cloning for a New Writing Round

From Reviewing, participants may create a new board based on the current one.

The new board

- Starts in Forming
- Copies cards and action items
- Optionally resets all votes
- Has a new URL

This represents a new writing round rather than a continuation of the original one.

Changing boards requires a deliberate action by the group, which matches the social weight of extending a retrospective.

## Late Joiners

Participants who join while the board is in Forming can write and vote as usual.

Participants who join after the board has entered Reviewing can view the board and take part in discussion, but cannot edit or vote.

The phase never moves backward automatically due to people joining or leaving.

## Summary

Each board has a simple, mostly one way flow: **Forming → Reviewing**.

Soft consensus moves the board forward.

Discussion stays focused once it begins.

Additional writing happens in a new board, not by rewinding the current one.

This keeps Delta Board lightweight, predictable, and aligned with how real retrospectives naturally unfold.

## Appendix A — Readiness Quorum Table

| Participants | Ready Needed | Rationale                               |
| ------------ | ------------ | --------------------------------------- |
| 1            | 1            | Agree with your inner self              |
| 2            | 2            | Both participants should agree          |
| 3            | 2            | One person cannot rush the group        |
| 4            | 3            | Strong majority                         |
| 5            | 3            | Balanced majority without being strict  |
| 6            | 4            | Clear majority                          |
| 7            | 5            | Majority with flexibility               |
| 8            | 5            | One or two people can still be thinking |
| 9            | 6            | Socially feels right                    |
| 10           | 6            | Still avoids a veto problem             |
| 12           | 8            | Majority without unanimity              |
| 15           | 9            | Scales with group size                  |
| 20           | 12           | Large group majority                    |
