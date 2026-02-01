// Main Application Entry Point

import { initLandingPage } from './landing.js';
import { createConnection } from './connection.js';

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

    const connection = createConnection(boardId, {
        onStateChange: (state) => {
            updateConnectionStatus(statusEl, state);
        },

        onParticipantsUpdate: (participantCount, readyCount) => {
            console.log(`Participants: ${participantCount}, Ready: ${readyCount}`);
            // TODO: Update UI with participant/ready counts
        },

        onMessage: (message) => {
            console.log('Received:', message);
            // TODO: Handle cardOp, vote, syncState, phaseChanged
        },

        onAck: (opId) => {
            console.log('Ack:', opId);
            // TODO: Handle operation acknowledgment
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
