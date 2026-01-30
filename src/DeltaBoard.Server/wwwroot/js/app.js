// Board State Management
const ADJECTIVES = ['bright', 'calm', 'bold', 'swift', 'keen', 'warm', 'cool', 'wise', 'fair', 'true'];
const NOUNS = ['delta', 'spark', 'wave', 'peak', 'flow', 'path', 'bloom', 'light', 'wind', 'star'];

function generateBoardId() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const hash = Math.random().toString(36).substring(2, 6);
    return `board-${adj}-${noun}-${hash}`;
}

function getBoardId() {
    let boardId = window.location.hash.slice(1);
    if (!boardId) {
        boardId = generateBoardId();
        window.location.hash = boardId;
    }
    return boardId;
}

function generateCardId() {
    return `card-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function getClientId() {
    let clientId = localStorage.getItem('deltaboard-client-id');
    if (!clientId) {
        clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        localStorage.setItem('deltaboard-client-id', clientId);
    }
    return clientId;
}

// State
const boardId = getBoardId();
const clientId = getClientId();
let state = loadState();

function loadState() {
    const saved = localStorage.getItem(`deltaboard-${boardId}`);
    if (saved) {
        return JSON.parse(saved);
    }
    return {
        id: boardId,
        cards: [],
        votes: {}
    };
}

function saveState() {
    localStorage.setItem(`deltaboard-${boardId}`, JSON.stringify(state));
}

// Operations
function createCard(column, text) {
    const card = {
        id: generateCardId(),
        column,
        text,
        owner: clientId,
        createdAt: Date.now()
    };
    state.cards.push(card);
    saveState();
    renderCards();
    broadcastOperation({ type: 'createCard', card });
    return card;
}

function editCard(cardId, text) {
    const card = state.cards.find(c => c.id === cardId);
    if (card) {
        card.text = text;
        saveState();
        broadcastOperation({ type: 'editCard', cardId, text });
    }
}

function deleteCard(cardId) {
    const index = state.cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
        state.cards.splice(index, 1);
        delete state.votes[cardId];
        saveState();
        renderCards();
        broadcastOperation({ type: 'deleteCard', cardId });
    }
}

function addVote(cardId) {
    if (!state.votes[cardId]) {
        state.votes[cardId] = [];
    }
    if (!state.votes[cardId].includes(clientId)) {
        state.votes[cardId].push(clientId);
        saveState();
        renderCards();
        broadcastOperation({ type: 'addVote', cardId, voterId: clientId });
    }
}

function removeVote(cardId) {
    if (state.votes[cardId]) {
        const index = state.votes[cardId].indexOf(clientId);
        if (index !== -1) {
            state.votes[cardId].splice(index, 1);
            saveState();
            renderCards();
            broadcastOperation({ type: 'removeVote', cardId, voterId: clientId });
        }
    }
}

function toggleVote(cardId) {
    if (state.votes[cardId]?.includes(clientId)) {
        removeVote(cardId);
    } else {
        addVote(cardId);
    }
}

// Apply remote operations
function applyOperation(op) {
    switch (op.type) {
        case 'requestSync':
            // Another client is requesting sync, send them our state
            sendSyncState(op._connectionId);
            break;

        case 'syncState':
            // Received state from another client, merge it
            // We process ALL syncState messages for resilience against partitioned clients
            mergeState(op.state);
            break;

        case 'createCard':
            if (!state.cards.find(c => c.id === op.card.id)) {
                state.cards.push(op.card);
                saveState();
                renderCards();
            }
            break;

        case 'editCard':
            const cardToEdit = state.cards.find(c => c.id === op.cardId);
            if (cardToEdit) {
                cardToEdit.text = op.text;
                saveState();
                renderCards();
            }
            break;

        case 'deleteCard':
            const delIndex = state.cards.findIndex(c => c.id === op.cardId);
            if (delIndex !== -1) {
                state.cards.splice(delIndex, 1);
                delete state.votes[op.cardId];
                saveState();
                renderCards();
            }
            break;

        case 'addVote':
            if (!state.votes[op.cardId]) {
                state.votes[op.cardId] = [];
            }
            if (!state.votes[op.cardId].includes(op.voterId)) {
                state.votes[op.cardId].push(op.voterId);
                saveState();
                renderCards();
            }
            break;

        case 'removeVote':
            if (state.votes[op.cardId]) {
                const voteIndex = state.votes[op.cardId].indexOf(op.voterId);
                if (voteIndex !== -1) {
                    state.votes[op.cardId].splice(voteIndex, 1);
                    saveState();
                    renderCards();
                }
            }
            break;
    }
}

function sendSyncState(targetConnectionId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'syncState',
            _targetConnectionId: targetConnectionId,
            state: {
                cards: state.cards,
                votes: state.votes
            }
        }));
    }
}

function mergeState(remoteState) {
    if (!remoteState) return;

    // Merge cards (add any we don't have)
    if (remoteState.cards) {
        for (const card of remoteState.cards) {
            if (!state.cards.find(c => c.id === card.id)) {
                state.cards.push(card);
            }
        }
    }

    // Merge votes (union of voter IDs)
    if (remoteState.votes) {
        for (const [cardId, voters] of Object.entries(remoteState.votes)) {
            if (!state.votes[cardId]) {
                state.votes[cardId] = [];
            }
            for (const voter of voters) {
                if (!state.votes[cardId].includes(voter)) {
                    state.votes[cardId].push(voter);
                }
            }
        }
    }

    saveState();
    renderCards();
}

// WebSocket
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${boardId}`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            reconnectAttempts = 0;
            updateConnectionStatus('connected', 'Connected - changes sync in real-time');
            // Request state from other participants
            ws.send(JSON.stringify({ type: 'requestSync' }));
        };

        ws.onclose = (event) => {
            ws = null;
            if (event.code === 4000) {
                updateConnectionStatus('disconnected', 'Board is full (max 20 participants)');
                return;
            }

            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                reconnectAttempts++;
                updateConnectionStatus('disconnected', `Disconnected - reconnecting in ${Math.round(delay / 1000)}s...`);
                setTimeout(connectWebSocket, delay);
            } else {
                updateConnectionStatus('disconnected', 'Disconnected - refresh to reconnect');
            }
        };

        ws.onerror = () => {
            // Error will trigger onclose, no need to handle separately
        };

        ws.onmessage = (event) => {
            try {
                const op = JSON.parse(event.data);
                applyOperation(op);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };
    } catch (e) {
        console.log('WebSocket not available, running in local-only mode');
        updateConnectionStatus('disconnected', 'Local mode - no real-time sync');
    }
}

