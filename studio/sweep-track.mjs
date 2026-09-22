// Throwaway sweep: find the smallest cell grid on which every real match lays
// out without the line folding back onto itself.
import { createTrack } from '../src/core/track.js';
import { createMatch } from '../src/core/rules.js';
import { createRng } from '../src/core/rng.js';

const MATCHES = Number.parseInt(process.argv[2] ?? '60', 10);
const TABLE = 1.02;

function check(columns, rows, cell, matches) {
  let worst = 0;
  for (let seed = 1; seed <= matches; seed += 1) {
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
      if (legal.length === 0) m.apply({ type: 'pass' });
      else {
        const pick = legal[rng.int(0, legal.length - 1)];
        m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
      }
      const line = m.state.board.line;
      if (line.length === 0) continue;
      worst = Math.max(worst, line.length);
      const p = createTrack({ columns, rows, cell }).layout(line);
      const seen = new Set();
      for (const t of p) {
        if (t.overflow || t === undefined) return { ok: false, worst, why: `overflow @${line.length}` };
        for (const [x, y] of t.cells) {
          if (x < 0 || x >= columns || y < 0 || y >= rows) {
            return { ok: false, worst, why: `off-grid @${line.length}` };
          }
          const k = `${x},${y}`;
          if (seen.has(k)) return { ok: false, worst, why: `overlap @${line.length}` };
          seen.add(k);
        }
      }
    }
  }
  return { ok: true, worst };
}

const candidates = [];
// Narrow-and-deep boards are the interesting direction: a portrait frame only
// shows about half a metre of table across, so board width is the scarce axis.
for (const columns of [8, 10, 12, 14, 16, 18, 20, 22, 24]) {
  for (const rows of [13, 15, 17, 19, 21, 23, 25, 27, 31, 35]) {
    // Keep the board inside the table, and the tile close to its 2:1 shape.
    const cell = Math.min(TABLE / columns, TABLE / rows);
    candidates.push({ columns, rows, cell: Number(cell.toFixed(4)) });
  }
}

console.log(`table ${TABLE} m, ${MATCHES} matches per candidate\n`);
console.log('cols rows   cell   span(m)   tile(mm)   result');
for (const c of candidates) {
  const r = check(c.columns, c.rows, c.cell, MATCHES);
  const span = (Math.max(c.columns, c.rows) * c.cell).toFixed(3);
  const tile = `${(c.cell * 2000).toFixed(0)}x${(c.cell * 1000).toFixed(0)}`;
  console.log(
    `${String(c.columns).padStart(4)} ${String(c.rows).padStart(4)}  ${c.cell.toFixed(3)}   ${span.padStart(6)}   ${tile.padStart(8)}   ${r.ok ? 'OK' : `FAIL (${r.why})`}`,
  );
}
