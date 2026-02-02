// Main Application Entry Point

import { initLandingPage } from './landing.js';
import { createConnection } from './connection.js';
import { createEmptyState, createCard } from './types.js';
import { applyCardOp, getVisibleCards, getVoteCount } from './operations.js';

/**
 * Detect current page from URL
 * @returns {'landing' | 'board'}
 */
function detectPage() {
    const path = window.location.pathname;
    return path.startsWith('/board/') ? 'board' : 'landing';
}

/**
 * Extract board ID from URL
 * @returns {string | null}
 */
function getBoardId() {
    const match = window.location.pathname.match(/^\/board\/([^/]+)/);
    return match ? match[1] : null;
}

/**
 * Initialize the application
 */
function init() {
    const page = detectPage();

    if (page === 'landing') {
        document.getElementById('landing-page').style.display = 'block';
        document.getElementById('board-page').style.display = 'none';
        document.getElementById('export-btn').style.display = 'none';
        document.getElementById('connection-status').style.display = 'none';
        initLandingPage();
    } else {
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('board-page').style.display = 'grid';
        document.getElementById('header-tagline').style.display = 'none';

        const boardId = getBoardId();
        document.getElementById('board-title').textContent = boardId;

        initBoard(boardId);
    }
}

/**
 * Initialize the board page
 * @param {string} boardId
 */
function initBoard(boardId) {
    const statusEl = document.getElementById('connection-status');
    const wellCardsEl = document.getElementById('well-cards');
    const deltaCardsEl = document.getElementById('delta-cards');
    const addButtons = document.querySelectorAll('.btn-add');

    let state = createEmptyState();

    const connection = createConnection(boardId, {
        onStateChange: (state) => {
            updateConnectionStatus(statusEl, state);
        },

        onParticipantsUpdate: (participantCount, readyCount) => {
            console.log(`Participants: ${participantCount}, Ready: ${readyCount}`);
            // TODO: Update UI with participant/ready counts
        },

        onMessage: (message) => {
            if (message.type === 'cardOp') {
                handleCardOp(message);
            } else {
                console.log('Received:', message);
            }
        },

        onError: (error) => {
            console.error('Connection error:', error);
            // TODO: Show error to user
        }
    });

    // Start connection
    connection.connect();

    // Store connection for debugging
    window._connection = connection;

    addButtons.forEach(button => {
        button.addEventListener('click', () => {
            const column = button.dataset.column;
            if (!column) return;

            const text = window.prompt('Card text');
            if (!text) return;

            const card = createCard(column, text, connection.getClientId());
            const op = {
                type: 'cardOp',
                cardId: card.id,
                column: card.column,
                text: card.text,
                authorId: card.authorId,
                rev: card.rev,
                isDeleted: card.isDeleted
            };

            handleCardOp(op);
            connection.broadcast(op);
        });
    });

    function handleCardOp(op) {
        state = applyCardOp(state, op);
        renderBoard();
    }

    function renderBoard() {
        renderColumn(wellCardsEl, 'well');
        renderColumn(deltaCardsEl, 'delta');
    }

    function renderColumn(container, column) {
        container.innerHTML = '';
        const cards = getVisibleCards(state, column);
        for (const card of cards) {
            container.appendChild(renderCard(card));
        }
    }

    function renderCard(card) {
        const el = document.createElement('div');
        el.className = 'card';

        const body = document.createElement('div');
        body.className = 'card-body';

        const content = document.createElement('div');
        content.className = 'card-content';
        content.textContent = card.text;

        const votes = document.createElement('div');
        votes.className = 'card-votes';
        votes.textContent = String(getVoteCount(state, card.id));

        body.appendChild(content);
        body.appendChild(votes);
        el.appendChild(body);
        return el;
    }
}

/**
 * Update connection status indicator
 * @param {HTMLElement} el
 * @param {string} state
 */
function updateConnectionStatus(el, state) {
    const labels = {
        disconnected: 'Disconnected',
        connecting: 'Connecting...',
        handshaking: 'Connecting...',
        ready: 'Connected',
        closed: 'Disconnected'
    };

    const classes = {
        disconnected: 'status-indicator disconnected',
        connecting: 'status-indicator connecting',
        handshaking: 'status-indicator connecting',
        ready: 'status-indicator connected',
        closed: 'status-indicator disconnected'
    };

    el.textContent = labels[state] || state;
    el.className = classes[state] || 'status-indicator';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
