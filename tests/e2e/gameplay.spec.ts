/**
 * Board rendering and mouse gameplay against the production build.
 */

import { expect, test } from '@playwright/test';

// Playwright gives every test a fresh browser context, so localStorage already
// starts empty. Clearing it on each navigation would also wipe the saved game
// that the reload tests exist to check.
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
});

test('T-01 renders exactly 160 playable squares and 36 absent cells', async ({ page }) => {
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);
  await expect(page.locator('.cell.absent')).toHaveCount(36);
});

test('T-03 renders all 64 pieces at the start', async ({ page }) => {
  await expect(page.locator('.cell .piece-svg')).toHaveCount(64);
  await expect(page.locator('[aria-label^="n8,"]')).toHaveAttribute('aria-label', /Red king/);
  await expect(page.locator('[aria-label^="a7,"]')).toHaveAttribute('aria-label', /Blue king/);
  await expect(page.locator('[aria-label^="h1,"]')).toHaveAttribute('aria-label', /Yellow king/);
  await expect(page.locator('[aria-label^="g14,"]')).toHaveAttribute('aria-label', /Green king/);
});

test('T-04 Red moves first and the turn advances to Blue', async ({ page }) => {
  await expect(page.locator('#turn-indicator')).toContainText('Red to move');

  await page.locator('[aria-label^="m8,"]').click();
  // Legal destinations are highlighted before the move is made.
  await expect(page.locator('.cell.target')).toHaveCount(2);
  await expect(page.locator('[aria-label^="l8,"]')).toHaveAttribute('aria-label', /legal move/);

  await page.locator('[aria-label^="l8,"]').click();

  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
  await expect(page.locator('[aria-label^="l8,"]')).toHaveAttribute('aria-label', /Red pawn/);
  await expect(page.locator('[aria-label^="m8,"]')).toHaveAttribute('aria-label', /empty/);
});

test('the move is recorded in the move history', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await expect(page.locator('.move-list .move-ply')).toHaveCount(1);
  await expect(page.locator('.move-list .move-ply').first()).toHaveText('R:m8-l8');
});

test('illegal destinations cannot be played through the UI', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').click();
  // h8 is far away and not a legal pawn move.
  await page.locator('[aria-label^="h8,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Red to move');
  await expect(page.locator('.move-list .move-ply')).toHaveCount(0);
});

test('a player cannot move another player pieces', async ({ page }) => {
  // It is Red's turn; clicking a Blue pawn must not select it.
  await page.locator('[aria-label^="b7,"]').click();
  await expect(page.locator('.cell.target')).toHaveCount(0);
  await expect(page.locator('.cell.selected')).toHaveCount(0);
});

test('T-18 undo and redo work from the toolbar', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#turn-indicator')).toContainText('Red to move');
  await expect(page.locator('[aria-label^="m8,"]')).toHaveAttribute('aria-label', /Red pawn/);
  await expect(page.locator('.move-list .move-ply')).toHaveCount(0);

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
  await expect(page.locator('.move-list .move-ply')).toHaveCount(1);
});

test('the board can be rotated without changing the game', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();

  await page.getByRole('button', { name: /Rotate board/ }).click();

  // Same position, same turn, still 160 squares.
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);
  await expect(page.locator('[aria-label^="l8,"]')).toHaveAttribute('aria-label', /Red pawn/);
});

test('a destructive action asks for confirmation first', async ({ page }) => {
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();

  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByRole('heading', { name: 'Start a new game?' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  // Cancelling leaves the game alone.
  await expect(page.locator('.move-list .move-ply')).toHaveCount(1);

  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start new game' }).click();
  await expect(page.locator('.move-list .move-ply')).toHaveCount(0);
  await expect(page.locator('#turn-indicator')).toContainText('Red to move');
});

test('no browser alert, confirm or prompt is used during normal play', async ({ page }) => {
  let dialogSeen = false;
  page.on('dialog', (dialog) => {
    dialogSeen = true;
    void dialog.dismiss();
  });

  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: /Rotate board/ }).click();
  await page.getByRole('button', { name: 'New game' }).click();

  expect(dialogSeen).toBe(false);
});

test('switching the rules profile restarts under the new rules', async ({ page }) => {
  await page.getByLabel('Rules').selectOption('standard-ffa');
  await expect(page.locator('.team-totals')).toBeHidden();
  await expect(page.locator('.player-score').first()).toBeVisible();
  await expect(page.locator('#turn-indicator')).toContainText('Red to move');
});

test('resigning ends the game and shows the result', async ({ page }) => {
  await page.getByRole('button', { name: 'Resign' }).click();
  await expect(page.getByRole('heading', { name: 'Red, resign?' })).toBeVisible();
  await page.getByRole('button', { name: 'Resign', exact: true }).nth(1).click();

  // Teams profile: resigning loses the game for Red and Yellow.
  await expect(page.locator('.result-banner')).toBeVisible();
  await expect(page.locator('.result-banner')).toContainText('blue and green');
  await expect(page.locator('#turn-indicator')).toContainText('Game over');

  // The board is no longer interactive: every square reports aria-disabled, and
  // forcing a click through anyway still selects nothing.
  await expect(page.locator('body[data-finished="true"]')).toBeAttached();
  await expect(page.locator('[role="gridcell"][aria-disabled="true"]')).toHaveCount(160);
  await page.locator('[aria-label^="m8,"]').click({ force: true });
  await expect(page.locator('.cell.selected')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resign' })).toBeDisabled();
});

test('an eliminated player is struck through in the status panel', async ({ page }) => {
  await page.getByLabel('Rules').selectOption('standard-ffa');
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Resign', exact: true }).nth(1).click();

  const redRow = page.locator('.player-row[data-owner="red"]');
  await expect(redRow).toHaveClass(/is-eliminated/);
  await expect(redRow.locator('.player-status')).toContainText('out (resign)');
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
});
