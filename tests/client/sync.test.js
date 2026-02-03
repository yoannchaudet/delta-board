import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSyncManager } from '../../src/DeltaBoard.Server/wwwroot/js/sync.js';

describe('sync manager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('broadcasts merged state after join window even when local tombstone wins', () => {
        const localState = {
            phase: 'forming',
            cards: [
                {
                    id: 'card-1',
                    column: 'well',
                    text: 'Hello',
                    authorId: 'client-a',
                    rev: 2,
                    isDeleted: true
                }
            ],
            votes: []
        };

        const remoteState = {
            phase: 'forming',
            cards: [
                {
                    id: 'card-1',
                    column: 'well',
                    text: 'Hello',
                    authorId: 'client-a',
                    rev: 1,
                    isDeleted: false
                }
            ],
            votes: []
        };

        const onStateReady = vi.fn();
        const onBroadcastState = vi.fn();

        const syncManager = createSyncManager(
            () => localState,
            {
                onStateReady,
                onBroadcastState
            }
        );

        syncManager.startSync();
        syncManager.handleSyncState(remoteState);

        vi.advanceTimersByTime(2000);

        expect(onStateReady).toHaveBeenCalledTimes(1);
        expect(onBroadcastState).toHaveBeenCalledTimes(1);

        const broadcastState = onBroadcastState.mock.calls[0][0];
        expect(broadcastState.cards).toEqual(localState.cards);
    });
});
