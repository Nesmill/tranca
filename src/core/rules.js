// Dominican dominoes: pure rules, no three.js, no DOM.
//
// Every seat reads the game through `view(seat)`, which exposes only that seat's
// own hand plus public information. That is the whole anti-cheat design: an AI
// seat physically cannot see the player's tiles, and a future networked seat can
// reuse the same interface over a socket without touching this file.
//
// The engine mutates in place and returns the events it produced. Determinism
// comes from the injected `shuffle`, so a given seed replays a whole match.

// --- Tuning constants ---------------------------------------------------
export const MAX_PIP = 6; // double-six set
export const PLAYERS = 4;
export const HAND_SIZE = 7;
export const DEFAULT_TARGET = 200;
export const BLOCKED_PASSES = PLAYERS; // four passes in a row without a play
// -------------------------------------------------------------------------

/** Team of a seat. Partners sit opposite, so seats 0+2 and 1+3 pair up. */
export const teamOf = (seat) => seat % 2;

/** Build the double-six set: 28 tiles, always stored with a <= b. */
export function buildSet(maxPip = MAX_PIP) {
  const tiles = [];
  let id = 0;
  for (let a = 0; a <= maxPip; a += 1) {
    for (let b = a; b <= maxPip; b += 1) {
      tiles.push({ id, a, b });
      id += 1;
    }
  }
  return tiles;
}

/** Total pips across a collection of tiles. */
export function pipTotal(tiles) {
  let sum = 0;
  for (const t of tiles) sum += t.a + t.b;
  return sum;
}

const isDouble = (t) => t.a === t.b;

/**
 * Create a match.
 * @param {object} options
 * @param {<T>(arr: T[]) => T[]} options.shuffle Deterministic shuffle.
 * @param {number} [options.targetScore] Score that ends the match.
 * @param {number} [options.maxPip] Highest pip in the set.
 * @returns {object} Match controller: `view`, `legalMoves`, `apply`, `state`.
 */
