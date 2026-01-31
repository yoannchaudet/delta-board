// Delta Board - Main Application Entry Point

import { generateBoardId, generateClientId, createEmptyState } from './board.js';
import * as ops from './operations.js';
import * as sync from './sync.js';
import { initLandingPage } from './landing.js';

// === State Management ===

const BOARD_PATH_PREFIX = '/board/';

function isLandingPage() {
    const path = window.location.pathname;
    return path === '/' || path === '/index.html';
}

function getBoardId() {
    const path = window.location.pathname;

    // Check if we're on a board route
    if (path.startsWith(BOARD_PATH_PREFIX)) {
        return path.slice(BOARD_PATH_PREFIX.length);
    }

    // Not on a board route - return null (landing page handles this)
    return null;
}

function getClientId() {
    let clientId = localStorage.getItem('deltaboard-client-id');
    if (!clientId) {
        clientId = generateClientId();
        localStorage.setItem('deltaboard-client-id', clientId);
    }
    return clientId;
}

function loadState(boardId) {
    const saved = localStorage.getItem(`deltaboard-${boardId}`);
    if (saved) {
        return JSON.parse(saved);
    }
    // Create and save empty state so board appears in boards list
    const state = createEmptyState(boardId);
    saveState(boardId, state);
    return state;
}

function saveState(boardId, state) {
    localStorage.setItem(`deltaboard-${boardId}`, JSON.stringify(state));
}

// === Application State ===

let boardId = null;
let clientId = null;
let state = null;

// === Operations (with side effects) ===

function createCard(column, text) {
    const result = ops.createCard(state, { column, text, owner: clientId });
    state = result.state;
    saveState(boardId, state);
    renderCards();
    broadcastOperation({ type: 'createCard', card: result.card });
    return result.card;
}

function editCard(cardId, text) {
    const newState = ops.editCard(state, cardId, text);
    if (newState !== state) {
        state = newState;
        saveState(boardId, state);
        broadcastOperation({ type: 'editCard', cardId, text });
    }
}

function deleteCard(cardId) {
    const newState = ops.deleteCard(state, cardId);
    if (newState !== state) {
        state = newState;
        saveState(boardId, state);
        renderCards();
        broadcastOperation({ type: 'deleteCard', cardId });
    }
}

function toggleVote(cardId) {
    const hadVote = ops.hasVoted(state, cardId, clientId);
    state = ops.toggleVote(state, cardId, clientId);
    saveState(boardId, state);
    renderCards();

    if (hadVote) {
        broadcastOperation({ type: 'removeVote', cardId, voterId: clientId });
    } else {
        broadcastOperation({ type: 'addVote', cardId, voterId: clientId });
    }
}

// === Remote Operations ===

