// Zero-dependency static file server for Repite y Tranca.
// Serves the project root on port 4174; CLI override: --port <n>.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Tuning constants ---------------------------------------------------
const DEFAULT_PORT = 4174;
const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};
// The canary lives in studio/ but is verified and screenshotted at /canary.html.
const ALIASES = {
  '/canary.html': 'studio/canary.html',
};
// -------------------------------------------------------------------------

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parsePortArg(argv) {
  const i = argv.indexOf('--port');
  if (i === -1) return DEFAULT_PORT;
  const raw = argv[i + 1];
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port expects an integer 1-65535, got: ${raw}`);
  }
  return port;
}

// Map a URL path to a file path inside root; null when it escapes root.
function resolveSafe(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return null;
  }
  const alias = ALIASES[pathname];
  if (alias) return path.resolve(root, alias);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const resolved = path.resolve(root, '.' + pathname);
  return resolved.startsWith(root + path.sep) || resolved === path.join(root, 'index.html')
    ? resolved
    : null;
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const filePath = resolveSafe(req.url ?? '/');
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }
  const target = (await isFile(filePath)) ? filePath : path.join(root, 'index.html');
  if (!(await isFile(target))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 Internal Server Error: ${err?.message ?? err}`);
  }
});

server.listen(parsePortArg(process.argv), HOST, () => {
  console.log(`Serving ${root}`);
  console.log(`Listening on http://localhost:${server.address().port}`);
});
