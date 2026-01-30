import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyState } from '../../src/DeltaBoard.Server/wwwroot/js/board.js';
import { createCard, addVote } from '../../src/DeltaBoard.Server/wwwroot/js/operations.js';
import { mergeState, applyOperation } from '../../src/DeltaBoard.Server/wwwroot/js/sync.js';

describe('sync', () => {
    let state;

    beforeEach(() => {
        state = createEmptyState('test-board');
    });

    describe('mergeState', () => {
        it('should return local state if remote is null', () => {
            const result = mergeState(state, null);
            expect(result).toBe(state);
        });

        it('should add cards from remote that do not exist locally', () => {
            const remoteState = {
                cards: [
                    { id: 'card-1', column: 'well', text: 'Remote card', owner: 'remote-client' }
                ],
                votes: {}
            };

            const result = mergeState(state, remoteState);

            expect(result.cards).toHaveLength(1);
            expect(result.cards[0].id).toBe('card-1');
        });

        it('should not duplicate cards that exist locally', () => {
            const { state: localState, card } = createCard(state, {
                column: 'well',
                text: 'Local card',
                owner: 'local-client'
            });

            const remoteState = {
                cards: [card], // Same card
                votes: {}
            };

            const result = mergeState(localState, remoteState);

            expect(result.cards).toHaveLength(1);
        });

        it('should merge votes from remote', () => {
            const { state: localState, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'local-client'
            });
            const localWithVote = addVote(localState, card.id, 'voter-1');

            const remoteState = {
                cards: [],
                votes: {
                    [card.id]: ['voter-2', 'voter-3']
                }
            };

            const result = mergeState(localWithVote, remoteState);

            expect(result.votes[card.id]).toHaveLength(3);
            expect(result.votes[card.id]).toContain('voter-1');
            expect(result.votes[card.id]).toContain('voter-2');
            expect(result.votes[card.id]).toContain('voter-3');
        });

        it('should not duplicate voters', () => {
            const { state: localState, card } = createCard(state, {
                column: 'well',
                text: 'Test card',
                owner: 'local-client'
            });
            const localWithVote = addVote(localState, card.id, 'voter-1');

            const remoteState = {
                cards: [],
                votes: {
                    [card.id]: ['voter-1', 'voter-2'] // voter-1 already exists locally
                }
            };

            const result = mergeState(localWithVote, remoteState);

            expect(result.votes[card.id]).toHaveLength(2);
        });
    });

    describe('applyOperation', () => {
        describe('createCard operation', () => {
            it('should add a new card', () => {
                const operation = {
                    type: 'createCard',
                    card: { id: 'card-1', column: 'well', text: 'New card', owner: 'remote-client' }
                };

                const result = applyOperation(state, operation);

                expect(result.handled).toBe(true);
                expect(result.state.cards).toHaveLength(1);
                expect(result.state.cards[0].id).toBe('card-1');
            });

            it('should not add duplicate card', () => {
                const { state: stateWithCard, card } = createCard(state, {
                    column: 'well',
                    text: 'Existing card',
                    owner: 'local-client'
                });

                const operation = {
                    type: 'createCard',
                    card: { ...card } // Same card ID
                };

                const result = applyOperation(stateWithCard, operation);

                expect(result.handled).toBe(false);
                expect(result.state.cards).toHaveLength(1);
            });
        });

        describe('editCard operation', () => {
            it('should update card text', () => {
                const { state: stateWithCard, card } = createCard(state, {
                    column: 'well',
                    text: 'Original text',
                    owner: 'local-client'
                });

                const operation = {
                    type: 'editCard',
                    cardId: card.id,
                    text: 'Updated text'
                };

                const result = applyOperation(stateWithCard, operation);

                expect(result.handled).toBe(true);
                expect(result.state.cards[0].text).toBe('Updated text');
            });

            it('should not handle if card does not exist', () => {
                const operation = {
                    type: 'editCard',
                    cardId: 'nonexistent',
                    text: 'Updated text'
                };

                const result = applyOperation(state, operation);

                expect(result.handled).toBe(false);
            });
        });

        describe('deleteCard operation', () => {
            it('should remove the card', () => {
                const { state: stateWithCard, card } = createCard(state, {
                    column: 'well',
                    text: 'Test card',
                    owner: 'local-client'
                });

                const operation = {
                    type: 'deleteCard',
                    cardId: card.id
                };

                const result = applyOperation(stateWithCard, operation);

                expect(result.handled).toBe(true);
                expect(result.state.cards).toHaveLength(0);
            });

            it('should not handle if card does not exist', () => {
                const operation = {
                    type: 'deleteCard',
                    cardId: 'nonexistent'
                };

                const result = applyOperation(state, operation);

                expect(result.handled).toBe(false);
            });
        });

        describe('addVote operation', () => {
            it('should add a vote', () => {
                const { state: stateWithCard, card } = createCard(state, {
                    column: 'well',
                    text: 'Test card',
                    owner: 'local-client'
                });

                const operation = {
                    type: 'addVote',
                    cardId: card.id,
                    voterId: 'voter-1'
                };

                const result = applyOperation(stateWithCard, operation);

                expect(result.handled).toBe(true);
                expect(result.state.votes[card.id]).toContain('voter-1');
            });
        });

        describe('removeVote operation', () => {
            it('should remove a vote', () => {
                const { state: stateWithCard, card } = createCard(state, {
                    column: 'well',
                    text: 'Test card',
                    owner: 'local-client'
                });
                const stateWithVote = addVote(stateWithCard, card.id, 'voter-1');

                const operation = {
                    type: 'removeVote',
                    cardId: card.id,
                    voterId: 'voter-1'
                };

                const result = applyOperation(stateWithVote, operation);

                expect(result.handled).toBe(true);
                expect(result.state.votes[card.id]).not.toContain('voter-1');
            });
        });

        describe('unknown operation', () => {
            it('should return unhandled for unknown operation type', () => {
                const operation = {
                    type: 'unknownOperation'
                };

                const result = applyOperation(state, operation);

                expect(result.handled).toBe(false);
                expect(result.state).toBe(state);
            });
        });
    });
});
