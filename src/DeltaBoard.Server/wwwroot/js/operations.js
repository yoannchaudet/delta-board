// Operations Module - Apply card/vote ops and query helpers

import { mergeCard, mergeVote } from './merge.js';

/**
 * @typedef {import('./types.js').BoardState} BoardState
 * @typedef {import('./types.js').Card} Card
 * @typedef {import('./types.js').Vote} Vote
 */

/**
 * Apply a card operation to state (create/edit/delete via tombstone)
 * @param {BoardState} state
 * @param {Object} op
 * @param {string} op.cardId
 * @param {string} op.column
 * @param {string} op.text
 * @param {string} op.authorId
 * @param {number} op.rev
 * @param {boolean} [op.isDeleted]
 * @returns {BoardState}
 */
export function applyCardOp(state, op) {
    const isDeleted = typeof op.isDeleted === 'boolean'
        ? op.isDeleted
        : op.action === 'delete';

    const index = state.cards.findIndex(card => card.id === op.cardId);
    const nextCard = {
        id: op.cardId,
        column: op.column,
        text: op.text,
        authorId: op.authorId,
        rev: op.rev,
        isDeleted
    };

    if (index === -1) {
        state.cards.push(nextCard);
        return state;
    }

    const merged = mergeCard(state.cards[index], nextCard);
    state.cards[index] = merged;
    return state;
}

/**
 * Apply a vote operation to state (add/remove via tombstone)
 * @param {BoardState} state
 * @param {Object} op
 * @param {string} op.cardId
 * @param {string} op.voterId
 * @param {number} op.rev
 * @param {boolean} [op.isDeleted]
 * @returns {BoardState}
 */
export function applyVote(state, op) {
    const isDeleted = typeof op.isDeleted === 'boolean'
        ? op.isDeleted
        : op.action === 'remove';

    const voteId = `${op.cardId}:${op.voterId}`;
    const index = state.votes.findIndex(vote => vote.id === voteId);
    const nextVote = {
        id: voteId,
        cardId: op.cardId,
        voterId: op.voterId,
        rev: op.rev,
        isDeleted
    };

    if (index === -1) {
        state.votes.push(nextVote);
        return state;
    }

    const merged = mergeVote(state.votes[index], nextVote);
    state.votes[index] = merged;
    return state;
}

/**
 * Get visible (non-deleted) cards for a column
 * @param {BoardState} state
 * @param {Card['column']} column
 * @returns {Card[]}
 */
export function getVisibleCards(state, column) {
    return state.cards.filter(card => card.column === column && !card.isDeleted);
}

/**
 * Count votes for a card (non-deleted)
 * @param {BoardState} state
 * @param {string} cardId
 * @returns {number}
 */
export function getVoteCount(state, cardId) {
    let count = 0;
    for (const vote of state.votes) {
        if (vote.cardId === cardId && !vote.isDeleted) {
            count++;
        }
    }
    return count;
}

/**
 * Check if a voter has an active vote on a card
 * @param {BoardState} state
 * @param {string} cardId
 * @param {string} voterId
 * @returns {boolean}
 */
export function hasVoted(state, cardId, voterId) {
    const voteId = `${cardId}:${voterId}`;
    const vote = state.votes.find(v => v.id === voteId);
    return Boolean(vote && !vote.isDeleted);
}
