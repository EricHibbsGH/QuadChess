/**
 * T-25 — the browser makes no third-party network requests.
 *
 * Also checks the app keeps working with the network cut off after load, which
 * is the offline guarantee the README makes.
 */

import { expect, test } from '@playwright/test';

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);

test('no request leaves the origin during load and play', async ({ page }) => {
  const foreign: string[] = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (!ALLOWED_HOSTS.has(url.hostname)) foreign.push(request.url());
  });

  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();

  // Play a few moves and open the dialogs, exercising the sound and save paths.
  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await page.locator('[aria-label^="b7,"]').click();
  await page.locator('[aria-label^="c7,"]').click();
  await page.getByRole('button', { name: 'Save / load' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: /Rotate board/ }).click();

  expect(foreign, `unexpected third-party requests: ${foreign.join(', ')}`).toEqual([]);
});

test('the built page declares a content security policy that forbids outbound connections', async ({ page }) => {
  await page.goto('./');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toBeTruthy();
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
});

test('the game keeps working with the network disabled after loading', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();

  await context.setOffline(true);

  await page.locator('[aria-label^="m8,"]').click();
  await page.locator('[aria-label^="l8,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Blue to move');

  await page.locator('[aria-label^="b7,"]').click();
  await page.locator('[aria-label^="c7,"]').click();
  await expect(page.locator('#turn-indicator')).toContainText('Yellow to move');
  await expect(page.locator('.move-list .move-ply')).toHaveCount(2);

  await context.setOffline(false);
});

test('no inline script is used, so the strict CSP holds', async ({ page }) => {
  await page.goto('./');
  const inline = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script')).filter((s) => !s.src && s.textContent?.trim()).length,
  );
  expect(inline).toBe(0);
});
