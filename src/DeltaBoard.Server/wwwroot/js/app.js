// Main Application Entry Point

import { initLandingPage } from './landing.js';
import { createConnection } from './connection.js';
import { createEmptyState, createCard } from './types.js';
import { applyCardOp, applyVote, getVisibleCards, getVoteCount, hasVoted } from './operations.js';
import { saveBoard, loadBoard } from './storage.js';
import { createSyncManager } from './sync.js';
import { createDedup } from './dedup.js';

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

    // Load persisted state or create empty
    let state = loadBoard(boardId) || createEmptyState();

    // Create deduplication tracker
    const dedup = createDedup();

    // Create sync manager
    const syncManager = createSyncManager(
        () => state,
        {
            onStateReady: (newState) => {
                state = newState;
                persistAndRender();
            },
            onBroadcastState: (stateToSend) => {
                connection.send({
                    type: 'syncState',
                    state: stateToSend
                });
            },
            onBufferedOps: (ops) => {
                // Apply buffered operations after sync completes
                for (const op of ops) {
                    if (op.type === 'cardOp') {
                        applyCardOpAndPersist(op);
                    } else if (op.type === 'vote') {
                        applyVoteAndPersist(op);
                    }
                }
            }
        }
    );

    const connection = createConnection(boardId, {
        onStateChange: (connState) => {
            updateConnectionStatus(statusEl, connState);
            if (connState === 'ready') {
                // Start sync window when connection becomes ready
                syncManager.startSync();
            } else if (connState === 'disconnected' || connState === 'closed') {
                syncManager.cancel();
            }
        },

        onParticipantsUpdate: (participantCount, readyCount, syncForClientId) => {
            console.log(`Participants: ${participantCount}, Ready: ${readyCount}`);
            // TODO: Update UI with participant/ready counts

            // If a new client joined, send them our state
            if (syncForClientId) {
                connection.send({
                    type: 'syncState',
                    targetClientId: syncForClientId,
                    state: state
                });
            }
        },

        onMessage: (message) => {
            // Handle sync-related messages
            if (message.type === 'syncState') {
                syncManager.handleSyncState(message.state);
                return;
            }

            if (message.type === 'requestSync') {
                // Another client wants our state
                connection.send({
                    type: 'syncState',
                    state: state
                });
                return;
            }

            // For operations, check dedup and sync buffering
            if (message.type === 'cardOp') {
                if (message.opId && dedup.isDuplicate(message.opId)) {
                    return; // Already processed
                }
                if (syncManager.handleOperation(message)) {
                    return; // Buffered during sync
                }
                applyCardOpAndPersist(message);
                return;
            }

            if (message.type === 'vote') {
                if (message.opId && dedup.isDuplicate(message.opId)) {
                    return; // Already processed
                }
                if (syncManager.handleOperation(message)) {
                    return; // Buffered during sync
                }
                applyVoteAndPersist(message);
                return;
            }

            console.log('Received:', message);
        },

        onError: (error) => {
            console.error('Connection error:', error);
            // TODO: Show error to user
        }
    });

    // Start connection
    connection.connect();

    // Store for debugging
    window._connection = connection;
    window._state = () => state;

    // Initial render
    renderBoard();

    // Wire up add card buttons
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

            applyCardOpAndPersist(op);
            const opId = connection.broadcast(op);
            // Mark as seen after broadcast (broadcast adds the opId)
            dedup.markSeen(opId);
        });
    });

    function applyCardOpAndPersist(op) {
        state = applyCardOp(state, op);
        persistAndRender();
    }

    function applyVoteAndPersist(op) {
        state = applyVote(state, op);
        persistAndRender();
    }

    function persistAndRender() {
        saveBoard(boardId, state);
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
        el.dataset.cardId = card.id;

        // Card body with content and vote button
        const body = document.createElement('div');
        body.className = 'card-body';

        const content = document.createElement('div');
        content.className = 'card-content';
        content.textContent = card.text;

        const clientId = connection.getClientId();
        const voted = hasVoted(state, card.id, clientId);
        const voteCount = getVoteCount(state, card.id);

        const voteBtn = document.createElement('button');
        voteBtn.className = 'card-votes' + (voted ? ' voted' : '');
        voteBtn.textContent = String(voteCount);
        voteBtn.title = voted ? 'Remove vote' : 'Vote';
        voteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleVote(card, voted);
        });

        body.appendChild(content);
        body.appendChild(voteBtn);
        el.appendChild(body);

        // Card actions (edit/delete) at bottom - only for own cards
        const isOwnCard = card.authorId === clientId;
        if (isOwnCard) {
            const actions = document.createElement('div');
            actions.className = 'card-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn-card-action';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleEditCard(card);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-card-action btn-delete';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleDeleteCard(card);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);
            el.appendChild(actions);
        }

        return el;
    }

    function handleVote(card, currentlyVoted) {
        const clientId = connection.getClientId();

        // Find existing vote to get current rev
        const voteId = `${card.id}:${clientId}`;
        const existingVote = state.votes.find(v => v.id === voteId);
        const currentRev = existingVote ? existingVote.rev : 0;

        const op = {
            type: 'vote',
            cardId: card.id,
            voterId: clientId,
            rev: currentRev + 1,
            isDeleted: currentlyVoted // Toggle: if voted, now remove; if not voted, add
        };

        applyVoteAndPersist(op);
        const opId = connection.broadcast(op);
        dedup.markSeen(opId);
    }

    function handleEditCard(card) {
        const newText = window.prompt('Edit card text', card.text);
        if (!newText || newText === card.text) return;

        const op = {
            type: 'cardOp',
            cardId: card.id,
            column: card.column,
            text: newText,
            authorId: card.authorId,
            rev: card.rev + 1,
            isDeleted: false
        };

        applyCardOpAndPersist(op);
        const opId = connection.broadcast(op);
        dedup.markSeen(opId);
    }

    function handleDeleteCard(card) {
        if (!window.confirm('Delete this card?')) return;

        const op = {
            type: 'cardOp',
            cardId: card.id,
            column: card.column,
            text: card.text,
            authorId: card.authorId,
            rev: card.rev + 1,
            isDeleted: true
        };

        applyCardOpAndPersist(op);
        const opId = connection.broadcast(op);
        dedup.markSeen(opId);
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
