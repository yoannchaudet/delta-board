// Merge Module - LWW conflict resolution

/**
 * @typedef {import('./types.js').Card} Card
 * @typedef {import('./types.js').Vote} Vote
 * @typedef {import('./types.js').BoardState} BoardState
 * @typedef {import('./types.js').Phase} Phase
 */

/**
 * Compare two cards and return the winner (LWW)
 * Rules:
 * 1. Higher rev wins
 * 2. If rev equal, higher authorId (lexicographic) wins
 * 3. If rev and authorId equal, isDeleted: true wins
 *
 * @param {Card} local
 * @param {Card} remote
 * @returns {Card} The winning card
 */
export function mergeCard(local, remote) {
    // Higher rev wins
    if (remote.rev > local.rev) {
        return remote;
    }
    if (local.rev > remote.rev) {
        return local;
    }

    // Equal rev: compare authorId lexicographically
    if (remote.authorId > local.authorId) {
        return remote;
    }
    if (local.authorId > remote.authorId) {
        return local;
    }

    // Equal rev and authorId: isDeleted wins
    if (remote.isDeleted && !local.isDeleted) {
        return remote;
    }

    return local;
}

/**
 * Compare two votes and return the winner (LWW)
 * Rules:
 * 1. Higher rev wins
 * 2. If rev equal, higher voterId (lexicographic) wins
 * 3. If rev and voterId equal, isDeleted: true wins
 *
 * @param {Vote} local
 * @param {Vote} remote
 * @returns {Vote} The winning vote
 */
export function mergeVote(local, remote) {
    // Higher rev wins
    if (remote.rev > local.rev) {
        return remote;
    }
    if (local.rev > remote.rev) {
        return local;
    }

    // Equal rev: compare voterId lexicographically
    if (remote.voterId > local.voterId) {
        return remote;
    }
    if (local.voterId > remote.voterId) {
        return local;
    }

    // Equal rev and voterId: isDeleted wins
    if (remote.isDeleted && !local.isDeleted) {
        return remote;
    }

    return local;
}

/**
 * Merge two phases - reviewing always wins (monotonic)
 *
 * @param {Phase} local
 * @param {Phase} remote
 * @returns {Phase}
 */
export function mergePhase(local, remote) {
    if (local === 'reviewing' || remote === 'reviewing') {
        return 'reviewing';
    }
    return 'forming';
}

/**
 * Merge two board states
 *
 * @param {BoardState} local
 * @param {BoardState} remote
 * @returns {{ state: BoardState, changed: boolean }}
 */
export function mergeState(local, remote) {
    let changed = false;

    // Merge phase
    const mergedPhase = mergePhase(local.phase, remote.phase);
    if (mergedPhase !== local.phase) {
        changed = true;
    }

    // Merge cards - build a map for efficient lookup
    const cardMap = new Map();
    for (const card of local.cards) {
        cardMap.set(card.id, card);
    }

    for (const remoteCard of remote.cards) {
        const localCard = cardMap.get(remoteCard.id);
        if (localCard) {
            const winner = mergeCard(localCard, remoteCard);
            if (winner !== localCard) {
                cardMap.set(remoteCard.id, winner);
                changed = true;
            }
        } else {
            // New card from remote
            cardMap.set(remoteCard.id, remoteCard);
            changed = true;
        }
    }

    // Merge votes - build a map for efficient lookup
    const voteMap = new Map();
    for (const vote of local.votes) {
        voteMap.set(vote.id, vote);
    }

    for (const remoteVote of remote.votes) {
        const localVote = voteMap.get(remoteVote.id);
        if (localVote) {
            const winner = mergeVote(localVote, remoteVote);
            if (winner !== localVote) {
                voteMap.set(remoteVote.id, winner);
                changed = true;
            }
        } else {
            // New vote from remote
            voteMap.set(remoteVote.id, remoteVote);
            changed = true;
        }
    }

    // Use the higher version (or default to 1)
    const mergedVersion = Math.max(local.version || 1, remote.version || 1);

    return {
        state: {
            version: mergedVersion,
            phase: mergedPhase,
            cards: Array.from(cardMap.values()),
            votes: Array.from(voteMap.values())
        },
        changed
    };
}
