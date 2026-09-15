import { defineConfig, type Plugin } from 'vite';

/**
 * A strict Content-Security-Policy is injected into the BUILT page only: the dev
 * server needs a websocket for hot reload, and shipping a policy that only holds
 * in development would be worse than useless.
 *
 * `connect-src 'none'` is the important line — it makes "no third-party network
 * requests" a property the browser enforces, not just something we tested for.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'four-player-chess-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

/**
 * `base: './'` emits relative asset URLs, so one `dist/` works unchanged at:
 *   - a user site      https://user.github.io/
 *   - a project site   https://user.github.io/repository-name/
 *   - any static server rooted at an arbitrary sub-directory
 *
 * Override with VITE_BASE if an absolute base is ever required.
 */
export default defineConfig({
  base: process.env['VITE_BASE'] ?? './',
  plugins: [cspPlugin()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // The polyfill would be emitted as an inline <script>, which the CSP above
    // forbids. Every browser that supports ES modules supports modulepreload.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
});
