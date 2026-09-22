// Throwaway diagnostic: run a full match through the track and dump an ASCII
// board for the first layout that stalls or overlaps.
import { createTrack } from '../src/core/track.js';
import { createMatch } from '../src/core/rules.js';
import { createRng } from '../src/core/rng.js';

const seed = Number.parseInt(process.argv[2] ?? '1', 10);

function issuesOf(p, count, g) {
  const out = [];
  if (p.length !== count) out.push(`placed ${p.length} of ${count}`);
  const seen = new Map();
  for (const t of p) {
    if (t.overflow) out.push(`tile ${t.index} overflowed`);
    for (const [x, y] of t.cells) {
      if (x < 0 || x >= g.columns || y < 0 || y >= g.rows) out.push(`tile ${t.index} off-grid ${x},${y}`);
      const k = `${x},${y}`;
      if (seen.has(k)) out.push(`cell ${k} shared by ${seen.get(k)} and ${t.index}`);
      seen.set(k, t.index);
    }
  }
  if (p.stalled) out.push(`${p.stalled} stalled`);
  return out;
}

function dump(track, p) {
  const g = track.grid;
  const grid = Array.from({ length: g.rows }, () => Array(g.columns).fill(' . '));
  p.forEach((t, i) => {
    for (const [x, y] of t.cells) {
      if (x >= 0 && x < g.columns && y >= 0 && y < g.rows) {
        grid[y][x] = String.fromCharCode(65 + (i % 26)).padStart(1) + ' ';
      }
    }
  });
  console.log('    ' + Array.from({ length: g.columns }, (_, i) => String(i % 10) + ' ').join(''));
  grid.forEach((row, y) => console.log(String(y).padStart(3) + ' ' + row.join('')));
  console.log('\nplacements:');
  p.forEach((t, i) => {
    console.log(
      `  ${String(i).padStart(2)} ${t.a}-${t.b}${t.cross ? ' X' : '  '} ` +
        `cells ${t.cells.map((c) => c.join(',')).join('->')} head ${t.grid.dx},${t.grid.dy}` +
        `${t.overflow ? '  <-- OVERFLOW' : ''}`,
    );
  });
  console.log(`\nstalled=${p.stalled} occupied=${p.occupiedCount}`);
}

const rng = createRng(seed);
const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
m.start();
let guard = 0;
let hand = 0;

while (m.state.phase !== 'matchEnd' && guard < 6000) {
  guard += 1;
  if (m.state.phase === 'handEnd') {
    m.nextHand();
    hand += 1;
    continue;
  }
  const seat = m.state.turn;
  const legal = m.legalMoves(seat);
  if (legal.length === 0) m.apply({ type: 'pass' });
  else {
    const pick = legal[rng.int(0, legal.length - 1)];
    m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
  }

  const line = m.state.board.line;
  if (line.length === 0) continue;
  const track = createTrack();
  const p = track.layout(line);
  const issues = issuesOf(p, line.length, track.grid);
  if (issues.length > 0) {
    console.log(`seed ${seed} hand ${hand} line ${line.length}: ${issues.join('; ')}`);
    console.log(line.map((t, i) => `${i}:${t.a}-${t.b}${t.start ? '*' : ''}${t.flipped ? 'f' : ''}`).join('  '));
    dump(track, p);
    process.exit(0);
  }
}

console.log(`seed ${seed}: no layout problems (guard ${guard})`);
