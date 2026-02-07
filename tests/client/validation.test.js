import { describe, expect, it } from 'vitest';
import {
    validateIncomingCardOp,
    validateIncomingVoteOp,
    validateIncomingPhaseChange,
    validateLocalCardOp,
    validateLocalVoteOp
} from '../../src/DeltaBoard.Server/wwwroot/js/validation.js';

function baseState() {
    return {
        version: 1,
        phase: 'forming',
        cards: [
            { id: 'card-1', column: 'well', text: 'A', authorId: 'client-1', rev: 2, isDeleted: false }
        ],
        votes: [
            { id: 'card-1:client-2', cardId: 'card-1', voterId: 'client-2', rev: 3, isDeleted: false }
        ]
    };
}

describe('validation', () => {
    it('rejects incoming card ops with lower rev', () => {
        const state = baseState();
        const op = {
            type: 'cardOp',
            opId: 'op-1',
            senderId: 'client-1',
            action: 'edit',
            phase: 'forming',
            cardId: 'card-1',
            column: 'well',
            text: 'Updated',
            authorId: 'client-1',
            rev: 1
        };
        expect(validateIncomingCardOp(op, state, 'forming')).toBe(false);
    });

    it('rejects incoming vote ops with lower rev', () => {
        const state = baseState();
        const op = {
            type: 'vote',
            opId: 'op-2',
            senderId: 'client-2',
            action: 'add',
            phase: 'forming',
            cardId: 'card-1',
            voterId: 'client-2',
            rev: 2
        };
        expect(validateIncomingVoteOp(op, state, 'forming')).toBe(false);
    });

    it('rejects incoming forming ops when local phase is reviewing', () => {
        const state = baseState();
        const op = {
            type: 'cardOp',
            opId: 'op-3',
            senderId: 'client-1',
            action: 'edit',
            phase: 'forming',
            cardId: 'card-1',
            column: 'well',
            text: 'Updated',
            authorId: 'client-1',
            rev: 3
        };
        expect(validateIncomingCardOp(op, state, 'reviewing')).toBe(false);
    });

    it('rejects incoming card ops when senderId does not match authorId', () => {
        const state = baseState();
        const op = {
            type: 'cardOp',
            opId: 'op-3b',
            senderId: 'client-2',
            action: 'edit',
            phase: 'forming',
            cardId: 'card-1',
            column: 'well',
            text: 'Updated',
            authorId: 'client-1',
            rev: 3
        };
        expect(validateIncomingCardOp(op, state, 'forming')).toBe(false);
    });

    it('rejects incoming vote ops when senderId does not match voterId', () => {
        const state = baseState();
        const op = {
            type: 'vote',
            opId: 'op-3c',
            senderId: 'client-1',
            action: 'add',
            phase: 'forming',
            cardId: 'card-1',
            voterId: 'client-2',
            rev: 4
        };
        expect(validateIncomingVoteOp(op, state, 'forming')).toBe(false);
    });

    it('accepts incoming phaseChanged to reviewing', () => {
        const op = { type: 'phaseChanged', opId: 'op-4', senderId: 'client-1', phase: 'reviewing' };
        expect(validateIncomingPhaseChange(op, 'forming')).toBe(true);
    });

    it('rejects local card ops when authorId does not match clientId', () => {
        const state = baseState();
        const op = {
            type: 'cardOp',
            action: 'edit',
            phase: 'forming',
            cardId: 'card-1',
            column: 'well',
            text: 'Updated',
            authorId: 'client-2',
            rev: 3
        };
        expect(validateLocalCardOp(op, state, 'forming', 'client-1')).toBe(false);
    });

    it('rejects local vote ops when voterId does not match clientId', () => {
        const state = baseState();
        const op = {
            type: 'vote',
            action: 'add',
            phase: 'forming',
            cardId: 'card-1',
            voterId: 'client-1',
            rev: 4
        };
        expect(validateLocalVoteOp(op, state, 'forming', 'client-2')).toBe(false);
    });

    it('rejects local card ops with non-monotonic rev', () => {
        const state = baseState();
        const op = {
            type: 'cardOp',
            action: 'edit',
            phase: 'forming',
            cardId: 'card-1',
            column: 'well',
            text: 'Updated',
            authorId: 'client-1',
            rev: 2
        };
        expect(validateLocalCardOp(op, state, 'forming', 'client-1')).toBe(false);
    });
});
