/**
 * Static file server for the browser tests.
 *
 * It serves `dist/` under a repository-style sub-path so the tests exercise the
 * exact production bundle in the exact shape GitHub Pages serves it:
 *
 *   http://127.0.0.1:4173/QuadChess/
 *
 * That is what makes T-24 a real test rather than an assumption. It also
 * deliberately serves nothing else, so any third-party request a test observes
 * is genuinely a third-party request.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../dist', import.meta.url)));
const PREFIX = '/QuadChess/';
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.wav', 'audio/wav'],
  ['.svg', 'image/svg+xml'],
  ['.map', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
]);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);

  if (url.pathname === '/') {
    res.writeHead(302, { Location: PREFIX });
    res.end();
    return;
  }

  if (!url.pathname.startsWith(PREFIX)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }

  let relative = url.pathname.slice(PREFIX.length);
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';

  // Reject traversal before touching the filesystem.
  const target = resolve(join(ROOT, normalize(relative)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('forbidden');
    return;
  }

  readFile(target)
    .then((body) => {
      res.writeHead(200, {
        'Content-Type': TYPES.get(extname(target)) ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`serving dist at http://127.0.0.1:${PORT}${PREFIX}\n`);
});
