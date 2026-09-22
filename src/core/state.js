// Named state machine for the match. Transitions are explicit: an illegal
// source state is a silent no-op, which keeps URL-forced states safe.

// --- Tuning constants ---------------------------------------------------
/** Legal edges as `from -> to[]`. A state absent here cannot be entered by name. */
const TRANSITIONS = {
  BOOT: ['MENU', 'DEALING'],
  MENU: ['DEALING'],
  DEALING: ['PLAYING'],
  PLAYING: ['HAND_END'],
  HAND_END: ['DEALING', 'MATCH_END'],
  MATCH_END: ['MENU', 'DEALING'],
};
// -------------------------------------------------------------------------

/**
 * Build the match state machine.
 * @param {string} [initial] Starting state; unknown names fall back to BOOT.
 * @returns {object} Machine exposing `name`, `time`, `is`, `onEnter`, `onExit`
 *   and `go`.
 */
export function createState(initial = 'BOOT') {
  let current = TRANSITIONS[initial] ? initial : 'BOOT';
  let elapsed = 0;
  const enterHooks = new Map();
  const exitHooks = new Map();

  const fire = (map, name) => {
    const list = map.get(name);
    if (!list) return;
    for (const fn of [...list]) fn(name);
  };

  const machine = {
    get name() {
      return current;
    },
    get time() {
      return elapsed;
    },
    is(name) {
      return current === name;
    },
    onEnter(name, fn) {
      if (!enterHooks.has(name)) enterHooks.set(name, new Set());
      enterHooks.get(name).add(fn);
      return () => enterHooks.get(name)?.delete(fn);
    },
    onExit(name, fn) {
      if (!exitHooks.has(name)) exitHooks.set(name, new Set());
      exitHooks.get(name).add(fn);
      return () => exitHooks.get(name)?.delete(fn);
    },
    /** Move to `name` when the current state allows it; returns whether it moved. */
    go(name) {
      if (name === current) return false;
      if (!(TRANSITIONS[current] ?? []).includes(name)) return false;
      fire(exitHooks, current);
      current = name;
      elapsed = 0;
      fire(enterHooks, name);
      return true;
    },
    /** Advance the state clock. Called by the engine once per fixed step. */
    tick(dt) {
      elapsed += dt;
    },
  };

  return machine;
}
