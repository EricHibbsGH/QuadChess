/**
 * T-22 — keyboard-only interaction.
 *
 * Not one mouse event is used in this file: every action goes through Tab,
 * arrows, Enter and Escape.
 */

import { expect, test } from '@playwright/test';

// Playwright gives every test a fresh browser context, so localStorage already
// starts empty. Clearing it on each navigation would also wipe the saved game
// that the reload tests exist to check.
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

/** Tabs forward until focus lands inside the board grid. */
async function focusBoard(page: import('@playwright/test').Page) {
  for (let i = 0; i < 40; i += 1) {
    const inBoard = await page.evaluate(
      () => document.activeElement?.closest('.board-grid') !== null && document.activeElement?.getAttribute('role') === 'gridcell',
    );
    if (inBoard) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('the board never received keyboard focus');
}

test('the board is reachable with Tab and starts with one focusable square', async ({ page }) => {
  await expect(page.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await focusBoard(page);
  const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(label).toMatch(/^h1,/);
});

test('arrow keys move between squares and skip the missing corners', async ({ page }) => {
  await focusBoard(page);

  // h1 -> up three -> h4
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^h4,/);

  // Walk left along rank 4 to the very edge: a4 exists, and pressing left again stays put.
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^a4,/);
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^a4,/);

  // Down from a4 would enter the bottom-left corner block, so focus does not move.
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^a4,/);
});

test('a full move can be made with the keyboard alone', async ({ page }) => {
  await focusBoard(page);

  // h1 -> m4 (up 3, right 5)
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^m4, Red pawn/);

  await page.keyboard.press('Enter');
  await expect(page.locator('.cell.selected')).toHaveCount(1);
  await expect(page.locator('.cell.target')).toHaveCount(2);

  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^l4,/);
  await page.keyboard.press('Enter');

  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
  await expect(page.locator('[aria-label^="l4,"]')).toHaveAttribute('aria-label', /Red pawn/);
});

test('Escape cancels a selection', async ({ page }) => {
  await focusBoard(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cell.selected')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.cell.selected')).toHaveCount(0);
  await expect(page.locator('.cell.target')).toHaveCount(0);
});

test('Home and End jump along the current row', async ({ page }) => {
  await focusBoard(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp'); // rank 4, a full-width row
  await page.keyboard.press('Home');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^a4,/);
  await page.keyboard.press('End');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toMatch(/^n4,/);
});

test('every square exposes square, piece, colour and legal-move status', async ({ page }) => {
  await expect(page.locator('[aria-label^="n8,"]')).toHaveAttribute('aria-label', 'n8, Red king');
  await expect(page.locator('[aria-label^="h7,"]')).toHaveAttribute('aria-label', 'h7, empty');

  await focusBoard(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');

  await expect(page.locator('[aria-label^="m4,"]')).toHaveAttribute('aria-label', /selected/);
  await expect(page.locator('[aria-label^="l4,"]')).toHaveAttribute('aria-label', /legal move/);
});

test('a move is announced in a live region', async ({ page }) => {
  await focusBoard(page);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');

  await expect(page.locator('#live-polite')).toContainText('Red pawn m4 to l4');
  await expect(page.locator('#live-polite')).toContainText('Blue to move');
});

test('the skip link is the first focusable element', async ({ page }) => {
  await page.keyboard.press('Tab');
  const text = await page.evaluate(() => document.activeElement?.textContent);
  expect(text).toBe('Skip to the board');
});

test('absent corner cells are not focusable and not exposed as cells', async ({ page }) => {
  await expect(page.locator('.cell.absent[tabindex]')).toHaveCount(0);
  await expect(page.locator('.cell.absent[role="gridcell"]')).toHaveCount(0);
});
