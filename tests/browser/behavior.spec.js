import { expect, test } from '@playwright/test';
import {
  BOARD_ID,
  cardWithText,
  openBoard,
  seedClient,
  uniqueBoardId,
  waitForParticipants
} from './helpers.js';

test('creates and reopens a locally persisted board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Simple retrospectives for teams' }))
    .toBeVisible();

  await page.getByRole('button', { name: 'Create New Board' }).click();
  await expect(page).toHaveURL(/\/board\/[a-z]+-[a-z]+-[a-z0-9]{4}$/);
  const boardUrl = page.url();
  await expect(page.locator('#connection-status'))
    .toHaveAttribute('title', 'Connected and syncing changes');

  await page.locator('#card-input-text').fill('A persistent thought');
  await page.getByRole('button', { name: /Add to Went Well/ }).click();
  await expect(cardWithText(page, 'A persistent thought')).toBeVisible();

  await page.reload();
  await expect(cardWithText(page, 'A persistent thought')).toBeVisible();
  expect(page.url()).toBe(boardUrl);
});

test('synchronizes cards, ownership, edits, votes, and deletion', async ({ browser, isMobile }) => {
  const boardId = uniqueBoardId('sync');
  const ownerContext = await browser.newContext();
  const peerContext = await browser.newContext();
  await seedClient(ownerContext, { clientId: 'client-owner' });
  await seedClient(peerContext, { clientId: 'client-peer' });
  const owner = await ownerContext.newPage();
  const peer = await peerContext.newPage();

  try {
    await openBoard(owner, boardId);
    await openBoard(peer, boardId);
    await waitForParticipants(owner, 2);
    await waitForParticipants(peer, 2);

    await owner.locator('#card-input-text').fill('Shared success');
    await owner.locator('#card-input-text').press('ControlOrMeta+Enter');

    const ownerCard = cardWithText(owner, 'Shared success');
    const peerCard = cardWithText(peer, 'Shared success');
    await expect(ownerCard).toBeVisible();
    await expect(peerCard).toBeVisible();
    await expect(ownerCard.getByRole('button', { name: 'Edit' })).toHaveCount(1);
    await expect(peerCard.getByRole('button', { name: 'Edit' })).toHaveCount(0);

    await peerCard.getByTitle('Vote').click();
    await expect(ownerCard.locator('.card-votes')).toHaveText('1');

    if (isMobile) {
      test.info().annotations.push({
        type: 'known issue',
        description: 'Edit and delete controls currently require hover on touch-only viewports.'
      });
      return;
    }

    await ownerCard.hover();
    await ownerCard.getByRole('button', { name: 'Edit' }).click();
    await owner.locator('#card-input-text').fill('Shared success, clarified');
    await owner.getByRole('button', { name: /Save to Delta/ }).click();
    await expect(peer.locator('#delta-cards')).toContainText('Shared success, clarified');

    owner.on('dialog', dialog => dialog.accept());
    const editedCard = cardWithText(owner, 'Shared success, clarified');
    await editedCard.hover();
    await editedCard.getByRole('button', { name: 'Delete' }).click();
    await expect(cardWithText(peer, 'Shared success, clarified')).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await peerContext.close();
  }
});

test('reaches quorum, freezes review, and exports ordered markdown', async ({ browser }) => {
  const boardId = uniqueBoardId('review');
  const ownerContext = await browser.newContext();
  const peerContext = await browser.newContext();
  await seedClient(ownerContext, { clientId: 'client-owner' });
  await seedClient(peerContext, { clientId: 'client-peer' });
  const owner = await ownerContext.newPage();
  const peer = await peerContext.newPage();

  try {
    await openBoard(owner, boardId);
    await openBoard(peer, boardId);
    await waitForParticipants(owner, 2);

    await owner.locator('#card-input-text').fill('Ready to export');
    await owner.getByRole('button', { name: /Add to Went Well/ }).click();
    await expect(cardWithText(peer, 'Ready to export')).toBeVisible();
    await peer.getByTitle('Vote').click();

    await owner.getByRole('button', { name: /I'm ready/ }).click();
    await peer.getByRole('button', { name: /I'm ready/ }).click();
    await expect(owner.locator('#quorum-banner-wrapper')).toHaveClass(/visible/);

    owner.on('dialog', dialog => dialog.accept());
    await owner.getByRole('button', { name: 'Start Review' }).click();
    await expect(peer.locator('#phase-chip')).toBeVisible();
    await expect(peer.locator('.card-input')).toBeHidden();

    const downloadPromise = owner.waitForEvent('download');
    await owner.getByRole('button', { name: /Export Markdown/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${boardId}.md`);
    const markdown = await download.createReadStream();
    let content = '';
    for await (const chunk of markdown) content += chunk.toString();
    expect(content).toContain(`# ${boardId}`);
    expect(content).toContain('- Ready to export (1 vote)');
    expect(content).toContain('## Delta\n\n_No cards._');
  } finally {
    await ownerContext.close();
    await peerContext.close();
  }
});

test('rejects a duplicate browser identity with a friendly error', async ({ context }) => {
  const boardId = uniqueBoardId('duplicate');
  await seedClient(context, { clientId: 'same-client' });
  const first = await context.newPage();
  const duplicate = await context.newPage();

  await openBoard(first, boardId);
  await duplicate.goto(`/board/${boardId}`);

  await expect(duplicate.locator('#error-overlay')).toBeVisible();
  await expect(duplicate.locator('#error-message'))
    .toHaveText('This board is already open in another tab.');
});

test('reconnects and converges locally created offline work', async ({ browser }) => {
  const boardId = uniqueBoardId('reconnect');
  const ownerContext = await browser.newContext();
  const peerContext = await browser.newContext();
  await seedClient(ownerContext, { clientId: 'reconnect-owner' });
  await seedClient(peerContext, { clientId: 'reconnect-peer' });
  const owner = await ownerContext.newPage();
  const peer = await peerContext.newPage();

  try {
    await openBoard(owner, boardId);
    await openBoard(peer, boardId);
    await waitForParticipants(owner, 2);

    await owner.evaluate(() => window._connection.disconnect());
    await expect(owner.getByRole('button', { name: 'Reconnect' })).toBeVisible();

    await owner.locator('#card-input-text').fill('Created while disconnected');
    await owner.getByRole('button', { name: /Add to Went Well/ }).click();
    await expect(cardWithText(owner, 'Created while disconnected')).toBeVisible();
    await expect(cardWithText(peer, 'Created while disconnected')).toHaveCount(0);

    await owner.getByRole('button', { name: 'Reconnect' }).click();
    await expect(owner.locator('#connection-status'))
      .toHaveAttribute('title', 'Connected and syncing changes');
    await expect(cardWithText(peer, 'Created while disconnected')).toBeVisible();
  } finally {
    await ownerContext.close();
    await peerContext.close();
  }
});

test('returns the branded 404 page for an unknown route', async ({ page }) => {
  const response = await page.goto('/not-a-real-page');

  expect(response.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'We looked everywhere.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to boards' })).toHaveAttribute('href', '/');
});
