import { expect } from '@playwright/test';

export const BOARD_ID = 'steady-otter-a11y';

export function uniqueBoardId(prefix) {
  return `${prefix}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

export const populatedBoard = {
  version: 1,
  phase: 'forming',
  cards: [
    {
      id: 'card-well',
      column: 'well',
      text: 'Clear collaboration',
      authorId: 'client-owner',
      rev: 1,
      isDeleted: false,
      createdAt: 1
    },
    {
      id: 'card-delta',
      column: 'delta',
      text: 'Shorten the feedback loop',
      authorId: 'client-peer',
      rev: 1,
      isDeleted: false,
      createdAt: 2
    }
  ],
  votes: [
    {
      id: 'card-well:client-peer',
      cardId: 'card-well',
      voterId: 'client-peer',
      rev: 1,
      isDeleted: false
    }
  ]
};

export async function seedClient(context, {
  clientId = 'client-owner',
  boardId = BOARD_ID,
  board = null,
  theme = 'light'
} = {}) {
  await context.addInitScript(({ id, key, state, preference }) => {
    localStorage.setItem('deltaboard-client-id', id);
    localStorage.setItem('theme-preference', preference);
    if (state) {
      localStorage.setItem(`deltaboard-${key}`, JSON.stringify(state));
    }
  }, { id: clientId, key: boardId, state: board, preference: theme });
}

export async function openBoard(page, boardId = BOARD_ID) {
  await page.goto(`/board/${boardId}`);
  await expect(page.locator('#connection-status'))
    .toHaveAttribute('title', 'Connected and syncing changes');
}

export async function waitForParticipants(page, count) {
  await expect(page.locator('#participant-number')).toHaveText(String(count));
}

export function cardWithText(page, text) {
  return page.locator('.card').filter({ hasText: text });
}
