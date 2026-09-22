// Señas: the calls partners make across the table.
//
// A signal is a *claim*, not a fact. When you call "pásame" you are telling your
// partner you are void in the suits showing, and the partner plays as though you
// are — which is exactly how it works at a real table, bluff included. Nothing
// here verifies a claim against the hand that made it, and nothing should.

// --- Tuning constants ---------------------------------------------------
export const SIGNAL_LIFETIME = 4.5; // seconds a bubble stays up
export const SIGNAL_COOLDOWN = 3.0; // minimum gap between your own calls
// -------------------------------------------------------------------------

/** The four calls, in the order they appear in the sheet. */
export const SIGNALS = Object.freeze([
  Object.freeze({
    id: 'echate',
    label: '¡Échate!',
    hint: 'Keep it coming, I can follow',
    bubble: 0xffd34d,
  }),
  Object.freeze({
    id: 'pasame',
    label: 'Pásame',
    hint: 'I am void here — do not leave me this suit',
    bubble: 0x7ec8ff,
  }),
  Object.freeze({
    id: 'tranca',
    label: 'Tranca',
    hint: 'Let us block the hand',
    bubble: 0xff9a6b,
  }),
  Object.freeze({
    id: 'wepa',
    label: '¡Wepa!',
    hint: 'Celebration',
    bubble: 0x9df0b6,
  }),
]);

const BY_ID = new Map(SIGNALS.map((s) => [s.id, s]));

/** Look up a signal definition. */
export function signalById(id) {
  return BY_ID.get(id) ?? null;
}
