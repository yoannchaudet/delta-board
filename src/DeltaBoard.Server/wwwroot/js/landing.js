// Landing Page Module

import { getAllBoards, deleteBoard, hasBoards } from './storage.js';
import { generateBoardId } from './board.js';

/**
 * Initialize the landing page
 */
export function initLandingPage() {
    setupCreateButton();
    renderBoardsList();
}

/**
 * Set up the create new board button
 */
function setupCreateButton() {
    const createBtn = document.getElementById('create-board-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const newBoardId = generateBoardId();
            window.location.href = `/board/${newBoardId}`;
        });
    }
}

/**
 * Render the list of boards
 */
function renderBoardsList() {
    const boardsSection = document.getElementById('boards-section');
    const boardsList = document.getElementById('boards-list');

    if (!boardsSection || !boardsList) return;

    const boards = getAllBoards();

    if (boards.length === 0) {
        boardsSection.style.display = 'none';
        return;
    }

    boardsSection.style.display = 'block';
    boardsList.innerHTML = '';

    boards.forEach(board => {
        const card = createBoardCard(board);
        boardsList.appendChild(card);
    });
}

/**
 * Create a board card element
 * @param {{id: string, cardCount: number, voteCount: number, phase: string, lastModified: number|null}} board
 * @returns {HTMLElement}
 */
function createBoardCard(board) {
    const card = document.createElement('a');
    card.className = 'board-card';
    card.href = `/board/${board.id}`;

    const cardCountText = board.cardCount === 1 ? '1 card' : `${board.cardCount} cards`;
    const voteCountText = board.voteCount === 1 ? '1 vote' : `${board.voteCount} votes`;
    const reviewingChip = board.phase === 'reviewing'
        ? '<span class="phase-chip">Reviewing</span>'
        : '';

    card.innerHTML = `
        <div class="board-card-content">
            <h3 class="board-card-title">${escapeHtml(board.id)}${reviewingChip}</h3>
            <div class="board-card-meta">
                <span>${cardCountText}</span>
                <span>·</span>
                <span>${voteCountText}</span>
            </div>
        </div>
        <button class="btn-card-action btn-delete board-card-delete" title="Delete board">Delete</button>
    `;

    // Prevent navigation when clicking delete button
    const deleteBtn = card.querySelector('.board-card-delete');
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (confirm(`Delete board "${board.id}"? This cannot be undone.`)) {
            deleteBoard(board.id);
            renderBoardsList();
        }
    });

    return card;
}

/**
 * Format a timestamp as a readable date
 * @param {number} timestamp
 * @returns {string}
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
