// Match session: owns the rules engine and drives the three AI seats with
// human-feeling pacing. No three.js, no DOM — this is the seam a networked
// seat will later plug into, which is why every decision goes through a
// seat-filtered view rather than reading the match directly.

import { createMatch, teamOf, PLAYERS } from './rules.js';
import { SIGNAL_LIFETIME, SIGNAL_COOLDOWN, signalById } from './signals.js';

// --- Tuning constants ---------------------------------------------------
const THINK_MIN = 0.7; // seconds a bot appears to consider a play
const THINK_MAX = 2.4;
const OPENING_THINK = 1.2; // the double-six holder sets it down without much pause
const HAND_END_PAUSE = 5.0; // beat on the scoring card before the next hand
const SEAT0_THINK = 1.1; // demo only: how fast the player's own seat auto-plays
// -------------------------------------------------------------------------

/**
 * Build a match session.
 * @param {object} options
 * @param {object} options.rng Seeded random source.
 * @param {number} [options.targetScore] Score that ends the match.
 * @param {boolean} [options.autoPlaySeat0] Let the bot play the player's seat too.
 * @returns {object} Session exposing `update`, `view`, `boardLine`, `interrupt`.
 */
export function createGame({ rng, targetScore = 200, autoPlaySeat0 = false }) {
  const match = createMatch({ shuffle: (arr) => rng.shuffle(arr), targetScore });
  const bots = new Set([1, 2, 3]);
  if (autoPlaySeat0) bots.add(0);

  let timer = 0;
  let started = false;
  let lastEvent = null;
  let ticks = 0;
  // Which tile the player has picked up. Presentation state, but it belongs
  // here because both the hand strip and the board need to agree on it.
  let selectedTileId = null;

  // Per-seat suits a player has proved they cannot follow, rebuilt every hand.
  //
  // This is sound rather than a guess: Dominican dominoes deals the whole set
  // and has no boneyard, so a player who passes can never later acquire a tile.
  // A pass is therefore permanent proof of void in both open suits, and it is
  // public information that any seat could work out for itself.
  const voids = [new Set(), new Set(), new Set(), new Set()];

  // The last seña each seat made, and when. Claims, not facts: see signals.js.
  const calls = [null, null, null, null];
  let clock = 0;

  const thinkTime = (seat) => {
    if (match.state.board.line.length === 0) return OPENING_THINK;
    if (seat === 0) return SEAT0_THINK;
    return THINK_MIN + rng.next() * (THINK_MAX - THINK_MIN);
  };

  /**
   * Choose a move for a seat from its filtered view alone.
   *
   * Plays the partnership, not just the hand: because a pass proves a player is
   * void in both open suits, the bot can steer the line toward suits the
   * opposition cannot follow and away from suits its partner cannot.
   */
  function chooseMove(seat) {
    const view = match.view(seat);
    if (view.legal.length === 0) return { type: 'pass' };

    const byId = new Map(view.myHand.map((t) => [t.id, t]));
    let best = null;
    let bestScore = -Infinity;
    for (const move of view.legal) {
      const tile = byId.get(move.tileId);
      if (!tile) continue;
      const score = scoreMove(view, tile, move.end, seat);
      // On a tie prefer the right end: legal order lists left first, so a plain
      // `>` comparison sent every coin-flip play leftward and the line crept.
      const better =
        score > bestScore || (score === bestScore && move.end === 'right' && best?.end !== 'right');
      if (better) {
        bestScore = score;
        best = move;
      }
    }
    return best ? { type: 'play', tileId: best.tileId, end: best.end } : { type: 'pass' };
  }

  /** The pip of `tile` that does not meet the end it is played against. */
  function freePip(tile, endValue) {
    if (tile.a === tile.b) return tile.a;
    return tile.a === endValue ? tile.b : tile.a;
  }

  /** The two open ends a move would leave behind. */
  function endsAfter(view, tile, end) {
    const { leftEnd, rightEnd } = view.board;
    if (end === 'first') return [tile.a, tile.b];
    if (end === 'left') return [freePip(tile, leftEnd), rightEnd];
    return [leftEnd, freePip(tile, rightEnd)];
  }

  /**
   * Score a move for a seat. Positive is good for that seat's team.
   *
   * Reading the ends a move leaves is what separates partnership play from
   * shedding: ending on a suit an opponent has proved they are void in strands
   * them, while ending on a suit your own partner cannot follow strands them
   * instead.
   */
  function scoreMove(view, tile, end, seat) {
    const partner = (seat + 2) % PLAYERS;
    const opponents = [(seat + 1) % PLAYERS, (seat + 3) % PLAYERS];
    const ends = endsAfter(view, tile, end);
    let score = 0;

    for (const value of ends) {
      for (const opp of opponents) if (voids[opp].has(value)) score += 8;
      if (voids[partner].has(value)) score -= 7;
    }

    // A "pásame" is the partner telling us they are void in the suits showing.
    // Taken at face value, exactly as a real partner would take it.
    const call = calls[partner];
    if (call && clock - call.at < SIGNAL_LIFETIME) {
      if (call.id === 'pasame') {
        const showing = [view.board.leftEnd, view.board.rightEnd];
        for (const value of ends) {
          if (showing.includes(value)) score -= 6;
        }
      } else if (call.id === 'tranca') {
        // Blocking: hold the line short and cheap rather than run it out.
        score -= (tile.a + tile.b) * 0.5;
      } else if (call.id === 'echate') {
        // Told to keep it coming: favour shedding and pushing the line on.
        score += (tile.a + tile.b) * 0.5;
      }
    }

    // Shed weight while there is a choice about it, but hold doubles back.
    score += (tile.a + tile.b) * 0.7;
    if (tile.a === tile.b) score -= 2.5;
    return score;
  }

  /** Make a seña on a seat's behalf. Returns the call, or null if it was too soon. */
  function sendSignal(seat, id) {
    if (!signalById(id)) return null;
    const previous = calls[seat];
    if (seat === 0 && previous && clock - previous.at < SIGNAL_COOLDOWN) return null;
    const call = { id, at: clock };
    calls[seat] = call;
    return call;
  }

  /** Fold a batch of rules events into the public knowledge each seat holds. */
  function noteEvents(events) {
    for (const ev of events) {
      if (ev.type === 'dealt') {
        for (const set of voids) set.clear();
      } else if (ev.type === 'passed') {
        // Both open ends, because a player passes only when neither can be met.
        const { leftEnd, rightEnd } = match.state.board;
        if (leftEnd !== null) voids[ev.seat].add(leftEnd);
        if (rightEnd !== null) voids[ev.seat].add(rightEnd);
      }
    }
  }

  /** Advance one decision for whoever is to move. */
  function takeTurn() {
    const seat = match.state.turn;
    const events = match.apply(chooseMove(seat));
    if (events.length > 0) lastEvent = events[events.length - 1];
    noteEvents(events);

    // A bot calls out when it has something worth saying: going void, or taking
    // the hand. It never calls on the strength of a hand it cannot see.
    if (events.some((e) => e.type === 'passed')) sendSignal(seat, 'pasame');
    const finished = events.find((e) => e.type === 'handEnd');
    if (finished?.result?.winningSeat !== null && finished?.result?.winningSeat !== undefined) {
      sendSignal(finished.result.winningSeat, 'wepa');
    }

    // Whoever moves next is decided by the rules, but how long to wait is not:
    // a finished hand has to hold on its scoring card, and letting the ordinary
    // think time stand in for that flashes the card past unread.
    if (match.state.phase === 'handEnd') timer = HAND_END_PAUSE;
    else if (match.state.phase === 'playing') timer = thinkTime(match.state.turn);

    ticks += 1;
  }

  return {
    match,
    /** The line of play, for the board renderer. */
    boardLine: () => match.state.board.line,
    /** A seat's filtered view. Presentation must never read another seat's hand. */
    view: (seat) => match.view(seat),
    get phase() {
      return match.state.phase;
    },
    get result() {
      return match.state.result;
    },
    get scores() {
      return match.state.scores;
    },
    get turn() {
      return match.state.turn;
    },
    /** Team of the seat to move. */
    get turnTeam() {
      return teamOf(match.state.turn);
    },
    get lastEvent() {
      return lastEvent;
    },
    get turnsTaken() {
      return ticks;
    },
    /** True when it is the player's turn and they have no legal placement. */
    playerMustPass() {
      return match.state.phase === 'playing' && match.state.turn === 0 && match.mustPass(0);
    },
    /** True when the player is the seat to move. */
    playerToMove() {
      return match.state.phase === 'playing' && match.state.turn === 0;
    },
    /**
     * The play the session recommends for the player, or null when there is
     * nothing to suggest: not the player's turn, or no legal placement.
     *
     * Runs the same partnership scoring the bots use, so a hint names a *good*
     * play rather than a merely legal one — the point of a pista at the table.
     */
    hint() {
      if (!this.playerToMove()) return null;
      const move = chooseMove(0);
      return move.type === 'play' ? move : null;
    },
    get selected() {
      return selectedTileId;
    },
    /** Pick up a tile, or put it back when passed the same id again. */
    select(tileId) {
      if (!this.playerToMove()) return false;
      const owned = match.view(0).myHand.some((t) => t.id === tileId);
      if (!owned) return false;
      selectedTileId = selectedTileId === tileId ? null : tileId;
      return true;
    },
    clearSelection() {
      selectedTileId = null;
    },
    /** Ends the selected tile may legally be played on, e.g. `['left','right']`. */
    selectedEnds() {
      if (selectedTileId === null || !this.playerToMove()) return [];
      return match
        .view(0)
        .legal.filter((m) => m.tileId === selectedTileId)
        .map((m) => m.end);
    },
    /** Play the selected tile on an end. Returns the events, or [] if illegal. */
    playSelected(end) {
      if (selectedTileId === null) return [];
      const tileId = selectedTileId;
      const events = this.playNow({ type: 'play', tileId, end });
      if (events.length > 0) selectedTileId = null;
      return events;
    },
    /** Pass for the player, when they have no legal placement. */
    playPass() {
      if (!this.playerMustPass()) return [];
      const events = this.playNow({ type: 'pass' });
      if (events.length > 0) selectedTileId = null;
      return events;
    },
    /** Deal the first hand now; `update` does this on the first step otherwise. */
    begin() {
      if (!started) {
        lastEvent = match.start();
        started = true;
        timer = OPENING_THINK;
      }
      return lastEvent;
    },
    /**
     * Advance the match clock.
     * @param {number} dt Seconds since the previous step.
     */
    update(dt) {
      clock += dt;
      if (!started) this.begin();

      if (match.state.phase === 'matchEnd') return;
      if (match.state.phase === 'handEnd') {
        timer -= dt;
        if (timer <= 0) {
          lastEvent = match.nextHand();
          timer = OPENING_THINK;
        }
        return;
      }

      const seat = match.state.turn;
      if (!bots.has(seat)) {
        // Hand control back cleanly: a tile picked up out of turn is stale.
        if (seat !== 0) selectedTileId = null;
        return;
      }

      timer -= dt;
      if (timer > 0) return;
      takeTurn();
    },
    /** Play the current seat immediately, for the player's own seat. */
    playNow(action) {
      const events = match.apply(action);
      if (events.length > 0) {
        lastEvent = events[events.length - 1];
        if (match.state.phase === 'handEnd') timer = HAND_END_PAUSE;
        else if (match.state.phase === 'playing') timer = thinkTime(match.state.turn);
      }
      noteEvents(events);
      return events;
    },
    /** Suits a seat has proved it cannot follow this hand. For tests and debug. */
    voidsFor(seat) {
      return [...voids[seat]];
    },
    /** Make a seña for the player's seat. Returns the call, or null if too soon. */
    call(id) {
      return sendSignal(0, id);
    },
    /**
     * Re-issue a call on every step, ignoring the cooldown.
     * QA only: a bubble lives a few seconds, and a headless capture has no way
     * to tap the sheet at the right moment.
     */
    forceCall(seat, id) {
      if (!signalById(id)) return null;
      calls[seat] = { id, at: clock };
      return calls[seat];
    },
    /** A seat's currently-visible call, or null once it has faded. */
    callFor(seat) {
      const call = calls[seat];
      if (!call) return null;
      return clock - call.at < SIGNAL_LIFETIME ? call : null;
    },
    /** Raw call records, so the UI can notice a new one as it happens. */
    get calls() {
      return calls;
    },
    /** Seconds since the session began; the clock seña lifetimes are measured on. */
    get clock() {
      return clock;
    },
    /** Restart the whole match. */
    restart() {
      started = false;
      ticks = 0;
      lastEvent = null;
      timer = 0;
      this.begin();
    },
  };
}

export { HAND_END_PAUSE, SEAT0_THINK };
