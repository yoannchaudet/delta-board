import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllBoards, deleteBoard, hasBoards } from '../../src/DeltaBoard.Server/wwwroot/js/storage.js';

describe('storage', () => {
    // Mock localStorage
    let mockStorage = {};

    beforeEach(() => {
        mockStorage = {};
        global.localStorage = {
            getItem: (key) => mockStorage[key] ?? null,
            setItem: (key, value) => { mockStorage[key] = value; },
            removeItem: (key) => { delete mockStorage[key]; },
            key: (index) => Object.keys(mockStorage)[index],
            get length() { return Object.keys(mockStorage).length; },
            clear: () => { mockStorage = {}; }
        };
    });

    afterEach(() => {
        mockStorage = {};
    });

    describe('getAllBoards', () => {
        it('should return empty array when no boards exist', () => {
            expect(getAllBoards()).toEqual([]);
        });

        it('should skip client-id key', () => {
            mockStorage['deltaboard-client-id'] = 'test-client-123';

            expect(getAllBoards()).toEqual([]);
        });

        it('should skip corrupted entries', () => {
            mockStorage['deltaboard-valid-board'] = JSON.stringify({
                id: 'valid-board',
                cards: [{ id: 'card-1', createdAt: 1000 }]
            });
            mockStorage['deltaboard-invalid-json'] = 'not valid json{{{';
            mockStorage['deltaboard-missing-cards'] = JSON.stringify({ id: 'no-cards' });
            mockStorage['deltaboard-null-cards'] = JSON.stringify({ id: 'null', cards: null });

            const boards = getAllBoards();
            expect(boards).toHaveLength(1);
            expect(boards[0].id).toBe('valid-board');
        });

        it('should return boards sorted by last modified (most recent first)', () => {
            mockStorage['deltaboard-old-board'] = JSON.stringify({
                id: 'old-board',
                cards: [{ id: 'card-1', createdAt: 1000 }]
            });
            mockStorage['deltaboard-new-board'] = JSON.stringify({
                id: 'new-board',
                cards: [{ id: 'card-2', createdAt: 3000 }]
            });
            mockStorage['deltaboard-mid-board'] = JSON.stringify({
                id: 'mid-board',
                cards: [{ id: 'card-3', createdAt: 2000 }]
            });

            const boards = getAllBoards();
            expect(boards).toHaveLength(3);
            expect(boards[0].id).toBe('new-board');
            expect(boards[1].id).toBe('mid-board');
            expect(boards[2].id).toBe('old-board');
        });

        it('should calculate card count correctly', () => {
            mockStorage['deltaboard-test-board'] = JSON.stringify({
                id: 'test-board',
                cards: [
                    { id: 'card-1', createdAt: 1000 },
                    { id: 'card-2', createdAt: 2000 },
                    { id: 'card-3', createdAt: 3000 }
                ]
            });

            const boards = getAllBoards();
            expect(boards[0].cardCount).toBe(3);
        });

        it('should handle empty cards array', () => {
            mockStorage['deltaboard-empty-board'] = JSON.stringify({
                id: 'empty-board',
                cards: []
            });

            const boards = getAllBoards();
            expect(boards).toHaveLength(1);
            expect(boards[0].cardCount).toBe(0);
            expect(boards[0].lastModified).toBeNull();
        });

        it('should use max createdAt as lastModified', () => {
            mockStorage['deltaboard-test-board'] = JSON.stringify({
                id: 'test-board',
                cards: [
                    { id: 'card-1', createdAt: 1000 },
                    { id: 'card-2', createdAt: 5000 },
                    { id: 'card-3', createdAt: 3000 }
                ]
            });

            const boards = getAllBoards();
            expect(boards[0].lastModified).toBe(5000);
        });

        it('should sort boards with null lastModified at the end', () => {
            mockStorage['deltaboard-with-cards'] = JSON.stringify({
                id: 'with-cards',
                cards: [{ id: 'card-1', createdAt: 1000 }]
            });
            mockStorage['deltaboard-empty'] = JSON.stringify({
                id: 'empty',
                cards: []
            });

            const boards = getAllBoards();
            expect(boards[0].id).toBe('with-cards');
            expect(boards[1].id).toBe('empty');
        });
    });

    describe('deleteBoard', () => {
        it('should remove board from localStorage', () => {
            mockStorage['deltaboard-test-board'] = JSON.stringify({
                id: 'test-board',
                cards: []
            });

            deleteBoard('test-board');

            expect(mockStorage['deltaboard-test-board']).toBeUndefined();
        });

        it('should not throw when deleting non-existent board', () => {
            expect(() => deleteBoard('non-existent')).not.toThrow();
        });
    });

    describe('hasBoards', () => {
        it('should return false when no boards exist', () => {
            expect(hasBoards()).toBe(false);
        });

        it('should return false when only client-id exists', () => {
            mockStorage['deltaboard-client-id'] = 'test-client-123';

            expect(hasBoards()).toBe(false);
        });

        it('should return true when at least one board exists', () => {
            mockStorage['deltaboard-test-board'] = JSON.stringify({
                id: 'test-board',
                cards: []
            });

            expect(hasBoards()).toBe(true);
        });
    });
});