function applyRemoteOperation(operation) {
    switch (operation.type) {
        case 'requestSync':
            sendSyncState(operation._connectionId);
            break;

        case 'syncState':
            state = sync.mergeState(state, operation.state);
            saveState(boardId, state);
            renderCards();
            break;

        default: {
            const result = sync.applyOperation(state, operation);
            if (result.handled) {
                state = result.state;
                saveState(boardId, state);
                renderCards();
            }
            break;
        }
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

// === WebSocket ===

let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/board/${boardId}/ws`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            reconnectAttempts = 0;
            updateConnectionStatus('connected', 'Connected - changes sync in real-time');
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
            // Error will trigger onclose
        };

        ws.onmessage = (event) => {
            try {
                const operation = JSON.parse(event.data);
                applyRemoteOperation(operation);
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };
    } catch (e) {
        console.log('WebSocket not available, running in local-only mode');
        updateConnectionStatus('disconnected', 'Local mode - no real-time sync');
    }
}

function broadcastOperation(operation) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(operation));
    }
}

function updateConnectionStatus(status, message = '') {
    const indicator = document.getElementById('connection-status');
    indicator.className = `status-indicator ${status}`;
    indicator.title = message;
}

// === Rendering ===

function renderCards() {
    const wellContainer = document.getElementById('well-cards');
    const deltaContainer = document.getElementById('delta-cards');

    wellContainer.innerHTML = '';
    deltaContainer.innerHTML = '';

    const wellCards = ops.getCardsByColumn(state, 'well');
    const deltaCards = ops.getCardsByColumn(state, 'delta');

    wellCards.forEach(card => wellContainer.appendChild(createCardElement(card)));
    deltaCards.forEach(card => deltaContainer.appendChild(createCardElement(card)));
}

function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.cardId = card.id;

    const voteCount = ops.getVoteCount(state, card.id);
    const hasVoted = ops.hasVoted(state, card.id, clientId);
    const isOwner = card.owner === clientId;

    // Build controls based on ownership and vote status
    let controlsHtml = '';
    if (isOwner) {
        controlsHtml = `
            <button class="card-control edit-btn">✏️ Edit</button>
            <button class="card-control delete-btn">🗑️ Delete</button>
        `;
    } else {
        if (hasVoted) {
            controlsHtml = `<button class="card-control vote-btn voted">Remove vote</button>`;
        } else {
            controlsHtml = `<button class="card-control vote-btn">👍 Vote</button>`;
        }
    }

    div.innerHTML = `
        <div class="card-body">
            <div class="card-content">${escapeHtml(card.text)}</div>
            ${voteCount > 0 ? `<div class="card-votes">+${voteCount}</div>` : ''}
        </div>
        <div class="card-controls">
            ${controlsHtml}
        </div>
    `;

    const content = div.querySelector('.card-content');

    // Edit button click handler (for owners)
    const editBtn = div.querySelector('.edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            content.contentEditable = 'true';
            content.focus();
        });

        content.addEventListener('blur', () => {
            content.contentEditable = 'false';
            const newText = content.innerText.trim();
            if (newText && newText !== card.text) {
                editCard(card.id, newText);
            } else {
                content.innerText = card.text;
            }
        });

        content.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                content.blur();
            }
            if (e.key === 'Escape') {
                content.innerText = card.text;
                content.blur();
            }
        });
    }

    // Vote button (only for non-owners)
    const voteBtn = div.querySelector('.vote-btn');
    if (voteBtn) {
        voteBtn.addEventListener('click', () => toggleVote(card.id));
    }

    const deleteBtn = div.querySelector('.delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Delete this card? This cannot be undone.')) {
                deleteCard(card.id);
            }
        });
    }

    return div;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === Export ===

function exportToMarkdown() {
    const wellCards = ops.getCardsByColumn(state, 'well');
    const deltaCards = ops.getCardsByColumn(state, 'delta');

    let markdown = `# Retrospective - ${new Date().toLocaleDateString()}\n\n`;

    markdown += `## What Went Well\n\n`;
    wellCards.forEach(card => {
        const votes = ops.getVoteCount(state, card.id);
        markdown += `- ${card.text}${votes > 0 ? ` (${votes} vote${votes > 1 ? 's' : ''})` : ''}\n`;
    });

    markdown += `\n## Delta (What to Adjust)\n\n`;
    deltaCards.forEach(card => {
        const votes = ops.getVoteCount(state, card.id);
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

// === Board Initialization ===

function initBoard(id) {
    boardId = id;
    clientId = getClientId();
    state = loadState(boardId);

    // Show board page, hide landing
    document.getElementById('landing-page').style.display = 'none';
    document.getElementById('board-page').style.display = '';

    // Hide tagline on board view
    document.getElementById('header-tagline').style.display = 'none';

    document.getElementById('board-title').textContent = `Delta Board - ${boardId}`;

    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', () => {
            const column = btn.dataset.column;
            const text = prompt('Enter card text:');
            if (text?.trim()) {
                createCard(column, text.trim());
            }
        });
    });

    document.getElementById('export-btn').addEventListener('click', exportToMarkdown);

    renderCards();
    connectWebSocket();
}

// === Initialization ===

document.addEventListener('DOMContentLoaded', () => {
    if (isLandingPage()) {
        // Show landing page, hide board
        document.getElementById('landing-page').style.display = '';
        document.getElementById('board-page').style.display = 'none';
        // Hide board-specific header elements
        document.querySelector('.header-actions').style.display = 'none';
        initLandingPage();
    } else {
        const id = getBoardId();
        if (id) {
            initBoard(id);
        }
    }
});
