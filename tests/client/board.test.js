import { describe, it, expect } from 'vitest';
import {
    ADJECTIVES,
    NOUNS,
    generateBoardId,
    generateCardId,
    generateClientId,
    createEmptyState
} from '../../src/DeltaBoard.Server/wwwroot/js/board.js';

describe('board', () => {
    describe('generateBoardId', () => {
        it('should generate a board ID with correct format', () => {
            const id = generateBoardId();
            expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z0-9]{4}$/);
        });

        it('should use adjectives and nouns from the word lists', () => {
            const id = generateBoardId();
            const parts = id.split('-');
            expect(ADJECTIVES).toContain(parts[0]);
            expect(NOUNS).toContain(parts[1]);
        });

        it('should generate unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(generateBoardId());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('generateCardId', () => {
        it('should generate a card ID with correct format', () => {
            const id = generateCardId();
            expect(id).toMatch(/^card-\d+-[a-z0-9]+$/);
        });

        it('should generate unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(generateCardId());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe('generateClientId', () => {
        it('should generate a client ID with correct format', () => {
            const id = generateClientId();
            expect(id).toMatch(/^client-\d+-[a-z0-9]+$/);
        });
    });

    describe('createEmptyState', () => {
        it('should create state with the given board ID', () => {
            const state = createEmptyState('board-test-123');
            expect(state.id).toBe('board-test-123');
        });

        it('should create state with empty cards array', () => {
            const state = createEmptyState('board-test-123');
            expect(state.cards).toEqual([]);
        });

        it('should create state with empty votes object', () => {
            const state = createEmptyState('board-test-123');
            expect(state.votes).toEqual({});
        });
    });
});
