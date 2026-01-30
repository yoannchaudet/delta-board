// Pure state operations - all functions return new state without mutations

import { generateCardId } from './board.js';

/**
 * Create a new card and return updated state + the created card
 */
export function createCard(state, { column, text, owner }) {
    const card = {
        id: generateCardId(),
        column,
        text,
        owner,
        createdAt: Date.now()
    };
    return {
        state: {
            ...state,
            cards: [...state.cards, card]
        },
        card
    };
}

/**
 * Edit an existing card's text
 */
export function editCard(state, cardId, text) {
    const cardIndex = state.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return state;

    const newCards = [...state.cards];
    newCards[cardIndex] = { ...newCards[cardIndex], text };

    return {
        ...state,
        cards: newCards
    };
}

/**
 * Delete a card and its votes
 */
export function deleteCard(state, cardId) {
    const newCards = state.cards.filter(c => c.id !== cardId);
    if (newCards.length === state.cards.length) return state;

    const newVotes = { ...state.votes };
    delete newVotes[cardId];

    return {
        ...state,
        cards: newCards,
        votes: newVotes
    };
}

/**
 * Add a vote from a voter to a card
 */
export function addVote(state, cardId, voterId) {
    const currentVoters = state.votes[cardId] || [];
    if (currentVoters.includes(voterId)) return state;

    return {
        ...state,
        votes: {
            ...state.votes,
            [cardId]: [...currentVoters, voterId]
        }
    };
}

/**
 * Remove a vote from a voter on a card
 */
export function removeVote(state, cardId, voterId) {
    const currentVoters = state.votes[cardId];
    if (!currentVoters || !currentVoters.includes(voterId)) return state;

    return {
        ...state,
        votes: {
            ...state.votes,
            [cardId]: currentVoters.filter(v => v !== voterId)
        }
    };
}

/**
 * Toggle a vote - add if not present, remove if present
 */
export function toggleVote(state, cardId, voterId) {
    const currentVoters = state.votes[cardId] || [];
    if (currentVoters.includes(voterId)) {
        return removeVote(state, cardId, voterId);
    } else {
        return addVote(state, cardId, voterId);
    }
}

/**
 * Check if a card exists
 */
export function hasCard(state, cardId) {
    return state.cards.some(c => c.id === cardId);
}

/**
 * Get cards by column
 */
export function getCardsByColumn(state, column) {
    return state.cards.filter(c => c.column === column);
}

/**
 * Get vote count for a card
 */
export function getVoteCount(state, cardId) {
    return state.votes[cardId]?.length || 0;
}

/**
 * Check if a voter has voted for a card
 */
export function hasVoted(state, cardId, voterId) {
    return state.votes[cardId]?.includes(voterId) || false;
}
