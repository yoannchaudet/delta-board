import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openBoard, populatedBoard, seedClient } from './helpers.js';

async function violationIds(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(violation => ({
    id: violation.id,
    nodes: violation.nodes.map(node => ({
      target: node.target,
      failureSummary: node.failureSummary
    }))
  })).sort((left, right) => left.id.localeCompare(right.id));
}

test('tracks the landing-page accessibility baseline in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate(preference => {
      localStorage.setItem('theme-preference', preference);
    }, theme);
    await page.reload();

    expect(await violationIds(page)).toEqual([]);
  }
});

test('tracks the populated-board accessibility baseline in both themes', async ({ browser }, testInfo) => {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const boardId = `a11y-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: populatedBoard,
      boardId,
      clientId: `client-${theme}-${testInfo.project.name}`,
      theme
    });

    try {
      await openBoard(page, boardId);
      await expect(page.locator('#board-title')).toHaveText(boardId);
      expect(await violationIds(page)).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test('tracks review and 404 accessibility baselines', async ({ browser }, testInfo) => {
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const boardId = `a11y-review-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: { ...populatedBoard, phase: 'reviewing' },
      boardId,
      clientId: `review-${theme}-${testInfo.project.name}`,
      theme
    });

    try {
      await openBoard(page, boardId);
      await expect(page.locator('#phase-chip')).toBeVisible();
      expect(await violationIds(page)).toEqual([]);

      await page.goto('/not-found-for-accessibility');
      expect(await violationIds(page)).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test('supports critical keyboard actions, visible focus, and persisted theme changes', async ({ page }) => {
  const boardId = `keyboard-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await openBoard(page, boardId);

  await page.locator('#card-input-text').focus();
  await page.keyboard.type('Keyboard-created card');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByText('Keyboard-created card')).toBeVisible();

  await page.locator('#theme-toggle').focus();
  const focusIndicator = await page.locator('#theme-toggle').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow
    };
  });
  expect(
    focusIndicator.outlineStyle !== 'none' && focusIndicator.outlineWidth !== '0px'
      || focusIndicator.boxShadow !== 'none'
  ).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('does not overflow the viewport', async ({ page }) => {
  const boardId = `overflow-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await openBoard(page, boardId);
  await page.locator('#card-input-text').fill('A'.repeat(300));
  await page.locator('#card-input-text').press('ControlOrMeta+Enter');

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('reduces application animation when the OS requests reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const motionDurations = await page.locator('body *').evaluateAll(elements =>
    elements.flatMap(element => {
      const style = getComputedStyle(element);
      return [style.animationDuration, style.transitionDuration];
    }).filter(duration => duration !== '0s')
  );

  expect(motionDurations).toEqual([]);
});

test('keeps board navigation separate from board actions', async ({ context, page }) => {
  await seedClient(context, {
    boardId: 'semantic-board',
    board: { ...populatedBoard, phase: 'reviewing' }
  });
  await page.goto('/');

  const boardCard = page.locator('.board-card');
  await expect(boardCard.getByRole('link', { name: /semantic-board/ })).toHaveCount(1);
  await expect(boardCard.getByRole('button', { name: /Clone board semantic-board/ }))
    .toHaveCount(1);
  await expect(boardCard.getByRole('button', { name: /Delete board semantic-board/ }))
    .toHaveCount(1);
  await expect(boardCard.getByRole('link').getByRole('button')).toHaveCount(0);
});

test('exposes connection, readiness, and vote state', async ({ browser }) => {
  const boardId = `states-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerContext = await browser.newContext();
  const peerContext = await browser.newContext();
  await seedClient(ownerContext, { clientId: 'states-owner' });
  await seedClient(peerContext, { clientId: 'states-peer' });
  const owner = await ownerContext.newPage();
  const peer = await peerContext.newPage();

  try {
    await openBoard(owner, boardId);
    await openBoard(peer, boardId);
    await expect(owner.locator('#connection-status'))
      .toContainText('Connection status: Connected and syncing changes');

    const ready = owner.getByRole('button', { name: /I'm ready/ });
    await expect(ready).toHaveAttribute('aria-pressed', 'false');
    await ready.click();
    await expect(ready).toHaveAttribute('aria-pressed', 'true');

    await peer.locator('#card-input-text').fill('Accessible vote state');
    await peer.getByRole('button', { name: /Add to Went Well/ }).click();
    const vote = owner.getByRole('button', {
      name: '0 votes. Vote for: Accessible vote state'
    });
    await expect(vote).toHaveAttribute('aria-pressed', 'false');
    await vote.focus();
    await owner.keyboard.press('Enter');
    const removeVote = owner.getByRole('button', {
      name: '1 vote. Remove vote from: Accessible vote state'
    });
    await expect(removeVote).toHaveAttribute('aria-pressed', 'true');
    await expect(removeVote).toBeFocused();
  } finally {
    await ownerContext.close();
    await peerContext.close();
  }
});

test('restores focus after editing and deletion', async ({ context, page }) => {
  const boardId = `focus-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await seedClient(context, {
    boardId,
    clientId: 'client-owner',
    board: populatedBoard
  });
  await openBoard(page, boardId);

  const edit = page.getByRole('button', { name: 'Edit card: Clear collaboration' });
  await edit.focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await cancel.focus();
  await page.keyboard.press('Enter');
  await expect(edit).toBeFocused();

  page.on('dialog', dialog => dialog.accept());
  const card = page.locator('.card').filter({ hasText: 'Clear collaboration' });
  const deleteButton = card.getByRole('button', {
    name: 'Delete card: Clear collaboration'
  });
  await deleteButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'What Went Well' })).toBeFocused();
});

test('restores focus when review removes the active card controls', async ({ browser }) => {
  const boardId = `review-focus-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerContext = await browser.newContext();
  const peerContext = await browser.newContext();
  await seedClient(ownerContext, {
    boardId,
    clientId: 'client-owner',
    board: populatedBoard
  });
  await seedClient(peerContext, {
    boardId,
    clientId: 'client-peer',
    board: populatedBoard
  });
  const owner = await ownerContext.newPage();
  const peer = await peerContext.newPage();

  try {
    await openBoard(owner, boardId);
    await openBoard(peer, boardId);
    await owner.getByRole('button', { name: /I'm ready/ }).click();

    const edit = owner.getByRole('button', { name: 'Edit card: Clear collaboration' });
    await edit.focus();
    await peer.getByRole('button', { name: /I'm ready/ }).click();
    const startReview = peer.getByRole('button', { name: 'Start Review' });
    await expect(startReview).toBeVisible();
    peer.once('dialog', dialog => dialog.accept());
    await startReview.click();

    await expect(owner.locator('#phase-chip')).toBeFocused();
  } finally {
    await ownerContext.close();
    await peerContext.close();
  }
});

test('shows owned-card actions on touch viewports', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch visibility is covered by the mobile project.');
  await openBoard(page, `touch-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  await page.locator('#card-input-text').fill('Touch actions');
  await page.getByRole('button', { name: /Add to Went Well/ }).click();

  const card = page.locator('.card').filter({ hasText: 'Touch actions' });
  await expect(card.getByRole('button', { name: 'Edit card: Touch actions' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Delete card: Touch actions' })).toBeVisible();
});
