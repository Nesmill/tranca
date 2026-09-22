// Headless tests for the board track. Pure Node, no browser, no dependencies:
//
//   node test/track.test.mjs
//
// The track is the piece most likely to fail quietly — a bad turn rule produces
// overlapping tiles or a line that runs off the table — so these tests check the
// grid directly and then drive real matches through it.

import { createTrack, DEFAULT_GRID as GRID } from '../src/core/track.js';
import { createMatch } from '../src/core/rules.js';
import { createRng } from '../src/core/rng.js';

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

// --- Helpers ------------------------------------------------------------
const track = createTrack();

/** Build a board line from `[a, b]` pairs, normalising to a <= b. */
function lineOf(pairs) {
  return pairs.map(([a, b], i) => ({
    id: i,
    a: Math.min(a, b),
    b: Math.max(a, b),
    flipped: false,
    by: i % 4,
    ...(i === 0 ? { start: true } : {}),
  }));
}

/** Every check the board must satisfy, returned as a list of problems. */
function problems(placements, expectedCount) {
  const issues = [];
  if (placements.length !== expectedCount) {
    issues.push(`placed ${placements.length} of ${expectedCount} tiles`);
  }
  const seen = new Map();
  for (const p of placements) {
    if (!p) {
      issues.push('a placement is missing');
      continue;
    }
    if (p.overflow) issues.push(`tile ${p.index} overflowed the grid`);
    for (const [gx, gy] of p.cells) {
      if (gx < 0 || gx >= GRID.columns || gy < 0 || gy >= GRID.rows) {
        issues.push(`tile ${p.index} cell ${gx},${gy} is off the grid`);
      }
      const k = `${gx},${gy}`;
      if (seen.has(k)) issues.push(`cell ${k} shared by tiles ${seen.get(k)} and ${p.index}`);
      seen.set(k, p.index);
    }
  }
  if (placements.stalled) issues.push(`${placements.stalled} tile(s) stalled`);
  return issues;
}

// --- Grid basics --------------------------------------------------------
console.log('\ngrid');

test('the track exposes a grid that fits inside the table', () => {
  const g = createTrack().grid;
  assert(g.columns > 0 && g.rows > 0, 'grid has extent');
  assert(g.columns % 2 === 0, 'columns are even so a two-cell tile centres');
  assert(g.rows % 2 === 1, 'rows are odd so the opening tile centres across z');
  const spanX = g.columns * g.cell;
  const spanZ = g.rows * g.cell;
  assert(spanX < 1.02, `board span x ${spanX.toFixed(3)} m must fit the 1.02 m table`);
  assert(spanZ < 1.02, `board span z ${spanZ.toFixed(3)} m must fit the 1.02 m table`);
  assert(g.cell > 0.038, `cell ${g.cell} is too small to read pips on a phone`);
  // Width is the scarce axis in a portrait frame, so the board has to stay
  // narrow. Whether it is also deep enough to finish a hand is not something a
  // shape assertion can show -- the full-match test below is what proves that.
  assert(spanX <= 0.72, `board is ${spanX.toFixed(3)} m wide, too wide for the frame`);
});

test('cellToWorld maps the grid centre to the table centre', () => {
  const t = createTrack();
  const g = t.grid;
  const c = t.cellToWorld((g.columns - 1) / 2, (g.rows - 1) / 2);
  assert(Math.abs(c.x) < 1e-9, `centre x is ${c.x}`);
  assert(Math.abs(c.z) < 1e-9, `centre z is ${c.z}`);
});

test('an empty line lays out to nothing', () => {
  eq(createTrack().layout([]).length, 0, 'empty board');
  eq(createTrack().layout(null).length, 0, 'missing board');
});

// --- Straight runs ------------------------------------------------------
console.log('\nstraight runs');

test('a short line lays out with no overlaps', () => {
  const line = lineOf([[6, 6], [6, 2], [2, 5], [5, 5], [5, 1]]);
  const placements = track.layout(line);
  const issues = problems(placements, line.length);
  eq(issues.length, 0, issues.join('; '));
});

test('the anchor tile sits on the table centre', () => {
  // An inline opener centres exactly; a crosswise double sits half a cell to one
  // side of centre, because it lies across the line rather than along it.
  const inline = track.layout(lineOf([[6, 5], [5, 3]]));
  assert(Math.abs(inline[0].center.x) < 1e-9, `inline anchor x is ${inline[0].center.x}`);
  assert(Math.abs(inline[0].center.z) < 1e-9, `inline anchor z is ${inline[0].center.z}`);

  const dbl = track.layout(lineOf([[6, 6], [6, 2]]));
  assert(Math.abs(dbl[0].center.x) <= GRID.cell, `double anchor x is ${dbl[0].center.x}`);
  assert(Math.abs(dbl[0].center.z) <= GRID.cell, `double anchor z is ${dbl[0].center.z}`);
});

