// Headless tests for the rules engine. Pure Node, no browser, no dependencies:
//
//   node test/rules.test.mjs
//
// Covers the deal, the forced double-six opening, left/right orientation, pass
// legality, trancado scoring, domino scoring, the target score, view filtering,
// determinism, and full-match invariants.

import { createMatch, buildSet, pipTotal, teamOf } from '../src/core/rules.js';
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
function deepEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg}: expected ${b}, got ${a}`);
}

// --- Fixtures -----------------------------------------------------------
const SET = buildSet();
const byPair = new Map(SET.map((t) => [`${t.a}-${t.b}`, t]));
/** Tile id for a pair, written either way round. */
const tid = (a, b) => byPair.get(`${Math.min(a, b)}-${Math.max(a, b)}`).id;
/** A fresh tile object for a pair. */
const tile = (a, b) => ({ ...byPair.get(`${Math.min(a, b)}-${Math.max(a, b)}`) });

const SIXES = SET.filter((t) => t.a === 6 || t.b === 6).map((t) => t.id);
const hasSix = (t) => t.a === 6 || t.b === 6;

/**
 * Deal the listed tiles to their seats and fill every spare slot from tiles
 * that carry no 6, so an unlisted seat can never accidentally follow a 6.
 *
 * Spare slots are filled from the highest seat down. There are only 21 no-6
 * tiles in the set, so when seat 0 is pre-assigned the double-six the fillers
 * must be spent on seats 1-3 first; filling upwards would hand them stray sixes
 * and quietly break every "the others are stuck" fixture.
 */
function stacked(seatTileIds) {
  const chosen = new Set(seatTileIds.flat());
  const pool = SET.filter((t) => !chosen.has(t.id));
  const ordered = [...pool.filter((t) => !hasSix(t)), ...pool.filter(hasSix)];
  const seats = [[], [], [], []];
  for (let s = 0; s < 4; s += 1) {
    seats[s] = (seatTileIds[s] ?? []).map((id) => ({ ...SET[id] }));
  }
  let next = 0;
  for (let s = 3; s >= 0; s -= 1) {
    while (seats[s].length < 7) seats[s].push({ ...ordered[next++] });
  }
  const deck = seats.flat();
  if (deck.length !== 28) throw new Error(`fixture dealt ${deck.length} tiles`);
  return () => deck;
}

const match = (seatTileIds, opts = {}) =>
  createMatch({ shuffle: stacked(seatTileIds), ...opts });

/** Team pip totals for a seat view, used to predict tranca outcomes. */
function teamTotals(m) {
  return [0, 1].map((team) => {
    let sum = 0;
    for (let s = 0; s < 4; s += 1) if (teamOf(s) === team) sum += pipTotal(m.state.hands[s]);
    return sum;
  });
}

/**
 * Open a hand with double-six from seat 0 and return the match, ready for
 * seat 3. `bySeat` adds tiles to specific seats, e.g. `{ 3: [tid(6, 2)] }`.
 */
function openedWithDoubleSix(bySeat = {}) {
  const layout = [[tid(6, 6)], [], [], []];
  for (const [seat, ids] of Object.entries(bySeat)) layout[Number(seat)] = ids;
  const m = match(layout);
  m.start();
  eq(m.state.turn, 0, 'seat 0 holds double-six and opens');
  eq(m.state.forcedTile, tid(6, 6), 'opening is forced');
  m.apply({ type: 'play', tileId: tid(6, 6), end: 'first' });
  eq(m.state.turn, 3, 'play passes to the right');
  return m;
}

// --- Set and deal -------------------------------------------------------
console.log('\nset and deal');

test('double-six set holds 28 unique tiles', () => {
  eq(SET.length, 28, 'tile count');
  eq(new Set(SET.map((t) => t.id)).size, 28, 'unique ids');
  assert(SET.every((t) => t.a <= t.b), 'tiles stored with a <= b');
});

test('the full set totals 168 pips', () => {
  eq(pipTotal(SET), 168, 'pip total');
});

test('partners are seats 0+2 and 1+3', () => {
  deepEq([teamOf(0), teamOf(1), teamOf(2), teamOf(3)], [0, 1, 0, 1], 'teams');
});

test('a deal gives every seat seven tiles and keeps all 28', () => {
  const m = match([]);
  m.start();
  deepEq(m.state.hands.map((h) => h.length), [7, 7, 7, 7], 'hand sizes');
  eq(new Set(m.state.hands.flat().map((t) => t.id)).size, 28, 'no duplicates');
});

test('the holder of double-six opens and must play it', () => {
  // Seat 2 holds the double-six, so seat 2 must open with it.
  const m = match([[], [], [tid(6, 6)], []]);
  m.start();
  eq(m.state.turn, 2, 'opener is the double-six holder');
  const legal = m.legalMoves(2);
  eq(legal.length, 1, 'exactly one legal opening');
  eq(legal[0].tileId, tid(6, 6), 'only the forced tile may open');
  eq(m.apply({ type: 'play', tileId: tid(6, 6), end: 'first' }).length, 1, 'accepted');
  eq(m.state.board.leftEnd, 6, 'left end after 6-6');
  eq(m.state.board.rightEnd, 6, 'right end after 6-6');
});

test('the opener may not play a different tile', () => {
  const m = match([[tid(6, 6), tid(2, 3)], [], [], []]);
  m.start();
  eq(m.apply({ type: 'play', tileId: tid(2, 3), end: 'first' }).length, 0, 'rejected');
  eq(m.state.board.line.length, 0, 'board untouched');
});

// --- Orientation --------------------------------------------------------
console.log('\norientation');

test('appending on the right joins the matching pip inward', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 2)] });
  const events = m.apply({ type: 'play', tileId: tid(6, 2), end: 'right' });
  eq(events.length, 1, 'play accepted');
  eq(m.state.board.rightEnd, 2, 'new right end is the free pip');
  eq(m.state.board.leftEnd, 6, 'left end untouched');
  eq(m.state.board.line.length, 2, 'two tiles on the board');
  // The tile is stored 2-6, so the 6 has to flip to face the line.
  eq(m.state.board.line[1].flipped, true, 'flipped so the 6 faces the line');
});

test('prepending on the left joins the matching pip inward', () => {
  const m = openedWithDoubleSix({ 3: [tid(3, 6)] });
  eq(m.apply({ type: 'play', tileId: tid(3, 6), end: 'left' }).length, 1, 'play accepted');
  eq(m.state.board.leftEnd, 3, 'new left end is the free pip');
  eq(m.state.board.rightEnd, 6, 'right end untouched');
  eq(m.state.board.line.length, 2, 'two tiles on the board');
  // Stored 3-6, so b (6) already sits on the line side.
  eq(m.state.board.line[0].flipped, false, 'the 6 already faces the line');
});

test('a tile whose matching pip is already first is not flipped', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 2)], 2: [tid(2, 5)] });
  m.apply({ type: 'play', tileId: tid(6, 2), end: 'right' });
  eq(m.state.board.rightEnd, 2, 'right end is 2');
  eq(m.apply({ type: 'play', tileId: tid(2, 5), end: 'right' }).length, 1, 'play accepted');
  eq(m.state.board.line[2].flipped, false, 'stored 2-5, so the 2 already faces the line');
  eq(m.state.board.rightEnd, 5, 'new right end is the free pip');
});

test('a doubled end accepts a matching tile on either side', () => {
  const m = openedWithDoubleSix({ 3: [tid(2, 6)] });
  m.apply({ type: 'play', tileId: tid(2, 6), end: 'right' });
  eq(m.state.board.rightEnd, 2, 'right end');
  eq(m.state.board.line[1].flipped, true, 'stored 2-6, so the 6 flips to meet the line');
});

test('a double played on an end leaves both pips equal', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 4), tid(4, 4)] });
  m.apply({ type: 'play', tileId: tid(6, 4), end: 'right' });
  eq(m.state.board.rightEnd, 4, 'right end is 4');
  m.apply({ type: 'play', tileId: tid(4, 4), end: 'right' });
  eq(m.state.board.rightEnd, 4, 'still 4 after the double');
  eq(m.state.board.leftEnd, 6, 'left end untouched');
});

// --- Legality -----------------------------------------------------------
console.log('\nlegality');

test('only tiles matching an open end are offered', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 2), tid(3, 4)] });
  const legal = m.legalMoves(3);
  eq(new Set(legal.map((mv) => mv.tileId)).size, 1, 'exactly one tile is playable');
  eq(legal[0].tileId, tid(6, 2), 'the tile holding a 6');
  eq(legal.some((mv) => mv.tileId === tid(3, 4)), false, 'the 3-4 is not playable');
});

test('a tile matching both ends is offered twice, once per end', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 3)] });
  const legal = m.legalMoves(3);
  eq(legal.length, 2, 'two placements');
  deepEq(legal.map((mv) => mv.end).sort(), ['left', 'right'], 'one per end');
});

test('an illegal placement is rejected without changing state', () => {
  const m = openedWithDoubleSix({ 3: [tid(3, 4)] });
  const before = JSON.stringify(m.state.board);
  eq(m.apply({ type: 'play', tileId: tid(3, 4), end: 'right' }).length, 0, 'rejected');
  eq(JSON.stringify(m.state.board), before, 'board unchanged');
  eq(m.state.turn, 3, 'turn unchanged');
});

test('only the seat to move has legal moves', () => {
  const m = match([[], [], [tid(6, 6)], []]);
  m.start();
  eq(m.state.turn, 2, 'seat 2 to move');
  eq(m.legalMoves(2).length, 1, 'the seat to move has a move');
  for (const s of [0, 1, 3]) eq(m.legalMoves(s).length, 0, `seat ${s} has none out of turn`);
});

test('passing is rejected when a placement exists', () => {
  const m = match([[], [], [tid(6, 6)], []]);
  m.start();
  eq(m.apply({ type: 'pass' }).length, 0, 'pass rejected while able to play');
});

// --- Blocked hand -------------------------------------------------------
console.log('\ntrancado');

/**
 * A forced blocked position. A tranca cannot arise straight from the opening:
 * the set holds seven 6s, so after a 6-6 lead six of them are still spread
 * across the other hands and somebody can always follow. A real tranca is a
 * late-game position, so this fixture builds one directly — a board open on 6
 * and 5 with every hand holding neither value.
 *
 * Hand pips are chosen so the totals differ: team 0 holds 26, team 1 holds 34.
 */
function forcedBlocked(targetScore) {
  const m = match([], targetScore === undefined ? {} : { targetScore });
  m.start();
  m.state.hands = [
    [tile(0, 0), tile(0, 1), tile(0, 2), tile(0, 3)], // 6 pips
    [tile(0, 4), tile(1, 1), tile(1, 2), tile(1, 3)], // 13 pips
    [tile(1, 4), tile(2, 2), tile(2, 3), tile(2, 4)], // 20 pips
    [tile(3, 3), tile(3, 4), tile(4, 4)], // 21 pips
  ];
  m.state.board = {
    line: [{ id: tid(6, 5), a: 5, b: 6, flipped: true, by: 0 }],
    leftEnd: 6,
    rightEnd: 5,
  };
  m.state.turn = 0;
  m.state.consecutivePasses = 0;
  m.state.forcedTile = null;
  m.state.phase = 'playing';
  return m;
}

test('no hand can follow a board open on 6 and 5', () => {
  const m = forcedBlocked();
  for (let s = 0; s < 4; s += 1) {
    m.state.turn = s;
    eq(m.legalMoves(s).length, 0, `seat ${s} has no legal placement`);
    assert(m.mustPass(s), `seat ${s} must pass`);
  }
});

test('four consecutive passes end the hand as a tranca', () => {
  const m = forcedBlocked();
  for (let i = 0; i < 3; i += 1) {
    const events = m.apply({ type: 'pass' });
    eq(events.length, 1, `pass ${i + 1} accepted`);
    eq(events[0].type, 'passed', 'pass event');
    eq(m.state.phase, 'playing', 'the hand is still live');
  }
  const final = m.apply({ type: 'pass' });
  // The fourth pass both counts and closes the hand, so it reports two events.
  eq(final.length, 2, 'the fourth pass reports the pass and the hand end');
  eq(final[0].type, 'passed', 'the pass itself is reported');
  eq(final[1].type, 'handEnd', 'the hand ends on the fourth pass');
  eq(m.state.result.type, 'tranca', 'tranca');
  assert(m.state.phase === 'handEnd' || m.state.phase === 'matchEnd', 'hand is over');
});

test('a play resets the pass counter', () => {
  // Seats 3 and 2 hold no 6 and are stuck; seat 1 can follow the opening.
  const m = openedWithDoubleSix({ 1: [tid(6, 5)] });
  eq(m.apply({ type: 'pass' }).length, 1, 'seat 3 passes');
  eq(m.state.consecutivePasses, 1, 'one pass counted');
  eq(m.apply({ type: 'pass' }).length, 1, 'seat 2 passes');
  eq(m.state.consecutivePasses, 2, 'two passes counted');
  eq(m.apply({ type: 'play', tileId: tid(6, 5), end: 'right' }).length, 1, 'seat 1 plays');
  eq(m.state.consecutivePasses, 0, 'a play resets the counter');
});

test('the lower pip total takes a tranca and banks the opponents pips', () => {
  const m = forcedBlocked();
  deepEq(teamTotals(m), [26, 34], 'fixture team totals');
  for (let i = 0; i < 3; i += 1) eq(m.apply({ type: 'pass' }).length, 1, `pass ${i + 1}`);
  eq(m.apply({ type: 'pass' }).length, 2, 'the fourth pass closes the hand');

  eq(m.state.result.type, 'tranca', 'tranca');
  eq(m.state.result.winningTeam, 0, 'the lower pip total wins');
  eq(m.state.result.points, 34, 'banks the losing team pips');
  eq(m.state.scores[0], 34, 'score applied to team 0');
  eq(m.state.scores[1], 0, 'losers score nothing');
});

test('an even tranca scores nothing', () => {
  const m = forcedBlocked();
  // Level the teams: 0 + 5 against 1 + 4.
  m.state.hands = [[tile(0, 0)], [tile(0, 1)], [tile(1, 4)], [tile(2, 2)]];
  deepEq(teamTotals(m), [5, 5], 'fixture teams are level');
  for (let i = 0; i < 3; i += 1) eq(m.apply({ type: 'pass' }).length, 1, `pass ${i + 1}`);
  eq(m.apply({ type: 'pass' }).length, 2, 'the fourth pass closes the hand');
  eq(m.state.result.type, 'tranca-tie', 'a tie scores nothing');
  eq(m.state.result.points, 0, 'no points on a tie');
  eq(m.state.result.winningTeam, null, 'no winner');
  deepEq(m.state.scores, [0, 0], 'scores untouched');
});

// --- Domino -------------------------------------------------------------
console.log('\ndomino');

/** Force a one-tile endgame so the domino path can be tested directly. */
function forcedEndgame() {
  const m = match([]);
  m.start();
  m.state.hands = [
    [tile(6, 6)],
    [tile(2, 3), tile(4, 4)],
    [tile(1, 1)],
    [tile(5, 5), tile(0, 2)],
  ];
  m.state.board = { line: [], leftEnd: null, rightEnd: null };
  m.state.turn = 0;
  m.state.forcedTile = tid(6, 6);
  m.state.consecutivePasses = 0;
  return m;
}

test('playing the last tile wins the hand and banks every opposing pip', () => {
  const m = forcedEndgame();
  const events = m.apply({ type: 'play', tileId: tid(6, 6), end: 'first' });
  const end = events.find((e) => e.type === 'handEnd');
  assert(end, 'the hand ends');
  eq(end.result.winningSeat, 0, 'seat 0 wins');
  eq(end.type, 'handEnd', 'event type');
  eq(m.state.hands[0].length, 0, 'seat 0 is out of tiles');
  eq(m.state.result.type, 'domino', 'won by domino');

  // Only the opposing team's pips are banked; seat 2 is the winner's partner.
  const others = pipTotal(m.state.hands[1]) + pipTotal(m.state.hands[3]);
  eq(m.state.result.points, others, 'banks the opposing team pips');
  eq(m.state.scores[0], others, 'score applied to team 0');
  eq(m.state.scores[1], 0, 'opposition scores nothing');
});

test('a domino awards the hand to the winning seat team', () => {
  const m = forcedEndgame();
  m.state.hands[0] = [tile(1, 2)];
  m.state.turn = 2;
  m.state.forcedTile = null;
  m.state.hands[2] = [tile(6, 6)];
  m.state.board = { line: [], leftEnd: null, rightEnd: null };
  m.apply({ type: 'play', tileId: tid(6, 6), end: 'first' });
  eq(m.state.result.winningSeat, 2, 'seat 2 wins');
  eq(m.state.result.winningTeam, 0, 'seat 2 is on team 0');
});

// --- Match flow ---------------------------------------------------------
console.log('\nmatch');

test('the match ends once a team reaches the target', () => {
  const m = forcedBlocked(1);
  for (let i = 0; i < 3; i += 1) eq(m.apply({ type: 'pass' }).length, 1, `pass ${i + 1}`);
  eq(m.apply({ type: 'pass' }).length, 2, 'the fourth pass closes the hand');
  eq(m.state.phase, 'matchEnd', 'match over');
  eq(m.state.scores[0], 34, 'the winning team banked the hand');
  assert(m.state.result.matchOver, 'the result reports the match is over');
  eq(m.nextHand(), null, 'no further hands after the match');
});

test('the next hand is opened by the last player to play', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 2)] });
  m.apply({ type: 'play', tileId: tid(6, 2), end: 'right' });
  // Force the hand to finish so nextHand can run.
  m.state.phase = 'handEnd';
  m.state.result = { type: 'tranca', winningSeat: 1, winningTeam: 1, points: 0, scores: [0, 0], matchOver: false };
  const dealt = m.nextHand();
  assert(dealt, 'a new hand is dealt');
  eq(dealt.opener, 3, 'seat 3 played last and opens');
  eq(m.state.hands[1].length, 7, 'a fresh hand was dealt');
});

// --- View filtering -----------------------------------------------------
console.log('\nviews');

test('a seat view exposes only its own hand', () => {
  const m = match([]);
  m.start();
  const v = m.view(1);
  eq(v.myHand.length, 7, 'own hand present');
  deepEq(v.handCounts, [7, 7, 7, 7], 'others reduced to counts');
  eq(v.myHand.some((t) => m.state.hands[0].some((o) => o.id === t.id)), false, 'no foreign tiles');
  assert(!('hands' in v), 'the raw hands array is absent from a view');
});

test('a view is a copy and cannot mutate the match', () => {
  const m = match([]);
  m.start();
  const v = m.view(0);
  v.myHand.pop();
  v.scores[0] = 999;
  v.board.line.push({ id: 999 });
  eq(m.state.hands[0].length, 7, 'match hand untouched');
  eq(m.state.scores[0], 0, 'match score untouched');
  eq(m.state.board.line.length, 0, 'match board untouched');
});

test('a view reports the seat its own legal moves', () => {
  const m = openedWithDoubleSix({ 3: [tid(6, 2)] });
  const v = m.view(3);
  eq(v.turn, 3, 'seat 3 to move');
  // Both open ends are 6, so the single playable tile has two placements.
  eq(v.legal.length, 2, 'one placement per open end');
  deepEq(v.legal.map((mv) => mv.end).sort(), ['left', 'right'], 'one per end');
  eq(m.view(0).legal.length, 0, 'seat 0 gets none out of turn');
});

// --- Determinism and invariants ----------------------------------------
console.log('\ninvariants');

test('the same seed replays the same deal', () => {
  const deal = (seed) => {
    const rng = createRng(seed);
    const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
    m.start();
    return m.state.hands.map((h) => h.map((t) => t.id).join(',')).join('|');
  };
  eq(deal(1337), deal(1337), 'seed 1337 is stable');
  assert(deal(1337) !== deal(4242), 'different seeds differ');
});

test('many full matches terminate cleanly with tiles conserved', () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const rng = createRng(seed);
    const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
    m.start();
    let guard = 0;

    while (m.state.phase !== 'matchEnd' && guard < 6000) {
      guard += 1;
      if (m.state.phase === 'handEnd') {
        assert(m.nextHand(), `seed ${seed}: nextHand refused while in handEnd`);
        continue;
      }
      const seat = m.state.turn;
      const legal = m.legalMoves(seat);
      eq(m.state.hands.flat().length + m.state.board.line.length, 28, `seed ${seed}: tiles before`);
      assert(legal.length > 0 || m.mustPass(seat), `seed ${seed}: stuck seat must be allowed to pass`);

      if (legal.length === 0) {
        assert(m.apply({ type: 'pass' }).length > 0, `seed ${seed}: pass rejected while stuck`);
      } else {
        const pick = legal[rng.int(0, legal.length - 1)];
        assert(
          m.apply({ type: 'play', tileId: pick.tileId, end: pick.end }).length > 0,
          `seed ${seed}: legal move rejected`,
        );
      }

      eq(m.state.hands.flat().length + m.state.board.line.length, 28, `seed ${seed}: tiles after`);
      assert(m.state.turn >= 0 && m.state.turn < 4, `seed ${seed}: turn in range`);
      assert(m.state.consecutivePasses <= 4, `seed ${seed}: pass counter ran away`);
    }

    eq(m.state.phase, 'matchEnd', `seed ${seed}: match terminated`);
    const [a, b] = m.state.scores;
    assert(a >= m.targetScore || b >= m.targetScore, `seed ${seed}: a team reached the target`);
  }
});

test('every hand produces a legal move or a legal pass', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const rng = createRng(seed);
    const m = createMatch({ shuffle: (arr) => rng.shuffle(arr) });
    m.start();
    let guard = 0;
    while (m.state.phase === 'playing' && guard < 400) {
      guard += 1;
      const seat = m.state.turn;
      const legal = m.legalMoves(seat);
      if (legal.length === 0) {
        assert(m.mustPass(seat), `seed ${seed}: empty legal moves but mustPass is false`);
        m.apply({ type: 'pass' });
      } else {
        const pick = legal[rng.int(0, legal.length - 1)];
        m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
      }
    }
  }
});

test('every legal move names a tile the seat actually holds', () => {
  // The hand strip dims every tile the view does not offer, so a legal move
  // naming a foreign tile would light up the wrong tile and leave a playable
  // one greyed out.
  for (let seed = 1; seed <= 80; seed += 1) {
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
      for (let seat = 0; seat < 4; seat += 1) {
        const owned = new Set(m.state.hands[seat].map((t) => t.id));
        for (const move of m.view(seat).legal) {
          assert(
            owned.has(move.tileId),
            `seed ${seed}: seat ${seat} offered tile ${move.tileId}, which it does not hold`,
          );
        }
      }

      const seat = m.state.turn;
      const legal = m.legalMoves(seat);
      if (legal.length === 0) m.apply({ type: 'pass' });
      else {
        const pick = legal[rng.int(0, legal.length - 1)];
        m.apply({ type: 'play', tileId: pick.tileId, end: pick.end });
      }
    }
  }
});

// --- Report -------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ${f.name}: ${f.message}`);
  process.exitCode = 1;
}
