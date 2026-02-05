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

            const cardCount = data.cards.filter(c => !c.isDeleted).length;
            const voteCount = Array.isArray(data.votes)
                ? data.votes.filter(v => !v.isDeleted).length
                : 0;

            boards.push({
                id: boardId,
                cardCount,
                voteCount,
                phase: data.phase || 'forming',
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

/**
 * Get or create a persistent client ID
 * @returns {string} The client ID
 */
export function getClientId() {
    let clientId = localStorage.getItem(CLIENT_ID_KEY);
    if (!clientId) {
        clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        localStorage.setItem(CLIENT_ID_KEY, clientId);
    }
    return clientId;
}

/**
 * Save board state to localStorage
 * @param {string} boardId
 * @param {import('./types.js').BoardState} state
 */
export function saveBoard(boardId, state) {
    const key = `${BOARD_PREFIX}${boardId}`;
    const data = {
        ...state,
        lastModified: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Load board state from localStorage
 * @param {string} boardId
 * @returns {import('./types.js').BoardState | null}
 */
export function loadBoard(boardId) {
    const key = `${BOARD_PREFIX}${boardId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
        return null;
    }

    try {
        const data = JSON.parse(raw);
        // Validate basic structure
        if (!data || typeof data.phase !== 'string' || !Array.isArray(data.cards) || !Array.isArray(data.votes)) {
            return null;
        }
        return {
            phase: data.phase,
            cards: data.cards,
            votes: data.votes
        };
    } catch {
        return null;
    }
}
