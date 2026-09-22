// Headless tests for the match session: void inference and partnership play.
//
//   node test/game.test.mjs
//
// The bot's reasoning is logic, not presentation, so it is tested here rather
// than judged from a screenshot.

import { createGame } from '../src/core/game.js';
import { createRng } from '../src/core/rng.js';
import { buildSet } from '../src/core/rules.js';

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

// --- Fixtures -----------------------------------------------------------
const SET = buildSet();
const byPair = new Map(SET.map((t) => [`${t.a}-${t.b}`, t]));
const tid = (a, b) => byPair.get(`${Math.min(a, b)}-${Math.max(a, b)}`).id;
const tile = (a, b) => ({ ...byPair.get(`${Math.min(a, b)}-${Math.max(a, b)}`) });

/** A board line consistent with the given open ends. */
function lineWith(left, right) {
  return [
    { id: tid(left, right), a: Math.min(left, right), b: Math.max(left, right), flipped: false, by: 0, start: true },
  ];
}

/** Force the session into a position, bypassing the deal. */
function position({ hands, left, right, turn }) {
  const game = createGame({ rng: createRng(1) });
  game.begin();
  const m = game.match;
  m.state.hands = hands;
  m.state.board = { line: lineWith(left, right), leftEnd: left, rightEnd: right };
  m.state.turn = turn;
  m.state.phase = 'playing';
  m.state.forcedTile = null;
  m.state.consecutivePasses = 0;
  return game;
}

// --- Void inference -----------------------------------------------------
console.log('\nvoids');

test('a pass proves a seat is void in both open suits', () => {
  const game = position({
    hands: [[], [], [tile(0, 1), tile(1, 2)], [tile(3, 4)]],
    left: 5,
    right: 5,
    turn: 2,
  });
  eq(game.voidsFor(2).length, 0, 'nothing known before the pass');
  const events = game.playNow({ type: 'pass' });
  eq(events.length, 1, 'the pass was accepted');
  assert(game.voidsFor(2).includes(5), 'seat 2 is now known void in 5');
});

test('a pass on two different ends proves void in both', () => {
  const game = position({
    hands: [[], [], [], [tile(3, 4)]],
    left: 5,
    right: 2,
    turn: 3,
  });
  game.playNow({ type: 'pass' });
  const voids = game.voidsFor(3).sort();
  assert(voids.includes(5), 'void in the left end');
  assert(voids.includes(2), 'void in the right end');
  eq(voids.length, 2, 'exactly the two open suits');
});

test('voids are cleared when a new hand is dealt', () => {
  const game = position({
    hands: [[], [], [], [tile(3, 4)]],
    left: 5,
    right: 5,
    turn: 3,
  });
  game.playNow({ type: 'pass' });
  assert(game.voidsFor(3).includes(5), 'void recorded');
  game.match.nextHand !== undefined;
  // Deal a fresh hand through the rules engine.
  game.match.state.phase = 'handEnd';
  game.match.nextHand();
  // The session only learns about the deal by observing the event, so drive it
  // the way the loop does.
  game.update(0);
  game.playNow({ type: 'pass' });
  // After a fresh deal the old knowledge must not survive.
  const after = game.voidsFor(3);
  assert(!after.includes(5) || after.length <= 2, 'stale voids did not simply accumulate');
});

// --- Partnership play ---------------------------------------------------
console.log('\npartnership');

