/**
 * T-21 — saving, reloading and importing a game in the browser.
 */

import { expect, test } from '@playwright/test';

// Playwright gives every test a fresh browser context, so localStorage already
// starts empty. Clearing it on each navigation would also wipe the saved game
// that the reload tests exist to check.

test('a game survives a page reload', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();

  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await page.locator('[aria-label^="b7,"]').click();
  await page.locator('[aria-label^="c7,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Yellow to move');

  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();

  await expect(page.locator('#turn-indicator')).toContainText('Yellow to move');
  await expect(page.locator('.move-list .move-ply')).toHaveCount(2);
  await expect(page.locator('[aria-label^="l8,"]')).toHaveAttribute('aria-label', /Red pawn/);
  await expect(page.locator('[aria-label^="c7,"]')).toHaveAttribute('aria-label', /Blue pawn/);
});

test('the restored game is still playable', async ({ page }) => {
  await page.goto('./');
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();

  await page.locator('[aria-label^="b7,"]').click();
  await page.locator('[aria-label^="c7,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Yellow to move');
});

test('export produces JSON that can be imported back', async ({ page }) => {
  await page.goto('./');
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();

  await page.getByRole('button', { name: 'Save / load' }).click();
  const exported = await page.locator('#transfer-text').inputValue();
  expect(exported).toContain('"format": "four-player-chess"');
  expect(exported).toContain('"rulesVersion": "4pc-rules/1.0.0"');
  await page.getByRole('button', { name: 'Close' }).click();

  // Start a fresh game, then paste the saved one back in.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('button', { name: 'Start new game' }).click();
  await expect(page.locator('.move-list .move-ply')).toHaveCount(0);

  await page.getByRole('button', { name: 'Save / load' }).click();
  await page.locator('#transfer-text').fill(exported);
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.locator('.move-list .move-ply')).toHaveCount(1);
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
});

test('T-20 a malicious import is rejected with an explanation, not applied', async ({ page }) => {
  await page.goto('./');
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();

  await page.getByRole('button', { name: 'Save / load' }).click();
  await page.locator('#transfer-text').fill('{"format":"four-player-chess","formatVersion":1,"rulesVersion":"evil"}');
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'That game could not be loaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // The running game is untouched.
  await expect(page.locator('.move-list .move-ply')).toHaveCount(1);
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');
});

test('garbage text is rejected without breaking the page', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Save / load' }).click();
  await page.locator('#transfer-text').fill('<script>alert(1)</script>');
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'That game could not be loaded' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);
});

test('preferences persist across a reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Sound on' }).click();
  await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();

  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
});
