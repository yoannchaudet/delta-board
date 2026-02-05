// Deduplication Module - Track seen operation IDs

/**
 * Create a deduplication tracker
 * @returns {Object} Dedup controller
 */
export function createDedup() {
    /** @type {Set<string>} */
    const seenOpIds = new Set();

    /**
     * Check if an operation has been seen before
     * @param {string} opId
     * @returns {boolean} true if this is a duplicate
     */
    function isDuplicate(opId) {
        if (!opId) {
            return false; // No opId means no dedup
        }
        if (seenOpIds.has(opId)) {
            return true;
        }
        seenOpIds.add(opId);
        return false;
    }

    /**
     * Mark an opId as seen (for locally generated operations)
     * @param {string} opId
     */
    function markSeen(opId) {
        if (opId) {
            seenOpIds.add(opId);
        }
    }

    /**
     * Clear all tracked opIds (for testing or reset)
     */
    function clear() {
        seenOpIds.clear();
    }

    /**
     * Get count of tracked opIds (for debugging)
     * @returns {number}
     */
    function size() {
        return seenOpIds.size;
    }

    return {
        isDuplicate,
        markSeen,
        clear,
        size
    };
}
