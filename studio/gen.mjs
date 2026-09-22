// Generate an image through OpenRouter's Unified Image API.
//
//   node studio/gen.mjs --prompt "..." --out docs/art/name.png [options]
//
// Options
//   --prompt <text>      required (or --prompt-file <path>)
//   --out <path>         required; directory is created
//   --model <id>         default google/gemini-3.1-flash-lite-image
//   --ar <ratio>         e.g. 16:9, 1:1, 9:16
//   --resolution <r>     e.g. 1K, 2K
//   --ref <a.png,b.png>  input reference images, comma separated
//   --n <count>          images to request, default 1
//   --seed <int>
//
// The API key is read from the harness .env by default; override with
// OPENROUTER_API_KEY in the environment or --env <path>.
//
// Every run writes a .json sidecar next to the image recording the prompt, the
// model, and the exact cost the API reported, so generated art can be traced and
// regenerated rather than being an unexplained binary.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// --- Tuning constants ---------------------------------------------------
const API = 'https://openrouter.ai/api/v1/images';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image';
const DEFAULT_ENV = 'C:/Users/nesto/deepseek-harness/.env';
const TIMEOUT_MS = 180000;
// -------------------------------------------------------------------------

function fail(message) {
  console.error(`gen.mjs: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { n: 1 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`${key} needs a value`);
    out[name] = value;
    i += 1;
  }
  return out;
}

async function readKey(envPath) {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  let text;
  try {
    text = await readFile(envPath, 'utf8');
  } catch {
    fail(`no OPENROUTER_API_KEY and cannot read ${envPath}`);
  }
  const line = text.split(/\r?\n/).find((l) => l.startsWith('OPENROUTER_API_KEY='));
  if (!line) fail(`OPENROUTER_API_KEY not found in ${envPath}`);
  return line.slice('OPENROUTER_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

/** Identify an image from its magic bytes; the API does not always honour the
 *  format implied by its own defaults, and reference files vary. */
function sniff(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: 'jpg', mime: 'image/jpeg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { ext: 'png', mime: 'image/png' };
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return { ext: 'webp', mime: 'image/webp' };
  return { ext: 'bin', mime: 'application/octet-stream' };
}

/** Read reference images into the shape the API expects. */
async function readRefs(spec) {
  if (!spec) return null;
  const files = spec.split(',').map((s) => s.trim()).filter(Boolean);
  const refs = [];
  for (const file of files) {
    const bytes = await readFile(file);
    const { mime } = sniff(bytes);
    refs.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` },
    });
  }
  return refs;
}

const args = parseArgs(process.argv.slice(2));
if (!args.out) fail('--out is required');
const prompt = args.prompt ?? (args['prompt-file'] ? await readFile(args['prompt-file'], 'utf8') : null);
if (!prompt) fail('--prompt or --prompt-file is required');

const key = await readKey(args.env ?? DEFAULT_ENV);
const model = args.model ?? DEFAULT_MODEL;

const body = { model, prompt, n: Number.parseInt(args.n, 10) || 1 };
if (args.ar) body.aspect_ratio = args.ar;
if (args.resolution) body.resolution = args.resolution;
if (args.seed) body.seed = Number.parseInt(args.seed, 10);
const refs = await readRefs(args.ref);
if (refs) body.input_references = refs;

console.log(`gen.mjs: ${model}`);
console.log(`  prompt: ${prompt.slice(0, 110)}${prompt.length > 110 ? '…' : ''}`);
if (args.ar) console.log(`  aspect: ${args.ar}   resolution: ${args.resolution ?? 'default'}`);
if (refs) console.log(`  references: ${refs.length}`);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
let res;
try {
  res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
} catch (err) {
  fail(`request failed: ${err?.message ?? err}`);
} finally {
  clearTimeout(timer);
}

const text = await res.text();
if (!res.ok) {
  console.error(`gen.mjs: HTTP ${res.status}`);
  console.error(text.slice(0, 1200));
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  fail(`response was not JSON: ${text.slice(0, 400)}`);
}

// The API may return base64 or a URL; accept either rather than guessing.
const items = payload.data ?? payload.images ?? [];
if (!Array.isArray(items) || items.length === 0) {
  console.error('gen.mjs: no images in response. Shape was:');
  console.error(JSON.stringify(payload).slice(0, 1200));
  process.exit(1);
}

await mkdir(path.dirname(args.out), { recursive: true });
const written = [];
const formats = [];

for (let i = 0; i < items.length; i += 1) {
  const item = items[i];
  let bytes;
  if (item.b64_json) {
    bytes = Buffer.from(item.b64_json, 'base64');
  } else if (item.url?.startsWith('data:')) {
    bytes = Buffer.from(item.url.slice(item.url.indexOf(',') + 1), 'base64');
  } else if (item.url) {
    const img = await fetch(item.url);
    bytes = Buffer.from(await img.arrayBuffer());
  } else {
    console.error(`gen.mjs: item ${i} had no b64_json or url`);
    continue;
  }

  // Trust the bytes, not the extension we were handed. Several models ignore
  // format requests, and a mislabelled PNG is a silent trap downstream --
  // read_image refuses it and the browser may too.
  const { ext } = sniff(bytes);
  const base = items.length === 1 ? args.out : args.out.replace(/\.png$/, `-${i + 1}.png`);
  const actual = base.replace(/\.(png|jpg|jpeg|webp)$/i, `.${ext}`);
  if (actual !== base) {
    console.log(`  note: API returned ${ext.toUpperCase()}, saved as ${path.basename(actual)}`);
  }
  await writeFile(actual, bytes);
  written.push(actual);
  formats.push(ext);
  console.log(`  wrote ${actual} (${(bytes.length / 1024).toFixed(0)} KB)`);
}

const usage = payload.usage ?? null;
const cost = usage?.cost ?? usage?.total_cost ?? null;
console.log(`  usage: ${cost !== null ? `$${Number(cost).toFixed(4)}` : JSON.stringify(usage)}`);

const sidecar = {
  prompt,
  model,
  aspectRatio: args.ar ?? null,
  resolution: args.resolution ?? null,
  references: refs ? refs.length : 0,
  formats,
  outputs: written.map((p) => path.basename(p)),
  usage,
  generatedAt: new Date().toISOString(),
};
await writeFile(args.out.replace(/\.(png|jpg|jpeg|webp)$/i, '') + '.json', `${JSON.stringify(sidecar, null, 2)}\n`);
console.log('  sidecar written');
