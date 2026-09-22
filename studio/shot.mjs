// Zero-dependency screenshot CLI for headless Chrome/Edge.
// Usage: node studio/shot.mjs <url> <out.png> [virtualTimeMs=4000] [width=430] [height=932]
// Success = exit 0 AND a non-empty output file freshly written by this run.
// stdio is ignored on purpose: captured stdio is blocked in this environment.
//
// Every installed candidate is tried in order until one produces a frame. A
// browser can exit 0 and write nothing (Edge does on this machine as of
// 2026-09), and a stale file from an earlier run must not read as success, so
// the output file is deleted before each attempt.
//
// Defaults are portrait 430x932 to match the game's phone-shaped frame.

import { spawn } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

// --- Tuning constants ---------------------------------------------------
const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Users/nesto/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const DEFAULT_VIRTUAL_TIME_MS = 4000;
const DEFAULT_WIDTH = 1066; // landscape: the game is a phone held sideways
const DEFAULT_HEIGHT = 492;
// Optional extra browser flags, space-separated, e.g. SHOT_ARGS="--use-angle=swiftshader".
const EXTRA_ARGS = (process.env.SHOT_ARGS ?? '').split(' ').filter(Boolean);
// -------------------------------------------------------------------------

function fail(message) {
  console.error(`shot.mjs: ${message}`);
  process.exit(1);
}

const [url, outPath, vtArg, wArg, hArg] = process.argv.slice(2);
if (!url || !outPath) {
  fail('usage: node studio/shot.mjs <url> <out.png> [virtualTimeMs=4000] [width=430] [height=932]');
}
const virtualTimeMs = Number.parseInt(vtArg ?? `${DEFAULT_VIRTUAL_TIME_MS}`, 10);
const width = Number.parseInt(wArg ?? `${DEFAULT_WIDTH}`, 10);
const height = Number.parseInt(hArg ?? `${DEFAULT_HEIGHT}`, 10);
if (![virtualTimeMs, width, height].every(Number.isInteger) || virtualTimeMs < 0) {
  fail('virtualTimeMs, width and height must be integers (virtualTimeMs >= 0)');
}

const candidates = [];
for (const candidate of BROWSER_CANDIDATES) {
  try {
    if ((await stat(candidate)).isFile()) candidates.push(candidate);
  } catch {
    // not present, try next candidate
  }
}
if (candidates.length === 0) {
  fail(`no browser found among: ${BROWSER_CANDIDATES.join('; ')}`);
}

await mkdir(path.dirname(outPath), { recursive: true });
// Chrome writes --screenshot only to an absolute path; a relative one lands
// nowhere and the attempt reads as an empty frame.
const outAbs = path.resolve(outPath);

const args = [
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  `--window-size=${width},${height}`,
  `--virtual-time-budget=${virtualTimeMs}`,
  ...EXTRA_ARGS,
  `--screenshot=${outAbs}`,
  url,
];

/** Run one browser attempt; true only when it freshly wrote a non-empty frame. */
async function attempt(browser) {
  await unlink(outAbs).catch(() => {}); // no stale frame survives an attempt
  const child = spawn(browser, args, { stdio: 'ignore' });
  const code = await new Promise((resolve, reject) => {
    child.on('exit', resolve);
    child.on('error', reject);
  });
  let size = 0;
  try {
    size = (await stat(outAbs)).size;
  } catch {
    // missing output reported as zero bytes
  }
  return { code, size };
}

const tried = [];
for (const browser of candidates) {
  let result;
  try {
    result = await attempt(browser);
  } catch (err) {
    result = { code: -1, size: 0, error: String(err?.message ?? err) };
  }
  tried.push({ browser, ...result });
  if (result.code === 0 && result.size > 0) {
    console.log(`shot.mjs: OK ${outPath} (${result.size} bytes) browser=${browser}`);
    process.exit(0);
  }
}

for (const t of tried) {
  console.error(
    `shot.mjs: tried ${t.browser}: exit=${t.code} bytes=${t.size}${t.error ? ` ${t.error}` : ''}`,
  );
}
console.error(
  'If the frame is black, retry the same command plus --use-angle=swiftshader, or try another browser.',
);
process.exit(1);
