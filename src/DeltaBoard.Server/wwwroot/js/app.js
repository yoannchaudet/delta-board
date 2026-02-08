// Main Application Entry Point

// Register service worker for offline support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
}

import { initLandingPage } from './landing.js';
import { createConnection } from './connection.js';
import { createEmptyState, createCard } from './types.js';
import { applyCardOp, applyVote, getVisibleCards, getVoteCount, hasVoted } from './operations.js';
import { saveBoard, loadBoard } from './storage.js';
import { createSyncManager } from './sync.js';
import { createDedup } from './dedup.js';
import {
    validateIncomingCardOp,
    validateIncomingVoteOp,
    validateIncomingPhaseChange,
    validateLocalCardOp,
    validateLocalVoteOp
} from './validation.js';

// Module-level phase so status functions can check it
let currentPhase = 'forming';

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
        document.getElementById('landing-title').style.display = 'none';
        document.getElementById('board-breadcrumb').style.display = '';

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

    // Ready state
    let isReady = false;
    const readyBtn = document.getElementById('ready-btn');

    // Load persisted state or create empty (and persist immediately for new boards)
    let state = loadBoard(boardId);
    if (!state) {
        state = createEmptyState();
        saveBoard(boardId, state);
    }

    // Create deduplication tracker
    const dedup = createDedup();

    // Create sync manager
    const syncManager = createSyncManager(
        () => state,
        {
            onStateReady: (newState) => {
                const wasForming = state.phase === 'forming';
                state = newState;
                persistAndRender();
                if (wasForming && state.phase === 'reviewing') {
                    enterReviewPhase();
                }
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
                // Reset ready state (server forgets on reconnect)
                isReady = false;
                readyBtn.classList.remove('active');
                // Start sync window when connection becomes ready
                syncManager.startSync();
            } else if (connState === 'disconnected' || connState === 'closed') {
                syncManager.cancel();
            }
        },

        onParticipantsUpdate: (participantCount, readyCount, syncForClientId) => {
            console.log(`Participants: ${participantCount}, Ready: ${readyCount}`);
            updatePresence(participantCount, readyCount);
            updateQuorumBanner(participantCount, readyCount);

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

            // For operations, check dedup and sync buffering
            if (message.type === 'cardOp') {
                if (!validateIncomingCardOp(message, state, state.phase)) {
                    return;
                }
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
                if (!validateIncomingVoteOp(message, state, state.phase)) {
                    return;
                }
                if (message.opId && dedup.isDuplicate(message.opId)) {
                    return; // Already processed
                }
                if (syncManager.handleOperation(message)) {
                    return; // Buffered during sync
                }
                applyVoteAndPersist(message);
                return;
            }

            if (message.type === 'phaseChanged') {
                if (!validateIncomingPhaseChange(message, state.phase)) {
                    return;
                }
                if (message.opId && dedup.isDuplicate(message.opId)) {
                    return;
                }
                if (message.phase === 'reviewing') {
                    enterReviewPhase();
                }
                return;
            }

            console.log('Received:', message);
        },

        onError: ({ code, message }) => {
            console.error('Connection error:', code, message);
            if (code) {
                showErrorOverlay(code, message);
            }
        }
    });

    // Start connection
    connection.connect();

    // Reconnect button
    document.getElementById('reconnect-btn').addEventListener('click', () => {
        connection.reconnect();
    });

    // Back to boards
    document.getElementById('back-to-boards').addEventListener('click', (e) => {
        if (cardInputText.value.trim()) {
            e.preventDefault();
            if (confirm('You have unsaved text in the editor. Leave anyway?')) {
                window.location.href = '/';
            }
        }
    });

    // Ready button
    readyBtn.addEventListener('click', () => {
        isReady = !isReady;
        readyBtn.classList.toggle('active', isReady);
        connection.send({ type: 'setReady', isReady });
    });

    // Quorum banner
    const quorumWrapper = document.getElementById('quorum-banner-wrapper');
    document.getElementById('start-review-btn').addEventListener('click', () => {
        if (!confirm('Start the review phase?\n\nThis cannot be undone. Columns and votes will be frozen for all participants.')) {
            return;
        }
        connection.broadcast({ type: 'phaseChanged', phase: 'reviewing' });
        enterReviewPhase();
    });

    function updateQuorumBanner(participantCount, readyCount) {
        if (currentPhase === 'reviewing') {
            quorumWrapper.classList.remove('visible');
            return;
        }
        const needed = quorumNeeded(participantCount);
        const reached = participantCount > 0 && readyCount >= needed;
        quorumWrapper.classList.toggle('visible', reached);
    }

    function enterReviewPhase() {
        state.phase = 'reviewing';
        currentPhase = 'reviewing';
        saveBoard(boardId, state);

        // Hide forming-phase UI
        document.querySelector('.card-input').style.display = 'none';
        quorumWrapper.classList.remove('visible');
        readyBtn.style.display = 'none';

        // Hide ready count from presence
        document.getElementById('ready-count').innerHTML = '';

        // Show phase chip and export button
        document.getElementById('phase-chip').style.display = '';
        document.getElementById('download-btn').style.display = '';

        renderBoard();
    }

    function formatCardMarkdown(card) {
        const votes = getVoteCount(state, card.id);
        const voteLabel = votes === 1 ? '1 vote' : `${votes} votes`;
        const lines = card.text.split('\n');
        const first = `- ${lines[0]}`;
        const rest = lines.slice(1).map(line => line ? `  ${line}` : '');
        return [first, ...rest].join('\n\n') + ` (${voteLabel})\n`;
    }

    function generateMarkdown() {
        const wellCards = getVisibleCards(state, 'well')
            .sort((a, b) => getVoteCount(state, b.id) - getVoteCount(state, a.id));
        const deltaCards = getVisibleCards(state, 'delta')
            .sort((a, b) => getVoteCount(state, b.id) - getVoteCount(state, a.id));

        let md = `# ${boardId}\n\n`;

        md += '## What Went Well\n\n';
        if (wellCards.length === 0) {
            md += '_No cards._\n';
        } else {
            for (const card of wellCards) {
                md += formatCardMarkdown(card);
            }
        }

        md += '\n## Delta\n\n';
        if (deltaCards.length === 0) {
            md += '_No cards._\n';
        } else {
            for (const card of deltaCards) {
                md += formatCardMarkdown(card);
            }
        }

        return md;
    }

    document.getElementById('download-btn').addEventListener('click', () => {
        const md = generateMarkdown();
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${boardId}.md`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Offline indicator chip
    const offlineChip = document.getElementById('offline-chip');
    function updateOfflineChip() {
        offlineChip.style.display = navigator.onLine ? 'none' : '';
    }
    window.addEventListener('online', () => {
        updateOfflineChip();
        if (connection.getState() === 'closed') {
            connection.reconnect();
        }
    });
    window.addEventListener('offline', updateOfflineChip);
    updateOfflineChip();

    // Store for debugging
    window._connection = connection;
    window._state = () => state;

    // Initial render
    renderBoard();

    // If board was already in reviewing phase (e.g. page reload), apply review UI
    if (state.phase === 'reviewing') {
        enterReviewPhase();
    }

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
                action: 'edit',
                phase: state.phase,
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
                action: 'create',
                phase: state.phase,
                cardId: card.id,
                column: card.column,
                text: card.text,
                authorId: card.authorId,
                rev: card.rev,
                isDeleted: card.isDeleted
            };
        }

        if (!validateLocalCardOp(op, state, state.phase, connection.getClientId())) {
            return;
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

        // In review phase, sort by vote count descending
        if (state.phase === 'reviewing') {
            cards.sort((a, b) => getVoteCount(state, b.id) - getVoteCount(state, a.id));
        }

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
        const isOwnCard = card.authorId === clientId;

        const isReviewing = state.phase === 'reviewing';

        if (isReviewing) {
            // Static vote count display
            const voteBadge = document.createElement('span');
            voteBadge.className = 'card-votes';
            voteBadge.textContent = String(voteCount);

            body.appendChild(content);
            body.appendChild(voteBadge);
            el.appendChild(body);
            return el;
        }

        const voteBtn = document.createElement('button');
        voteBtn.className = 'card-votes' + (voted ? ' voted' : '');
        voteBtn.textContent = String(voteCount);
        if (isOwnCard) {
            voteBtn.disabled = true;
            voteBtn.classList.add('disabled');
            voteBtn.title = "Can't vote on your own card";
        } else {
            voteBtn.title = voted ? 'Remove vote' : 'Vote';
            voteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleVote(card, voted);
            });
        }

        body.appendChild(content);
        body.appendChild(voteBtn);
        el.appendChild(body);

        // Card actions (edit/delete) at bottom - only for own cards
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
        if (card.authorId === clientId) {
            return;
        }

        // Find existing vote to get current rev
        const voteId = `${card.id}:${clientId}`;
        const existingVote = state.votes.find(v => v.id === voteId);
        const currentRev = existingVote ? existingVote.rev : 0;

        const op = {
            type: 'vote',
            action: currentlyVoted ? 'remove' : 'add',
            phase: state.phase,
            cardId: card.id,
            voterId: clientId,
            rev: currentRev + 1,
            isDeleted: currentlyVoted // Toggle: if voted, now remove; if not voted, add
        };

        if (!validateLocalVoteOp(op, state, state.phase, connection.getClientId())) {
            return;
        }
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
            action: 'delete',
            phase: state.phase,
            cardId: card.id,
            column: card.column,
            text: card.text,
            authorId: card.authorId,
            rev: card.rev + 1,
            isDeleted: true
        };

        if (!validateLocalCardOp(op, state, state.phase, connection.getClientId())) {
            return;
        }
        applyCardOpAndPersist(op);
        const opId = connection.broadcast(op);
        dedup.markSeen(opId);

        // Delete all votes on this card
        for (const vote of state.votes) {
            if (vote.cardId === card.id && !vote.isDeleted) {
                const voteOp = {
                    type: 'vote',
                    cardId: vote.cardId,
                    voterId: vote.voterId,
                    rev: vote.rev + 1,
                    isDeleted: true
                };
                if (!validateLocalVoteOp(voteOp, state, state.phase, connection.getClientId())) {
                    continue;
                }
                applyVoteAndPersist(voteOp);
                const voteOpId = connection.broadcast(voteOp);
                dedup.markSeen(voteOpId);
            }
        }
    }
}

/**
 * Calculate the readiness quorum needed for a given participant count
 * @param {number} participantCount
 * @returns {number}
 */
function quorumNeeded(participantCount) {
    if (participantCount <= 2) return participantCount;
    return Math.ceil(0.6 * participantCount);
}

/**
 * Animate a number element with a tick effect when the value changes
 * @param {HTMLElement} numEl
 * @param {number} value
 */
function animateNumber(numEl, value) {
    if (numEl.textContent !== String(value)) {
        numEl.textContent = value;
        numEl.classList.remove('tick');
        void numEl.offsetWidth;
        numEl.classList.add('tick');
    }
}

/**
 * Update presence display (participant count + ready count)
 * @param {number} participantCount
 * @param {number} readyCount
 */
function updatePresence(participantCount, readyCount) {
    const el = document.getElementById('participant-count');
    const numEl = document.getElementById('participant-number');
    const readyEl = document.getElementById('ready-count');

    if (participantCount > 0) {
        animateNumber(numEl, participantCount);

        if (readyCount > 0 && currentPhase !== 'reviewing') {
            // Build ready count with animatable number span
            let readyNumEl = readyEl.querySelector('.ready-number');
            if (!readyNumEl) {
                readyEl.innerHTML = ' \u00b7 <span class="ready-number"></span> ready';
                readyNumEl = readyEl.querySelector('.ready-number');
            }
            animateNumber(readyNumEl, readyCount);
        } else {
            readyEl.innerHTML = '';
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

    // Hide presence, ready button, and quorum banner when disconnected
    if (state === 'closed') {
        updatePresence(0, 0);
        document.getElementById('ready-btn').style.display = 'none';
        document.getElementById('quorum-banner-wrapper').classList.remove('visible');
    } else if (state === 'ready' && currentPhase !== 'reviewing') {
        document.getElementById('ready-btn').style.display = '';
    }
}

/**
 * Show full-page error overlay and hide the board
 * @param {string} [code]
 * @param {string} message
 */
function showErrorOverlay(code, message) {
    const overlay = document.getElementById('error-overlay');
    const boardPage = document.getElementById('board-page');
    const messageEl = document.getElementById('error-message');

    if (!overlay || overlay.style.display !== 'none') return;

    const friendlyMessages = {
        DUPLICATE_CLIENT: 'This board is already open in another tab.',
        BOARD_FULL: 'This board is full.'
    };

    messageEl.textContent = friendlyMessages[code] || message;
    boardPage.style.display = 'none';
    document.getElementById('reconnect-btn').style.display = 'none';
    document.getElementById('connection-status').style.display = 'none';
    overlay.style.display = '';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
