import { describe, expect, it } from 'vitest';
import { generateMarkdown, quorumNeeded } from '../../src/DeltaBoard.Server/wwwroot/js/review.js';

describe('review presentation', () => {
    it.each([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 2],
        [4, 3],
        [5, 3],
        [10, 6],
        [20, 12]
    ])('requires the correct quorum for %i participants', (participants, expected) => {
        expect(quorumNeeded(participants)).toBe(expected);
    });

    it('exports visible cards by vote count with multiline and plural labels', () => {
        const state = {
            phase: 'reviewing',
            cards: [
                {
                    id: 'well-low',
                    column: 'well',
                    text: 'One vote',
                    authorId: 'owner',
                    rev: 1,
                    isDeleted: false
                },
                {
                    id: 'well-high',
                    column: 'well',
                    text: 'Two votes\nSecond line',
                    authorId: 'owner',
                    rev: 1,
                    isDeleted: false
                },
                {
                    id: 'deleted',
                    column: 'delta',
                    text: 'Do not export',
                    authorId: 'owner',
                    rev: 2,
                    isDeleted: true
                }
            ],
            votes: [
                { id: 'well-low:a', cardId: 'well-low', voterId: 'a', rev: 1, isDeleted: false },
                { id: 'well-high:a', cardId: 'well-high', voterId: 'a', rev: 1, isDeleted: false },
                { id: 'well-high:b', cardId: 'well-high', voterId: 'b', rev: 1, isDeleted: false },
                { id: 'deleted:a', cardId: 'deleted', voterId: 'a', rev: 1, isDeleted: false }
            ]
        };

        const markdown = generateMarkdown('test-board', state);

        expect(markdown).toBe(
            '# test-board\n\n' +
            '## What Went Well\n\n' +
            '- Two votes\n\n  Second line (2 votes)\n' +
            '- One vote (1 vote)\n' +
            '\n## Delta\n\n' +
            '_No cards._\n'
        );
        expect(markdown).not.toContain('Do not export');
    });

    it('exports explicit empty states', () => {
        expect(generateMarkdown('empty-board', {
            phase: 'reviewing',
            cards: [],
            votes: []
        })).toBe(
            '# empty-board\n\n' +
            '## What Went Well\n\n' +
            '_No cards._\n' +
            '\n## Delta\n\n' +
            '_No cards._\n'
        );
    });
});
