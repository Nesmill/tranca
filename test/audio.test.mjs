// Headless tests for the audio surface.
//
//   node test/audio.test.mjs
//
// There is no WebAudio in Node, which makes this exactly the environment the
// module claims to survive: every entry point must degrade to silence rather
// than throw. Audio itself cannot be asserted headlessly — what is asserted is
// that a browser without it, or with it blocked, still plays the game.

import { createAudio } from '../src/core/audio.js';

// --- Tiny assertion harness --------------------------------------------
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push({ name, message: err?.message ?? String(err) });
    console.log(`  FAIL ${name}\n         ${err?.message ?? err}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

// --- Tests --------------------------------------------------------------
console.log('\nno webaudio');

test('Node really has no AudioContext, so this is the degraded path', () => {
  eq(typeof globalThis.AudioContext, 'undefined', 'AudioContext is absent');
});

test('every one-shot is silent rather than fatal without WebAudio', () => {
  const audio = createAudio();
  audio.clack();
  audio.clack(2);
  audio.shuffle();
  audio.shuffle(3);
  audio.thud();
  audio.knock();
  audio.blip();
  audio.blip(880);
  audio.knell();
  eq(audio.enabled, false, 'audio reports itself disabled');
  eq(audio.state, 'none', 'there is no context to report');
});

test('the ambience refuses to start and does not claim otherwise', () => {
  const audio = createAudio();
  eq(audio.startAmbience(), false, 'startAmbience reports failure');
  eq(audio.ambienceOn, false, 'it is not running');
  // Stopping something that never started must also be safe.
  audio.stopAmbience();
  eq(audio.ambienceOn, false, 'still not running');
});

test('volume and unlock are safe without a context', () => {
  const audio = createAudio();
  audio.setVolume(0);
  audio.setVolume(1);
  audio.setVolume(-5);
  audio.setVolume(99);
  audio.unlock();
  eq(audio.enabled, false, 'still disabled');
});

test('dispose is safe, and safe to call twice', () => {
  const audio = createAudio();
  audio.startAmbience();
  audio.dispose();
  audio.dispose();
  eq(audio.ambienceOn, false, 'no ambience left running');
});

test('the whole surface survives repeated use in sequence', () => {
  const audio = createAudio();
  for (let i = 0; i < 50; i += 1) {
    audio.clack(1);
    audio.knock();
    if (i % 10 === 0) audio.startAmbience();
  }
  audio.stopAmbience();
  audio.dispose();
  eq(audio.ambienceOn, false, 'nothing left behind');
  assert(true, 'no throw across 50 rounds');
});

// --- Report -------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ${f.name}: ${f.message}`);
  process.exitCode = 1;
}