test('a double lies across the line and advances it by one cell', () => {
  // Anchor 6-6 is itself a double, so it lies across the opening heading.
  const line = lineOf([[6, 6], [6, 3]]);
  const p = track.layout(line);
  const [c0, c1] = p[0].cells;
  eq(c0[0], c1[0], 'the double shares a column, so it lies across');
  eq(Math.abs(c1[1] - c0[1]), 1, 'and spans one cell across');
  assert(p[0].cross, 'flagged as crosswise');
  assert(!p[1].cross, 'the following tile is inline');
  // The next tile must start one cell along from the double, not two.
  const d0 = p[1].cells[0];
  eq(d0[0] - c0[0], 1, 'the line advanced a single cell past the double');
});

test('an inline opening tile advances the line by two cells', () => {
  const line = lineOf([[6, 5], [5, 3]]);
  const p = track.layout(line);
  assert(!p[0].cross, 'the opener is inline');
  const d0 = p[1].cells[0];
  eq(d0[0] - p[0].cells[0][0], 2, 'the line advanced two cells');
});

// --- Turning ------------------------------------------------------------
console.log('\nturning');

test('a long line turns instead of running off the table', () => {
  const pairs = [[6, 6]];
  let end = 6;
  for (let i = 0; i < 15; i += 1) {
    const next = (end + 1) % 7;
    pairs.push([end, next]);
    end = next;
  }
  const line = lineOf(pairs);
  const p = track.layout(line);
  eq(problems(p, line.length).length, 0, problems(p, line.length).join('; '));
  const headings = new Set(p.map((t) => `${t.grid.dx},${t.grid.dy}`));
  assert(headings.size > 1, 'the line changed direction at least once');
});

test('a twenty-eight tile line stays on the table', () => {
  const pairs = [];
  for (let a = 0; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) pairs.push([a, b]);
  const line = lineOf(pairs);
  const p = track.layout(line);
  const issues = problems(p, line.length);
  eq(issues.length, 0, issues.join('; '));
  eq(p.occupiedCount, 28 * 2 - 0, 'every tile covers two cells');
});

// --- Turning direction --------------------------------------------------
console.log('\nheadings');

test('the first tile heading is to the right', () => {
  const p = track.layout(lineOf([[3, 4], [4, 1]]));
  eq(p[0].grid.dx, 1, 'anchor dx');
  eq(p[0].grid.dy, 0, 'anchor dy');
});

test('a turned tile keeps the line connected', () => {
  // A long one-sided run forces a turn; every consecutive pair must touch.
  const pairs = [[6, 6]];
  let end = 6;
  for (let i = 0; i < 18; i += 1) {
    const next = (end + 1) % 7;
    pairs.push([end, next]);
    end = next;
  }
  const p = track.layout(lineOf(pairs));
  const cellSet = new Set();
  for (const t of p) for (const [gx, gy] of t.cells) cellSet.add(`${gx},${gy}`);

  const touches = (a, b) =>
    a.some(([ax, ay]) => b.some(([bx, by]) => Math.abs(ax - bx) + Math.abs(ay - by) === 1));
  for (let i = 0; i + 1 < p.length; i += 1) {
    assert(touches(p[i].cells, p[i + 1].cells), `tiles ${i} and ${i + 1} do not touch`);
  }
});

// --- Against real matches ----------------------------------------------
console.log('\nreal matches');

test('two hundred real matches lay out cleanly after every play', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const rng = createRng(seed);
    const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
    m.start();
    let guard = 0;

    while (m.state.phase !== 'matchEnd' && guard < 6000) {
      guard += 1;
      if (m.state.phase === 'handEnd') {
        m.nextHand();
        continue;
      }
      const seat = m.state.turn;
      const legal = m.legalMoves(seat);
      if (legal.length === 0) {
        m.apply({ type: 'pass' });
      } else {
        const pick = legal[rng.int(0, legal.length - 1)];
        m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
      }
      const line = m.state.board.line;
      if (line.length === 0) continue;
      const placements = createTrack().layout(line);
      const issues = problems(placements, line.length);
      assert(issues.length === 0, `seed ${seed} at ${line.length} tiles: ${issues.join('; ')}`);
    }
    eq(m.state.phase, 'matchEnd', `seed ${seed} finished`);
  }
});

test('a layout is stable as the line grows', () => {
  // Recomputing must never move a tile that is already on the table.
  const rng = createRng(7);
  const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
  m.start();
  let previous = [];
  let guard = 0;
  while (m.state.phase === 'playing' && guard < 400) {
    guard += 1;
    const seat = m.state.turn;
    const legal = m.legalMoves(seat);
    if (legal.length === 0) {
      m.apply({ type: 'pass' });
    } else {
      const pick = legal[rng.int(0, legal.length - 1)];
      m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
    }
    const line = m.state.board.line;
    if (line.length === 0) continue;
    const now = createTrack().layout(line);
    for (const tile of previous) {
      const again = now.find((t) => t.id === tile.id);
      assert(again, `tile ${tile.id} vanished from the board`);
      eq(again.cells[0][0], tile.cells[0][0], `tile ${tile.id} moved in x`);
      eq(again.cells[0][1], tile.cells[0][1], `tile ${tile.id} moved in y`);
    }
    previous = now;
  }
  assert(previous.length > 3, 'the hand actually placed tiles');
});

// --- Report -------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ${f.name}: ${f.message}`);
  process.exitCode = 1;
}
