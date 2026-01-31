// Storage Module - LocalStorage board management

const BOARD_PREFIX = 'deltaboard-';
const CLIENT_ID_KEY = 'deltaboard-client-id';

/**
 * Get all boards from localStorage
 * @returns {Array<{id: string, cardCount: number, lastModified: number|null}>} Boards sorted by most recent
 */
export function getAllBoards() {
    const boards = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        // Skip non-board keys
        if (!key.startsWith(BOARD_PREFIX) || key === CLIENT_ID_KEY) {
            continue;
        }

        const boardId = key.slice(BOARD_PREFIX.length);

        try {
            const data = JSON.parse(localStorage.getItem(key));

            // Skip if no valid cards array
            if (!data || !Array.isArray(data.cards)) {
                continue;
            }

            // Calculate last modified from card timestamps
            let lastModified = null;
            if (data.cards.length > 0) {
                lastModified = Math.max(...data.cards.map(c => c.createdAt || 0));
            }

            boards.push({
                id: boardId,
                cardCount: data.cards.length,
                lastModified
            });
        } catch {
            // Skip corrupted entries
            continue;
        }
    }

    // Sort by last modified (most recent first), null values at the end
    boards.sort((a, b) => {
        if (a.lastModified === null && b.lastModified === null) return 0;
        if (a.lastModified === null) return 1;
        if (b.lastModified === null) return -1;
        return b.lastModified - a.lastModified;
    });

    return boards;
}

/**
 * Delete a board from localStorage
 * @param {string} boardId - The board ID to delete
 */
export function deleteBoard(boardId) {
    localStorage.removeItem(`${BOARD_PREFIX}${boardId}`);
}

/**
 * Check if there are any boards in localStorage
 * @returns {boolean} True if at least one board exists
 */
export function hasBoards() {
    return getAllBoards().length > 0;
}
