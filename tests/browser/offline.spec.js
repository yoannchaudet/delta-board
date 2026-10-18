import { expect, test } from '@playwright/test';
import { populatedBoard, seedClient } from './helpers.js';

test('loads the cached app shell while offline', async ({ browserName, context, page }) => {
  test.skip(browserName !== 'chromium', 'The authoritative PWA check runs in Chromium.');

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);

  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Simple retrospectives for teams' }))
      .toBeVisible();
    await expect(page.locator('#offline-chip')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('loads a locally persisted board while offline', async ({ browserName, context, page }) => {
  test.skip(browserName !== 'chromium', 'The authoritative PWA check runs in Chromium.');

  const boardId = `offline-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  await seedClient(context, { boardId, board: populatedBoard });
  await page.goto(`/board/${boardId}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect(page.getByText('Clear collaboration')).toBeVisible();
  await page.reload();
  await context.setOffline(true);

  try {
    await page.reload();
    await expect(page.getByText('Clear collaboration')).toBeVisible();
    await expect(page.locator('#offline-chip')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