function broadcastOperation(op) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(op));
    }
}

function updateConnectionStatus(status, message = '') {
    const indicator = document.getElementById('connection-status');
    indicator.className = `status-indicator ${status}`;
    indicator.title = message;
}

// Rendering
function renderCards() {
    const wellContainer = document.getElementById('well-cards');
    const deltaContainer = document.getElementById('delta-cards');

    wellContainer.innerHTML = '';
    deltaContainer.innerHTML = '';

    const wellCards = state.cards.filter(c => c.column === 'well');
    const deltaCards = state.cards.filter(c => c.column === 'delta');

    wellCards.forEach(card => wellContainer.appendChild(createCardElement(card)));
    deltaCards.forEach(card => deltaContainer.appendChild(createCardElement(card)));
}

function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.cardId = card.id;

    const voteCount = state.votes[card.id]?.length || 0;
    const hasVoted = state.votes[card.id]?.includes(clientId);
    const isOwner = card.owner === clientId;

    div.innerHTML = `
        <div class="card-content">${escapeHtml(card.text)}</div>
        <div class="card-actions">
            <button class="vote-btn ${hasVoted ? 'voted' : ''}">
                <span>${hasVoted ? '★' : '☆'}</span>
                <span class="vote-count">${voteCount}</span>
            </button>
            ${isOwner ? '<button class="delete-btn" title="Delete">×</button>' : ''}
        </div>
    `;

    // Card content editing
    const content = div.querySelector('.card-content');
    if (isOwner) {
        content.addEventListener('click', () => {
            content.contentEditable = 'true';
            content.focus();
        });

        content.addEventListener('blur', () => {
            content.contentEditable = 'false';
            const newText = content.textContent.trim();
            if (newText && newText !== card.text) {
                editCard(card.id, newText);
            } else {
                content.textContent = card.text;
            }
        });

        content.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                content.blur();
            }
            if (e.key === 'Escape') {
                content.textContent = card.text;
                content.blur();
            }
        });
    }

    // Vote button
    const voteBtn = div.querySelector('.vote-btn');
    voteBtn.addEventListener('click', () => toggleVote(card.id));

    // Delete button
    const deleteBtn = div.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteCard(card.id));
    }

    return div;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export
function exportToMarkdown() {
    const wellCards = state.cards.filter(c => c.column === 'well');
    const deltaCards = state.cards.filter(c => c.column === 'delta');

    let markdown = `# Retrospective - ${new Date().toLocaleDateString()}\n\n`;

    markdown += `## What Went Well\n\n`;
    wellCards.forEach(card => {
        const votes = state.votes[card.id]?.length || 0;
        markdown += `- ${card.text}${votes > 0 ? ` (${votes} vote${votes > 1 ? 's' : ''})` : ''}\n`;
    });

    markdown += `\n## Delta (What to Adjust)\n\n`;
    deltaCards.forEach(card => {
        const votes = state.votes[card.id]?.length || 0;
        markdown += `- ${card.text}${votes > 0 ? ` (${votes} vote${votes > 1 ? 's' : ''})` : ''}\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retrospective-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Set board title
    document.getElementById('board-title').textContent = `Delta Board - ${boardId}`;

    // Add card buttons
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', () => {
            const column = btn.dataset.column;
            const text = prompt('Enter card text:');
            if (text?.trim()) {
                createCard(column, text.trim());
            }
        });
    });

    // Export button
    document.getElementById('export-btn').addEventListener('click', exportToMarkdown);

    // Initial render
    renderCards();

    // Connect WebSocket
    connectWebSocket();
});

// Handle URL changes
window.addEventListener('hashchange', () => {
    window.location.reload();
});
