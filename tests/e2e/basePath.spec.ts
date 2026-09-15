/**
 * T-24 — GitHub Pages base-path deployment.
 *
 * The whole suite runs against the production build served from
 * /QuadChess/, so this file asserts the specifics: nothing 404s, no
 * asset URL is rooted at "/", and the app boots.
 */

import { expect, test } from '@playwright/test';

test('the app boots from a repository sub-path with no failed requests', async ({ page }) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    failures.push(`failed ${request.url()}`);
  });

  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);

  expect(failures, `requests that did not succeed: ${failures.join(', ')}`).toEqual([]);
});

test('every asset URL is relative, never rooted at the domain', async ({ page }) => {
  await page.goto('./');

  const scriptSources = await page.evaluate(() =>
    Array.from(document.querySelectorAll('script[src]')).map((el) => el.getAttribute('src') ?? ''),
  );
  const styleHrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => el.getAttribute('href') ?? ''),
  );

  expect(scriptSources.length).toBeGreaterThan(0);
  expect(styleHrefs.length).toBeGreaterThan(0);

  for (const url of [...scriptSources, ...styleHrefs]) {
    expect(url, `${url} must not be an absolute path`).not.toMatch(/^\//);
    expect(url, `${url} must not be an absolute URL`).not.toMatch(/^https?:/);
  }
});

test('resolved asset URLs all sit under the sub-path', async ({ page }) => {
  await page.goto('./');
  const resolved = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map((el) => (el as HTMLScriptElement).src);
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      (el) => (el as HTMLLinkElement).href,
    );
    return [...scripts, ...styles];
  });

  for (const url of resolved) {
    expect(new URL(url).pathname, `${url} should live under /QuadChess/`).toMatch(
      /^\/QuadChess\//,
    );
  }
});

test('a deep reload of the same sub-path still works', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await page.reload();
  await expect(page.locator('body[data-ready="true"]')).toBeAttached();
  await expect(page.locator('[role="gridcell"]')).toHaveCount(160);
});
