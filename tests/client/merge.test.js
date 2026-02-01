import { describe, it, expect } from 'vitest';
import { mergeCard, mergeVote, mergePhase, mergeState } from '../../src/DeltaBoard.Server/wwwroot/js/merge.js';

describe('merge', () => {
    describe('mergeCard', () => {
        const baseCard = {
            id: 'card-1',
            column: 'well',
            text: 'Hello',
            authorId: 'client-a',
            rev: 1,
            isDeleted: false
        };

        it('should prefer higher rev', () => {
            const local = { ...baseCard, rev: 1, text: 'Local' };
            const remote = { ...baseCard, rev: 2, text: 'Remote' };
            expect(mergeCard(local, remote)).toBe(remote);
            expect(mergeCard(remote, local)).toBe(remote);
        });

        it('should prefer higher authorId when rev is equal', () => {
            const local = { ...baseCard, rev: 1, authorId: 'client-a' };
            const remote = { ...baseCard, rev: 1, authorId: 'client-b' };
            expect(mergeCard(local, remote)).toBe(remote);
            expect(mergeCard(remote, local)).toBe(remote);
        });

        it('should prefer isDeleted when rev and authorId are equal', () => {
            const local = { ...baseCard, rev: 1, isDeleted: false };
            const remote = { ...baseCard, rev: 1, isDeleted: true };
            expect(mergeCard(local, remote)).toBe(remote);
            expect(mergeCard(remote, local)).toBe(remote);
        });

        it('should return local when all tiebreakers are equal', () => {
            const local = { ...baseCard };
            const remote = { ...baseCard };
            expect(mergeCard(local, remote)).toBe(local);
        });

        it('should keep local when local has higher rev', () => {
            const local = { ...baseCard, rev: 3 };
            const remote = { ...baseCard, rev: 2 };
            expect(mergeCard(local, remote)).toBe(local);
        });
    });

    describe('mergeVote', () => {
        const baseVote = {
            id: 'card-1:client-x',
            cardId: 'card-1',
            voterId: 'client-x',
            rev: 1,
            isDeleted: false
        };

        it('should prefer higher rev', () => {
            const local = { ...baseVote, rev: 1 };
            const remote = { ...baseVote, rev: 2 };
            expect(mergeVote(local, remote)).toBe(remote);
        });

        it('should prefer higher voterId when rev is equal', () => {
            const local = { ...baseVote, voterId: 'client-a' };
            const remote = { ...baseVote, voterId: 'client-b' };
            expect(mergeVote(local, remote)).toBe(remote);
        });

        it('should prefer isDeleted when rev and voterId are equal', () => {
            const local = { ...baseVote, isDeleted: false };
            const remote = { ...baseVote, isDeleted: true };
            expect(mergeVote(local, remote)).toBe(remote);
        });
    });

    describe('mergePhase', () => {
        it('should return reviewing if either is reviewing', () => {
            expect(mergePhase('forming', 'reviewing')).toBe('reviewing');
            expect(mergePhase('reviewing', 'forming')).toBe('reviewing');
            expect(mergePhase('reviewing', 'reviewing')).toBe('reviewing');
        });

        it('should return forming only if both are forming', () => {
            expect(mergePhase('forming', 'forming')).toBe('forming');
        });
    });

    describe('mergeState', () => {
        it('should merge empty states', () => {
            const local = { phase: 'forming', cards: [], votes: [] };
            const remote = { phase: 'forming', cards: [], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.phase).toBe('forming');
            expect(state.cards).toEqual([]);
            expect(state.votes).toEqual([]);
            expect(changed).toBe(false);
        });

        it('should add cards from remote', () => {
            const local = { phase: 'forming', cards: [], votes: [] };
            const card = { id: 'card-1', column: 'well', text: 'Hi', authorId: 'a', rev: 1, isDeleted: false };
            const remote = { phase: 'forming', cards: [card], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.cards).toHaveLength(1);
            expect(state.cards[0].id).toBe('card-1');
            expect(changed).toBe(true);
        });

        it('should merge conflicting cards using LWW', () => {
            const localCard = { id: 'card-1', column: 'well', text: 'Local', authorId: 'a', rev: 1, isDeleted: false };
            const remoteCard = { id: 'card-1', column: 'well', text: 'Remote', authorId: 'a', rev: 2, isDeleted: false };
            const local = { phase: 'forming', cards: [localCard], votes: [] };
            const remote = { phase: 'forming', cards: [remoteCard], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.cards[0].text).toBe('Remote');
            expect(state.cards[0].rev).toBe(2);
            expect(changed).toBe(true);
        });

        it('should keep local card when it has higher rev', () => {
            const localCard = { id: 'card-1', column: 'well', text: 'Local', authorId: 'a', rev: 3, isDeleted: false };
            const remoteCard = { id: 'card-1', column: 'well', text: 'Remote', authorId: 'a', rev: 2, isDeleted: false };
            const local = { phase: 'forming', cards: [localCard], votes: [] };
            const remote = { phase: 'forming', cards: [remoteCard], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.cards[0].text).toBe('Local');
            expect(changed).toBe(false);
        });

        it('should merge phase to reviewing if either is reviewing', () => {
            const local = { phase: 'forming', cards: [], votes: [] };
            const remote = { phase: 'reviewing', cards: [], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.phase).toBe('reviewing');
            expect(changed).toBe(true);
        });

        it('should add votes from remote', () => {
            const local = { phase: 'forming', cards: [], votes: [] };
            const vote = { id: 'card-1:client-x', cardId: 'card-1', voterId: 'client-x', rev: 1, isDeleted: false };
            const remote = { phase: 'forming', cards: [], votes: [vote] };
            const { state, changed } = mergeState(local, remote);
            expect(state.votes).toHaveLength(1);
            expect(changed).toBe(true);
        });

        it('should merge all entities from both states', () => {
            const localCard = { id: 'card-1', column: 'well', text: 'Local', authorId: 'a', rev: 1, isDeleted: false };
            const remoteCard = { id: 'card-2', column: 'delta', text: 'Remote', authorId: 'b', rev: 1, isDeleted: false };
            const local = { phase: 'forming', cards: [localCard], votes: [] };
            const remote = { phase: 'forming', cards: [remoteCard], votes: [] };
            const { state, changed } = mergeState(local, remote);
            expect(state.cards).toHaveLength(2);
            expect(changed).toBe(true);
        });
    });
});