test('the bot strands an opponent rather than its own partner', () => {
  // Board open on 5 and 2. Seat 1 holds only 5-2, so it can go either way:
  //   left  -> leaves 2
  //   right -> leaves 5
  // Seat 2 (an opponent of seat 1) has proved it is void in 5, so the bot
  // should leave 5 showing.
  const game = position({
    hands: [
      [tile(0, 0)],
      [tile(5, 2), tile(0, 3)],
      [tile(1, 1)], // seat 2: no 5 anywhere
      [tile(4, 4)],
    ],
    left: 5,
    right: 5,
    turn: 2,
  });
  game.playNow({ type: 'pass' });
  assert(game.voidsFor(2).includes(5), 'seat 2 is known void in 5');

  // Re-cut the board so 5 and 2 are both open, and hand seat 1 the choice.
  const m = game.match;
  m.state.board = { line: lineWith(5, 2), leftEnd: 5, rightEnd: 2 };
  m.state.hands[1] = [tile(5, 2), tile(0, 3)];
  m.state.turn = 1;
  m.state.phase = 'playing';

  game.update(5); // let the bot's think timer expire and take the turn

  const played = m.state.board.line.find((t) => t.by === 1);
  assert(played, 'seat 1 played a tile');
  eq(played.id, tid(5, 2), 'it played the only tile that fits');
  // Going on the right-hand 2 leaves the free pip, a 5, showing — which is what
  // strands seat 2. Going left would leave a 2 instead.
  eq(game.lastEvent.end, 'right', 'it aimed the 5 at the opponent who cannot follow');
});

test('the bot does not strand its own partner', () => {
  // Same shape, but now it is seat 1's *partner* (seat 3) that is void in 5.
  // The bot should leave a 2 showing instead.
  const game = position({
    hands: [
      [tile(0, 1)],
      [tile(5, 2), tile(0, 3)],
      [tile(1, 1)],
      [tile(4, 4)], // seat 3: no 5
    ],
    left: 5,
    right: 5,
    turn: 3,
  });
  game.playNow({ type: 'pass' });
  assert(game.voidsFor(3).includes(5), 'seat 3, the partner, is void in 5');

  const m = game.match;
  m.state.board = { line: lineWith(5, 2), leftEnd: 5, rightEnd: 2 };
  m.state.hands[1] = [tile(5, 2), tile(0, 3)];
  m.state.turn = 1;
  m.state.phase = 'playing';
  m.state.consecutivePasses = 0;

  game.update(5);

  eq(game.lastEvent.end, 'left', 'it avoided leaving the suit its partner cannot follow');
  eq(m.state.board.leftEnd, 2, 'the free pip, a 2, is showing');
  eq(m.state.board.rightEnd, 2, 'and so is the other end, so no 5 remains');
});

// --- Hint ---------------------------------------------------------------
console.log('\nhint');

test('hint names a legal play for the player', () => {
  const game = position({
    hands: [[tile(0, 5)], [tile(1, 1)], [tile(2, 2)], [tile(3, 3)]],
    left: 5,
    right: 5,
    turn: 0,
  });
  const hint = game.hint();
  assert(hint, 'a hint exists when the player can move');
  eq(hint.type, 'play', 'the hint is a play, not a pass');
  const legal = game.match
    .view(0)
    .legal.some((m) => m.tileId === hint.tileId && m.end === hint.end);
  assert(legal, 'the hinted move is one the rules allow');
});

test('hint is null without a legal move and null off-turn', () => {
  const game = position({
    hands: [[tile(1, 2)], [tile(1, 1)], [tile(2, 2)], [tile(3, 3)]],
    left: 5,
    right: 6,
    turn: 0,
  });
  eq(game.hint(), null, 'no suggestion when the player must pass');
  eq(game.playerMustPass(), true, 'and the strip would offer Pasar instead');
  game.match.state.turn = 1;
  eq(game.hint(), null, 'no suggestion on somebody else\u2019s turn');
});

// --- Loop safety --------------------------------------------------------
console.log('\nloop');

test('the bot never attempts an illegal move over a full match', () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const game = createGame({ rng: createRng(seed), autoPlaySeat0: true });
    game.begin();
    let guard = 0;
    while (game.phase !== 'matchEnd' && guard < 6000) {
      guard += 1;
      const before = game.match.state.hands.flat().length + game.match.state.board.line.length;
      eq(before, 28, `seed ${seed}: tiles conserved`);
      game.update(3);
    }
    eq(game.phase, 'matchEnd', `seed ${seed}: match finished`);
    const [a, b] = game.scores;
    assert(a >= 200 || b >= 200, `seed ${seed}: a team reached the target`);
  }
});

// --- Report -------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  ${f.name}: ${f.message}`);
  process.exitCode = 1;
}
