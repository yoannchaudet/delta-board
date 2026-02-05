// Types Module - State definitions and factory functions

import { generateCardId } from './board.js';

/**
 * @typedef {'forming' | 'reviewing'} Phase
 */

/**
 * @typedef {'well' | 'delta'} Column
 */

/**
 * @typedef {Object} Card
 * @property {string} id - Unique card ID
 * @property {Column} column - Which column the card belongs to
 * @property {string} text - Card content
 * @property {string} authorId - clientId of the card creator
 * @property {number} rev - Monotonic revision number
 * @property {boolean} isDeleted - Tombstone flag
 */

/**
 * @typedef {Object} Vote
 * @property {string} id - Vote ID: `${cardId}:${voterId}`
 * @property {string} cardId - The card being voted on
 * @property {string} voterId - clientId of the voter
 * @property {number} rev - Monotonic revision number
 * @property {boolean} isDeleted - Tombstone flag
 */

/**
 * @typedef {Object} BoardState
 * @property {number} version - Schema version
 * @property {Phase} phase - Current board phase
 * @property {Card[]} cards - All cards (including tombstones)
 * @property {Vote[]} votes - All votes (including tombstones)
 */

/** Current board state schema version */
export const BOARD_VERSION = 1;

/**
 * Create an empty board state
 * @returns {BoardState}
 */
export function createEmptyState() {
    return {
        version: BOARD_VERSION,
        phase: 'forming',
        cards: [],
        votes: []
    };
}

/**
 * Create a new card
 * @param {Column} column - Which column
 * @param {string} text - Card content
 * @param {string} authorId - clientId of creator
 * @returns {Card}
 */
export function createCard(column, text, authorId) {
    return {
        id: generateCardId(),
        column,
        text,
        authorId,
        rev: 1,
        isDeleted: false
    };
}

/**
 * Create a new vote
 * @param {string} cardId - The card to vote on
 * @param {string} voterId - clientId of voter
 * @returns {Vote}
 */
export function createVote(cardId, voterId) {
    return {
        id: `${cardId}:${voterId}`,
        cardId,
        voterId,
        rev: 1,
        isDeleted: false
    };
}

/**
 * Generate a unique operation ID
 * @param {string} clientId - The client generating the operation
 * @returns {string}
 */
export function generateOpId(clientId) {
    return `${clientId}:${Date.now()}:${Math.random().toString(36).substring(2, 6)}`;
}
