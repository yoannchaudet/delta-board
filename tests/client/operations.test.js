import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmptyState } from '../../src/DeltaBoard.Server/wwwroot/js/board.js';
import {
    createCard,
    editCard,
    deleteCard,
    addVote,
    removeVote,
    toggleVote,
    hasCard,
    getCardsByColumn,
    getVoteCount,
    hasVoted
} from '../../src/DeltaBoard.Server/wwwroot/js/operations.js';

describe('operations', () => {
    let state;

    beforeEach(() => {
        state = createEmptyState('test-board');
    });

    describe('createCard', () => {
        it('should add a card to the state', () => {
            const result = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(result.state.cards).toHaveLength(1);
            expect(result.card.column).toBe('well');
            expect(result.card.text).toBe('Test card');
            expect(result.card.owner).toBe('client-123');
        });

        it('should not mutate the original state', () => {
            const originalCards = state.cards;
            createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(state.cards).toBe(originalCards);
            expect(state.cards).toHaveLength(0);
        });

        it('should generate a unique card ID', () => {
            const result = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(result.card.id).toMatch(/^card-\d+-[a-z0-9]+$/);
        });

        it('should set createdAt timestamp', () => {
            const before = Date.now();
            const result = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const after = Date.now();

            expect(result.card.createdAt).toBeGreaterThanOrEqual(before);
            expect(result.card.createdAt).toBeLessThanOrEqual(after);
        });
    });

    describe('editCard', () => {
        it('should update the card text', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Original text',
                owner: 'client-123'
            });

            const newState = editCard(stateWithCard, card.id, 'Updated text');

            expect(newState.cards[0].text).toBe('Updated text');
        });

        it('should not mutate the original state', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Original text',
                owner: 'client-123'
            });

            editCard(stateWithCard, card.id, 'Updated text');

            expect(stateWithCard.cards[0].text).toBe('Original text');
        });

        it('should return original state if card not found', () => {
            const newState = editCard(state, 'nonexistent-id', 'Updated text');
            expect(newState).toBe(state);
        });
    });

    describe('deleteCard', () => {
        it('should remove the card from state', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const newState = deleteCard(stateWithCard, card.id);

            expect(newState.cards).toHaveLength(0);
        });

        it('should remove associated votes', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const stateWithVote = addVote(stateWithCard, card.id, 'voter-1');

            const newState = deleteCard(stateWithVote, card.id);

            expect(newState.votes[card.id]).toBeUndefined();
        });

        it('should return original state if card not found', () => {
            const newState = deleteCard(state, 'nonexistent-id');
            expect(newState).toBe(state);
        });
    });

    describe('addVote', () => {
        it('should add a vote to a card', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const newState = addVote(stateWithCard, card.id, 'voter-1');

            expect(newState.votes[card.id]).toContain('voter-1');
        });

        it('should not add duplicate votes', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const state1 = addVote(stateWithCard, card.id, 'voter-1');
            const state2 = addVote(state1, card.id, 'voter-1');

            expect(state2).toBe(state1);
            expect(state2.votes[card.id]).toHaveLength(1);
        });

        it('should allow multiple voters', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const state1 = addVote(stateWithCard, card.id, 'voter-1');
            const state2 = addVote(state1, card.id, 'voter-2');

            expect(state2.votes[card.id]).toHaveLength(2);
            expect(state2.votes[card.id]).toContain('voter-1');
            expect(state2.votes[card.id]).toContain('voter-2');
        });
    });

    describe('removeVote', () => {
        it('should remove a vote from a card', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const stateWithVote = addVote(stateWithCard, card.id, 'voter-1');

            const newState = removeVote(stateWithVote, card.id, 'voter-1');

            expect(newState.votes[card.id]).not.toContain('voter-1');
        });

        it('should return original state if voter has not voted', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const newState = removeVote(stateWithCard, card.id, 'voter-1');

            expect(newState).toBe(stateWithCard);
        });
    });

    describe('toggleVote', () => {
        it('should add vote if not present', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            const newState = toggleVote(stateWithCard, card.id, 'voter-1');

            expect(newState.votes[card.id]).toContain('voter-1');
        });

        it('should remove vote if present', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const stateWithVote = addVote(stateWithCard, card.id, 'voter-1');

            const newState = toggleVote(stateWithVote, card.id, 'voter-1');

            expect(newState.votes[card.id]).not.toContain('voter-1');
        });
    });

    describe('hasCard', () => {
        it('should return true if card exists', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(hasCard(stateWithCard, card.id)).toBe(true);
        });

        it('should return false if card does not exist', () => {
            expect(hasCard(state, 'nonexistent-id')).toBe(false);
        });
    });

    describe('getCardsByColumn', () => {
        it('should return cards for the specified column', () => {
            let currentState = state;
            const { state: s1 } = createCard(currentState, {
                column: 'well',
                text: 'Well card 1',
                owner: 'client-123'
            });
            const { state: s2 } = createCard(s1, {
                column: 'delta',
                text: 'Delta card',
                owner: 'client-123'
            });
            const { state: s3 } = createCard(s2, {
                column: 'well',
                text: 'Well card 2',
                owner: 'client-123'
            });

            const wellCards = getCardsByColumn(s3, 'well');
            const deltaCards = getCardsByColumn(s3, 'delta');

            expect(wellCards).toHaveLength(2);
            expect(deltaCards).toHaveLength(1);
        });
    });

    describe('getVoteCount', () => {
        it('should return 0 for card with no votes', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(getVoteCount(stateWithCard, card.id)).toBe(0);
        });

        it('should return correct vote count', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const state1 = addVote(stateWithCard, card.id, 'voter-1');
            const state2 = addVote(state1, card.id, 'voter-2');

            expect(getVoteCount(state2, card.id)).toBe(2);
        });
    });

    describe('hasVoted', () => {
        it('should return true if voter has voted', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });
            const stateWithVote = addVote(stateWithCard, card.id, 'voter-1');

            expect(hasVoted(stateWithVote, card.id, 'voter-1')).toBe(true);
        });

        it('should return false if voter has not voted', () => {
            const { state: stateWithCard, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'client-123'
            });

            expect(hasVoted(stateWithCard, card.id, 'voter-1')).toBe(false);
        });
    });
});