export function createMatch({ shuffle, targetScore = DEFAULT_TARGET, maxPip = MAX_PIP }) {
  if (typeof shuffle !== 'function') throw new Error('createMatch needs a shuffle function');

  const set = buildSet(maxPip);
  const topDouble = maxPip;

  const state = {
    phase: 'idle', // idle | playing | handEnd | matchEnd
    handNumber: 0,
    scores: [0, 0],
    hands: [[], [], [], []],
    board: { line: [], leftEnd: null, rightEnd: null },
    turn: 0,
    consecutivePasses: 0,
    forcedTile: null, // the double that must open the hand, when the rules force it
    lastPlayerToPlay: null,
    result: null,
  };

  // --- Dealing ----------------------------------------------------------
  function dealHand(opener, forceDouble) {
    const deck = shuffle(set.map((t) => ({ ...t })));
    state.hands = [];
    for (let s = 0; s < PLAYERS; s += 1) {
      state.hands.push(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE));
    }
    state.board = { line: [], leftEnd: null, rightEnd: null };
    state.consecutivePasses = 0;
    state.result = null;
    state.turn = opener;
    state.forcedTile = null;

    if (forceDouble) {
      const holder = state.hands.findIndex((h) => h.some((t) => isDouble(t) && t.a === topDouble));
      if (holder < 0) throw new Error(`no double-${topDouble} in the deal`);
      const tile = state.hands[holder].find((t) => isDouble(t) && t.a === topDouble);
      state.turn = holder;
      state.forcedTile = tile.id;
    }

    state.phase = 'playing';
    state.handNumber += 1;
    return {
      type: 'dealt',
      handNumber: state.handNumber,
      opener: state.turn,
      forcedTile: state.forcedTile,
    };
  }

  /** Deal the first hand: the holder of the top double opens with it. */
  function start() {
    state.scores = [0, 0];
    state.handNumber = 0;
    state.lastPlayerToPlay = null;
    return dealHand(0, true);
  }

  /** Deal the next hand; the previous hand's last player to play opens. */
  function nextHand() {
    if (state.phase !== 'handEnd') return null;
    if (state.scores[0] >= targetScore || state.scores[1] >= targetScore) return null;
    return dealHand(state.lastPlayerToPlay ?? 0, false);
  }

  // --- Queries ----------------------------------------------------------
  /** Legal moves for a seat: `{ tileId, end }`, or `{ pass: true }` when stuck. */
  function legalMoves(seat) {
    if (state.phase !== 'playing' || state.turn !== seat) return [];
    const hand = state.hands[seat];

    if (state.board.line.length === 0) {
      const openable =
        state.forcedTile === null ? hand : hand.filter((t) => t.id === state.forcedTile);
      return openable.map((t) => ({ tileId: t.id, end: 'first' }));
    }

    const moves = [];
    for (const t of hand) {
      if (t.a === state.board.leftEnd || t.b === state.board.leftEnd) {
        moves.push({ tileId: t.id, end: 'left' });
      }
      if (t.a === state.board.rightEnd || t.b === state.board.rightEnd) {
        moves.push({ tileId: t.id, end: 'right' });
      }
    }
    return moves;
  }

  /** True when the seat to move has no legal placement. */
  function mustPass(seat) {
    return state.phase === 'playing' && state.turn === seat && legalMoves(seat).length === 0;
  }

  /** A seat's filtered view: its own hand plus public information only. */
  function view(seat) {
    return {
      seat,
      team: teamOf(seat),
      phase: state.phase,
      handNumber: state.handNumber,
      scores: [state.scores[0], state.scores[1]],
      myHand: state.hands[seat].map((t) => ({ ...t })),
      handCounts: state.hands.map((h) => h.length),
      board: {
        line: state.board.line.map((t) => ({ ...t })),
        leftEnd: state.board.leftEnd,
        rightEnd: state.board.rightEnd,
      },
      turn: state.turn,
      legal: legalMoves(seat),
      forcedTile: state.forcedTile,
      result: state.result ? { ...state.result } : null,
    };
  }

  // --- Scoring ----------------------------------------------------------
  function opposingPips(team) {
    let sum = 0;
    for (let s = 0; s < PLAYERS; s += 1) {
      if (teamOf(s) !== team) sum += pipTotal(state.hands[s]);
    }
    return sum;
  }

  function finishHand(type, winningSeat) {
    const winningTeam = teamOf(winningSeat);
    const points = opposingPips(winningTeam);
    state.scores[winningTeam] += points;
    state.phase = state.scores[winningTeam] >= targetScore ? 'matchEnd' : 'handEnd';
    state.result = {
      type,
      winningSeat,
      winningTeam,
      points,
      scores: [state.scores[0], state.scores[1]],
      matchOver: state.phase === 'matchEnd',
    };
    // The outcome rides in `result`; the event's own `type` stays 'handEnd'.
    return { type: 'handEnd', result: { ...state.result } };
  }

  // --- Moves ------------------------------------------------------------
  function place(seat, tile, end) {
    let entry;
    if (end === 'first') {
      // `start` marks the anchor: the board layout walks outward from it, which
      // keeps every already-placed tile where it is as the line grows.
      entry = { id: tile.id, a: tile.a, b: tile.b, flipped: false, by: seat, start: true };
      state.board.line = [entry];
      state.board.leftEnd = tile.a;
      state.board.rightEnd = tile.b;
      return entry;
    }

    if (end === 'right') {
      const need = state.board.rightEnd;
      const flipped = tile.a !== need;
      entry = { id: tile.id, a: tile.a, b: tile.b, flipped, by: seat };
      state.board.line.push(entry);
      state.board.rightEnd = flipped ? tile.a : tile.b;
      return entry;
    }

    const need = state.board.leftEnd;
    const flipped = tile.b !== need;
    entry = { id: tile.id, a: tile.a, b: tile.b, flipped, by: seat };
    state.board.line.unshift(entry);
    state.board.leftEnd = flipped ? tile.b : tile.a;
    return entry;
  }

  /**
   * Apply an action for the seat to move.
   * @param {{type: 'play', tileId: number, end: string}|{type: 'pass'}} action
   * @returns {object[]} Events produced, or `[]` when the action was rejected.
   */
  function apply(action) {
    if (state.phase !== 'playing') return [];
    const seat = state.turn;

    if (action?.type === 'pass') {
      if (!mustPass(seat)) return [];
      state.consecutivePasses += 1;
      const events = [{ type: 'passed', seat, passes: state.consecutivePasses }];

      if (state.consecutivePasses >= BLOCKED_PASSES) {
        // Trancado. Lower pip total takes the hand; a tie scores nothing.
        const totals = [0, 1].map((team) => {
          let sum = 0;
          for (let s = 0; s < PLAYERS; s += 1) if (teamOf(s) === team) sum += pipTotal(state.hands[s]);
          return sum;
        });
        if (totals[0] === totals[1]) {
          state.phase = 'handEnd';
          state.result = {
            type: 'tranca-tie',
            winningSeat: null,
            winningTeam: null,
            points: 0,
            scores: [state.scores[0], state.scores[1]],
            matchOver: false,
          };
          events.push({ type: 'handEnd', result: { ...state.result } });
        } else {
          const winningTeam = totals[0] < totals[1] ? 0 : 1;
          const winningSeat = winningTeam; // the lower seat on that team opens next
          events.push(finishHand('tranca', winningSeat));
        }
        return events;
      }

      state.turn = (seat + PLAYERS - 1) % PLAYERS; // clockwise: the seat to your right is next
      return events;
    }

    if (action?.type !== 'play') return [];

    const legal = legalMoves(seat);
    const chosen = legal.find((m) => m.tileId === action.tileId && m.end === action.end);
    if (!chosen) return [];

    const idx = state.hands[seat].findIndex((t) => t.id === action.tileId);
    const [tile] = state.hands[seat].splice(idx, 1);
    const entry = place(seat, tile, action.end);

    state.consecutivePasses = 0;
    state.lastPlayerToPlay = seat;
    if (state.forcedTile !== null) state.forcedTile = null;

    const events = [
      {
        type: 'played',
        seat,
        tile: { ...tile },
        end: action.end,
        leftEnd: state.board.leftEnd,
        rightEnd: state.board.rightEnd,
        entry: { ...entry },
      },
    ];

    if (state.hands[seat].length === 0) {
      events.push(finishHand('domino', seat));
      return events;
    }

    state.turn = (seat + PLAYERS - 1) % PLAYERS; // clockwise: the seat to your right is next
    return events;
  }

  state.phase = 'idle';

  return {
    state,
    start,
    nextHand,
    view,
    legalMoves,
    mustPass,
    apply,
    get targetScore() {
      return targetScore;
    },
  };
}
