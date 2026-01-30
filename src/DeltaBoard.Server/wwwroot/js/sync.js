// State synchronization and merging logic

import * as ops from './operations.js';

/**
 * Merge remote state into local state (CRDT-style union)
 * - Cards: add any cards we don't have
 * - Votes: union of all voter IDs per card
 */
export function mergeState(localState, remoteState) {
    if (!remoteState) return localState;

    let newState = { ...localState };

    // Merge cards (add any we don't have)
    if (remoteState.cards) {
        const existingIds = new Set(localState.cards.map(c => c.id));
        const newCards = remoteState.cards.filter(c => !existingIds.has(c.id));
        if (newCards.length > 0) {
            newState = {
                ...newState,
                cards: [...newState.cards, ...newCards]
            };
        }
    }

    // Merge votes (union of voter IDs)
    if (remoteState.votes) {
        const newVotes = { ...newState.votes };
        for (const [cardId, voters] of Object.entries(remoteState.votes)) {
            const existingVoters = new Set(newVotes[cardId] || []);
            const allVoters = [...existingVoters];
            for (const voter of voters) {
                if (!existingVoters.has(voter)) {
                    allVoters.push(voter);
                }
            }
            newVotes[cardId] = allVoters;
        }
        newState = { ...newState, votes: newVotes };
    }

    return newState;
}

/**
 * Apply a remote operation to local state
 * Returns { state, handled } where handled indicates if the operation was processed
 */
export function applyOperation(state, operation) {
    switch (operation.type) {
        case 'createCard':
            if (ops.hasCard(state, operation.card.id)) {
                return { state, handled: false };
            }
            return {
                state: {
                    ...state,
                    cards: [...state.cards, operation.card]
                },
                handled: true
            };

        case 'editCard': {
            const cardIndex = state.cards.findIndex(c => c.id === operation.cardId);
            if (cardIndex === -1) {
                return { state, handled: false };
            }
            return {
                state: ops.editCard(state, operation.cardId, operation.text),
                handled: true
            };
        }

        case 'deleteCard':
            if (!ops.hasCard(state, operation.cardId)) {
                return { state, handled: false };
            }
            return {
                state: ops.deleteCard(state, operation.cardId),
                handled: true
            };

        case 'addVote': {
            const newState = ops.addVote(state, operation.cardId, operation.voterId);
            return {
                state: newState,
                handled: newState !== state
            };
        }

        case 'removeVote': {
            const newState = ops.removeVote(state, operation.cardId, operation.voterId);
            return {
                state: newState,
                handled: newState !== state
            };
        }

        default:
            return { state, handled: false };
    }
}
