/**
 * T-23 — mobile viewport layout.
 *
 * Runs in the `mobile-chromium` project (Pixel 5, touch enabled).
 */

import { expect, test } from '@playwright/test';

// Playwright gives every test a fresh browser context, so localStorage already
// starts empty. Clearing it on each navigation would also wipe the saved game
// that the reload tests exist to check.
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('the page does not scroll horizontally', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
});

test('the board stays square and fits the viewport width', async ({ page }) => {
  const board = page.locator('.board-grid');
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;
  expect(box.width).toBeLessThanOrEqual(viewport.width);
});

test('all 160 squares render and none has zero size', async ({ page }) => {
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);
  const smallest = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('[role="gridcell"]'));
    return Math.min(...cells.map((cell) => cell.getBoundingClientRect().width));
  });
  expect(smallest).toBeGreaterThan(4);
});

test('a move can be made by tapping', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').tap();
  await expect(page.locator('.cell.target')).toHaveCount(2);
  await page.locator('[aria-label^="l8,"]').tap();
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
});

test('the controls wrap instead of overflowing', async ({ page }) => {
  const overflowing = await page.evaluate(() => {
    const controls = document.querySelector('.controls');
    if (!controls) return -1;
    return controls.scrollWidth - controls.clientWidth;
  });
  expect(overflowing).toBeLessThanOrEqual(1);
});

test('the side panel stacks below the board', async ({ page }) => {
  const boardBox = await page.locator('.board-region').boundingBox();
  const panelBox = await page.locator('.side-panel').boundingBox();
  expect(boardBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  if (!boardBox || !panelBox) return;
  expect(panelBox.y).toBeGreaterThanOrEqual(boardBox.y + boardBox.height - 2);
});

test('dialogs fit inside the viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Save / load' }).tap();
  const dialog = page.locator('dialog.transfer-dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.width).toBeLessThanOrEqual(viewport.width);
});
