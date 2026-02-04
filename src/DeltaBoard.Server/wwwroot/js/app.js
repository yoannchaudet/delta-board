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
        document.getElementById('connection-status').style.display = 'none';
        document.getElementById('reconnect-btn').style.display = 'none';
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

    // Card input elements
    const cardInputText = document.getElementById('card-input-text');
    const addWellBtn = document.getElementById('add-well-btn');
    const addDeltaBtn = document.getElementById('add-delta-btn');
    const cardInputBar = document.getElementById('card-input-bar');
    const cardInputBarLabel = document.getElementById('card-input-bar-label');
    const cardInputCancel = document.getElementById('card-input-cancel');
    const editOverlay = document.getElementById('edit-overlay');
    const wellBtnLabel = document.getElementById('well-btn-label');
    const deltaBtnLabel = document.getElementById('delta-btn-label');

    // Editing state - null when creating new, card object when editing
    let editingCard = null;

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
            updateParticipantCount(participantCount);

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

    // Reconnect button
    document.getElementById('reconnect-btn').addEventListener('click', () => {
        connection.reconnect();
    });

    // Store for debugging
    window._connection = connection;
    window._state = () => state;

    // Initial render
    renderBoard();

    // Card input: update button states based on textarea content
    function updateAddButtonStates() {
        const hasText = cardInputText.value.trim().length > 0;
        addWellBtn.disabled = !hasText;
        addDeltaBtn.disabled = !hasText;
    }

    cardInputText.addEventListener('input', updateAddButtonStates);
    updateAddButtonStates(); // Initial state

    // Card input: color feedback on button hover
    addWellBtn.addEventListener('mouseenter', () => {
        cardInputText.classList.add('aim-well');
    });
    addWellBtn.addEventListener('mouseleave', () => {
        cardInputText.classList.remove('aim-well');
    });
    addDeltaBtn.addEventListener('mouseenter', () => {
        cardInputText.classList.add('aim-delta');
    });
    addDeltaBtn.addEventListener('mouseleave', () => {
        cardInputText.classList.remove('aim-delta');
    });

    // Card input: submit handlers
    function submitCard(column) {
        const text = cardInputText.value.trim();
        if (!text) return;

        let op;
        if (editingCard) {
            // Editing existing card
            op = {
                type: 'cardOp',
                cardId: editingCard.id,
                column: column,
                text: text,
                authorId: editingCard.authorId,
                rev: editingCard.rev + 1,
                isDeleted: false
            };
        } else {
            // Creating new card
            const card = createCard(column, text, connection.getClientId());
            op = {
                type: 'cardOp',
                cardId: card.id,
                column: card.column,
                text: card.text,
                authorId: card.authorId,
                rev: card.rev,
                isDeleted: card.isDeleted
            };
        }

        applyCardOpAndPersist(op);
        const opId = connection.broadcast(op);
        dedup.markSeen(opId);

        // Clear editing state and input
        clearEditingState();
    }

    function clearEditingState() {
        editingCard = null;
        cardInputText.value = '';
        cardInputText.classList.remove('editing-well', 'editing-delta');
        cardInputBar.classList.remove('editing-well', 'editing-delta');
        cardInputBarLabel.textContent = 'Add card';
        cardInputCancel.style.display = 'none';
        editOverlay.classList.remove('active');
        wellBtnLabel.textContent = 'Add to Went Well';
        deltaBtnLabel.textContent = 'Add to Delta';
        updateAddButtonStates();
    }

    cardInputCancel.addEventListener('click', () => {
        clearEditingState();
        cardInputText.blur();
    });

    editOverlay.addEventListener('click', () => {
        clearEditingState();
        cardInputText.blur();
    });

    addWellBtn.addEventListener('click', () => submitCard('well'));
    addDeltaBtn.addEventListener('click', () => submitCard('delta'));

    // Keyboard shortcuts: Ctrl+Enter for Well, Ctrl+Shift+Enter for Delta, Escape to cancel
    cardInputText.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            clearEditingState();
            cardInputText.blur();
            return;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (e.shiftKey) {
                submitCard('delta');
            } else {
                submitCard('well');
            }
        }
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
        // Set editing state
        editingCard = card;

        // Load card text into textarea
        cardInputText.value = card.text;

        // Apply column-specific styling
        const editClass = card.column === 'well' ? 'editing-well' : 'editing-delta';
        cardInputText.classList.remove('editing-well', 'editing-delta');
        cardInputText.classList.add(editClass);
        cardInputBar.classList.remove('editing-well', 'editing-delta');
        cardInputBar.classList.add(editClass);

        // Update bar and buttons
        cardInputBarLabel.textContent = card.column === 'well' ? 'Editing \u00b7 What Went Well' : 'Editing \u00b7 Delta';
        cardInputCancel.style.display = '';
        wellBtnLabel.textContent = 'Save to Went Well';
        deltaBtnLabel.textContent = 'Save to Delta';

        // Update button states
        updateAddButtonStates();

        // Show overlay
        editOverlay.classList.add('active');

        // Focus and select all text
        cardInputText.focus();
        cardInputText.select();

        // Scroll to input
        cardInputText.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
 * Update participant count display
 * @param {number} count
 */
function updateParticipantCount(count) {
    const el = document.getElementById('participant-count');
    const numEl = document.getElementById('participant-number');
    if (count > 0) {
        // Animate only when the number actually changes
        if (numEl.textContent !== String(count)) {
            numEl.textContent = count;
            numEl.classList.remove('tick');
            // Force reflow so re-adding the class restarts the animation
            void numEl.offsetWidth;
            numEl.classList.add('tick');
        }
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

/**
 * Update connection status indicator
 * @param {HTMLElement} el
 * @param {string} state
 */
function updateConnectionStatus(el, state) {
    const tooltips = {
        disconnected: 'Reconnecting',
        connecting: 'Reconnecting',
        handshaking: 'Reconnecting',
        ready: 'Connected and syncing changes',
        closed: 'Disconnected'
    };

    const classes = {
        disconnected: 'status-indicator connecting',
        connecting: 'status-indicator connecting',
        handshaking: 'status-indicator connecting',
        ready: 'status-indicator connected',
        closed: 'status-indicator disconnected'
    };

    el.textContent = '';
    el.className = classes[state] || 'status-indicator';
    el.title = tooltips[state] || '';

    // Show reconnect button only when permanently disconnected
    const reconnectBtn = document.getElementById('reconnect-btn');
    reconnectBtn.style.display = state === 'closed' ? '' : 'none';

    // Hide participant count when disconnected
    if (state === 'closed') {
        updateParticipantCount(0);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
