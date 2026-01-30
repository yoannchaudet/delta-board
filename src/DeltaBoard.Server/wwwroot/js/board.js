// Board and ID generation utilities

// Board ID format: board-{adjective}-{noun}-{hash}
// Total combinations: 20 adjectives × 20 nouns × 36^4 hash = 671,846,400 unique boards
// Collision probability is negligible for typical usage

export const ADJECTIVES = [
    'sleepy', 'grumpy', 'sneaky', 'wobbly', 'fuzzy',
    'bouncy', 'clumsy', 'sassy', 'zesty', 'quirky',
    'sparkly', 'fluffy', 'chunky', 'snazzy', 'zippy',
    'wiggly', 'giggly', 'cosmic', 'turbo', 'mighty'
];

export const NOUNS = [
    'penguin', 'llama', 'platypus', 'narwhal', 'capybara',
    'potato', 'pickle', 'waffle', 'pretzel', 'nugget',
    'wizard', 'ninja', 'pirate', 'unicorn', 'yeti',
    'banana', 'avocado', 'coconut', 'noodle', 'taco'
];

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
