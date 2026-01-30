// Board and ID generation utilities

export const ADJECTIVES = ['bright', 'calm', 'bold', 'swift', 'keen', 'warm', 'cool', 'wise', 'fair', 'true'];
export const NOUNS = ['delta', 'spark', 'wave', 'peak', 'flow', 'path', 'bloom', 'light', 'wind', 'star'];

export function generateBoardId() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const hash = Math.random().toString(36).substring(2, 6);
    return `board-${adj}-${noun}-${hash}`;
}

export function generateCardId() {
    return `card-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateClientId() {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export function createEmptyState(boardId) {
    return {
        id: boardId,
        cards: [],
        votes: {}
    };
}
