import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openBoard, populatedBoard, seedClient } from './helpers.js';

async function violationIds(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.map(violation => violation.id).sort();
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
      expect(await violationIds(page)).toEqual(['color-contrast']);

      await page.goto('/not-found-for-accessibility');
      expect(await violationIds(page)).toEqual(['landmark-one-main', 'region']);
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

test.fail('reduces application animation when the OS requests reduced motion', async ({ page }) => {
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
