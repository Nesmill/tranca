// Seeded RNG. Every gameplay-random decision goes through here so that a
// `?seed=` value reproduces a whole match exactly.

// --- Tuning constants ---------------------------------------------------
const DEFAULT_SEED = 1337;
// -------------------------------------------------------------------------

/**
 * Build a deterministic random source.
 * @param {number} [seed] Integer seed; the same seed replays the same match.
 * @returns {{next: () => number, range: (a: number, b: number) => number,
 *   int: (a: number, b: number) => number, pick: <T>(arr: T[]) => T,
 *   shuffle: <T>(arr: T[]) => T[]}} Random source; `int` is inclusive on both ends.
 */
export function createRng(seed = DEFAULT_SEED) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}
