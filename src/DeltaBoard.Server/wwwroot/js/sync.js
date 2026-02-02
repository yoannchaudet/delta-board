// Sync Module - Join-time state synchronization

import { mergeState } from './merge.js';
import { createEmptyState } from './types.js';

const SYNC_WINDOW_MS = 2000; // Wait 2 seconds for syncState messages

/**
 * @typedef {import('./types.js').BoardState} BoardState
 */

/**
 * @typedef {Object} SyncCallbacks
 * @property {(state: BoardState) => void} onStateReady - Called when sync is complete
 * @property {(state: BoardState) => void} onBroadcastState - Called when we should broadcast our state
 * @property {(ops: Array<Object>) => void} [onBufferedOps] - Called with buffered operations after sync
 */

/**
 * Create a sync manager for a board session
 * @param {() => BoardState | null} getLocalState - Function to get current local state
 * @param {SyncCallbacks} callbacks
 * @returns {Object} Sync controller
 */
export function createSyncManager(getLocalState, callbacks) {
    /** @type {boolean} */
    let isSyncing = false;

    /** @type {BoardState[]} */
    let receivedStates = [];

    /** @type {Array<{type: string, [key: string]: any}>} */
    let bufferedOps = [];

    /** @type {number | null} */
    let syncTimeout = null;

    /**
     * Start the sync window after receiving welcome
     * Called when connection transitions to ready state
     */
    function startSync() {
        isSyncing = true;
        receivedStates = [];
        bufferedOps = [];

        // Set timeout to complete sync after window
        syncTimeout = setTimeout(() => {
            completeSync();
        }, SYNC_WINDOW_MS);
    }

    /**
     * Handle an incoming syncState message
     * @param {BoardState} state
     */
    function handleSyncState(state) {
        if (isSyncing) {
            receivedStates.push(state);
        } else {
            // Late syncState - merge immediately
            const local = getLocalState() || createEmptyState();
            const { state: merged, changed } = mergeState(local, state);
            if (changed) {
                callbacks.onStateReady(merged);
            }
        }
    }

    /**
     * Handle an incoming operation during sync
     * @param {Object} op - The operation (cardOp or vote)
     * @returns {boolean} true if buffered, false if should be applied immediately
     */
    function handleOperation(op) {
        if (isSyncing) {
            bufferedOps.push(op);
            return true; // Buffered
        }
        return false; // Apply immediately
    }

    /**
     * Complete the sync process
     */
    function completeSync() {
        if (!isSyncing) return;

        isSyncing = false;
        if (syncTimeout !== null) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }

        // Start with local state or empty
        let finalState = getLocalState() || createEmptyState();
        let changed = false;

        // Merge all received states
        for (const remoteState of receivedStates) {
            const result = mergeState(finalState, remoteState);
            finalState = result.state;
            if (result.changed) {
                changed = true;
            }
        }

        // Notify that state is ready
        callbacks.onStateReady(finalState);

        // If state changed from merge, broadcast our merged state
        if (changed && receivedStates.length > 0) {
            callbacks.onBroadcastState(finalState);
        }

        // Apply buffered operations
        const ops = bufferedOps;
        bufferedOps = [];
        receivedStates = [];

        if (ops.length > 0) {
            callbacks.onBufferedOps?.(ops);
        }

        return ops;
    }

    /**
     * Get buffered operations (after sync completes)
     * @returns {Array<Object>}
     */
    function getBufferedOps() {
        return bufferedOps;
    }

    /**
     * Check if currently in sync window
     * @returns {boolean}
     */
    function isSyncInProgress() {
        return isSyncing;
    }

    /**
     * Cancel sync (on disconnect)
     */
    function cancel() {
        isSyncing = false;
        if (syncTimeout !== null) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }
        receivedStates = [];
        bufferedOps = [];
    }

    return {
        startSync,
        handleSyncState,
        handleOperation,
        completeSync,
        getBufferedOps,
        isSyncInProgress,
        cancel
    };
}
