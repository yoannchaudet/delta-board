import { expect, test } from '@playwright/test';
import {
  openBoard,
  populatedBoard,
  seedClient,
  waitForParticipants
} from './helpers.js';

test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium/Linux owns visual baselines.');
  test.skip(process.platform !== 'linux', 'Visual comparisons run only in the Linux authority.');
});

for (const theme of ['light', 'dark']) {
  test(`landing page visual baseline (${theme})`, async ({ context, page }) => {
    await seedClient(context, { theme });
    await page.goto('/');

    await expect(page).toHaveScreenshot(`landing-${theme}.png`, {
      animations: 'disabled',
      fullPage: true
    });
  });

  test(`empty board visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-empty-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: { version: 1, phase: 'forming', cards: [], votes: [] },
      boardId,
      clientId: `visual-empty-${theme}-${testInfo.project.name}`,
      theme
    });
    await openBoard(page, boardId);

    await expect(page).toHaveScreenshot(`board-empty-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
      mask: [page.locator('#participant-count'), page.locator('.app-version')]
    });
  });

  test(`populated board visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-forming-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: populatedBoard,
      boardId,
      clientId: `visual-forming-${theme}-${testInfo.project.name}`,
      theme
    });
    await openBoard(page, boardId);

    await expect(page).toHaveScreenshot(`board-populated-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
      mask: [page.locator('#participant-count'), page.locator('.app-version')]
    });
  });

  test(`editing visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-editing-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: populatedBoard,
      boardId,
      clientId: 'client-owner',
      theme
    });
    await openBoard(page, boardId);
    await page.locator('.card').filter({ hasText: 'Clear collaboration' })
      .getByRole('button', { name: 'Edit' })
      .evaluate(button => button.click());
    await expect(page.locator('#edit-overlay')).toHaveClass(/active/);

    await expect(page).toHaveScreenshot(`board-editing-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
      mask: [page.locator('#participant-count'), page.locator('.app-version')]
    });
  });

  test(`quorum visual baseline (${theme})`, async ({ browser, context, page }, testInfo) => {
    const boardId = `visual-quorum-${theme}-${testInfo.project.name}`;
    const peerContext = await browser.newContext();
    await seedClient(context, {
      board: populatedBoard,
      boardId,
      clientId: `visual-owner-${theme}-${testInfo.project.name}`,
      theme
    });
    await seedClient(peerContext, {
      boardId,
      clientId: `visual-peer-${theme}-${testInfo.project.name}`,
      theme
    });
    const peer = await peerContext.newPage();

    try {
      await openBoard(page, boardId);
      await openBoard(peer, boardId);
      await waitForParticipants(page, 2);
      await page.getByRole('button', { name: /I'm ready/ }).click();
      await peer.getByRole('button', { name: /I'm ready/ }).click();
      await expect(page.locator('#quorum-banner-wrapper')).toHaveClass(/visible/);

      await expect(page).toHaveScreenshot(`board-quorum-${theme}.png`, {
        animations: 'disabled',
        fullPage: true,
        mask: [page.locator('#participant-count'), page.locator('.app-version')]
      });
    } finally {
      await peerContext.close();
    }
  });

  test(`review board visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-review-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: { ...populatedBoard, phase: 'reviewing' },
      boardId,
      clientId: `visual-review-${theme}-${testInfo.project.name}`,
      theme
    });
    await openBoard(page, boardId);
    await expect(page.locator('#phase-chip')).toBeVisible();

    await expect(page).toHaveScreenshot(`board-review-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
      mask: [page.locator('#participant-count'), page.locator('.app-version')]
    });
  });

  test(`disconnected visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-disconnected-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      board: populatedBoard,
      boardId,
      clientId: `visual-disconnected-${theme}-${testInfo.project.name}`,
      theme
    });
    await openBoard(page, boardId);
    await page.evaluate(() => window._connection.disconnect());
    await expect(page.getByRole('button', { name: 'Reconnect' })).toBeVisible();

    await expect(page).toHaveScreenshot(`board-disconnected-${theme}.png`, {
      animations: 'disabled',
      fullPage: true,
      mask: [page.locator('.app-version')]
    });
  });

  test(`connection error visual baseline (${theme})`, async ({ context, page }, testInfo) => {
    const boardId = `visual-error-${theme}-${testInfo.project.name}`;
    await seedClient(context, {
      boardId,
      clientId: `visual-error-${theme}-${testInfo.project.name}`,
      theme
    });
    const duplicate = await context.newPage();

    try {
      await openBoard(page, boardId);
      await duplicate.goto(`/board/${boardId}`);
      await expect(duplicate.locator('#error-overlay')).toBeVisible();

      await expect(duplicate).toHaveScreenshot(`connection-error-${theme}.png`, {
        animations: 'disabled',
        fullPage: true,
        mask: [duplicate.locator('.app-version')]
      });
    } finally {
      await duplicate.close();
    }
  });

  test(`404 visual baseline (${theme})`, async ({ context, page }) => {
    await seedClient(context, { theme });
    await page.goto('/missing-page');

    await expect(page).toHaveScreenshot(`404-${theme}.png`, {
      animations: 'disabled',
      fullPage: true
    });
  });
}
