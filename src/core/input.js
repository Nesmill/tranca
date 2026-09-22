// Action-based input for a touch-first phone game.
//
// One pointer surface serves two purposes: a short, near-stationary press is a
// tap (select a tile, hit a button) while a press that travels is a head turn.
// Both a real finger and the demo bot funnel through `inject`/`injectTap`, so a
// scripted run is indistinguishable from a human one.

// --- Tuning constants ---------------------------------------------------
const TAP_SLOP_PX = 10; // travel beyond this turns a tap into a drag
const TAP_MAX_MS = 600;
// -------------------------------------------------------------------------

/**
 * Build the input surface.
 * @param {HTMLElement} element Element that receives pointer events.
 * @returns {object} Input exposing action queries, pointer state and injectors.
 */
export function createInput(element) {
  const held = new Set();
  const pressed = new Set();
  const released = new Set();
  const taps = [];

  const pointer = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    active: false,
    dragging: false,
    id: null,
  };

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let travel = 0;

  const markDown = (action) => {
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  };
  const markUp = (action) => {
    if (held.has(action)) released.add(action);
    held.delete(action);
  };

  const onPointerDown = (e) => {
    if (pointer.id !== null) return;
    pointer.id = e.pointerId;
    pointer.active = true;
    pointer.dragging = false;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    startX = e.clientX;
    startY = e.clientY;
    startTime = e.timeStamp;
    travel = 0;
    element.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.dx += dx;
    pointer.dy += dy;
    travel = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (travel > TAP_SLOP_PX) pointer.dragging = true;
  };

  const endPointer = (e, cancelled) => {
    if (e.pointerId !== pointer.id) return;
    const isTap =
      !cancelled && travel <= TAP_SLOP_PX && e.timeStamp - startTime <= TAP_MAX_MS;
    if (isTap) taps.push({ x: e.clientX, y: e.clientY });
    pointer.id = null;
    pointer.active = false;
    pointer.dragging = false;
  };

  const onPointerDownBound = (e) => onPointerDown(e);
  const onPointerMoveBound = (e) => onPointerMove(e);
  const onPointerUpBound = (e) => endPointer(e, false);
  const onPointerCancelBound = (e) => endPointer(e, true);
  const onContextMenu = (e) => e.preventDefault();

  element.addEventListener('pointerdown', onPointerDownBound);
  element.addEventListener('pointermove', onPointerMoveBound);
  element.addEventListener('pointerup', onPointerUpBound);
  element.addEventListener('pointercancel', onPointerCancelBound);
  element.addEventListener('contextmenu', onContextMenu);

  // Touch scrolling would fight the head-look drag.
  element.style.touchAction = 'none';

  return {
    pointer,
    /** True while the action is held. */
    isDown: (action) => held.has(action),
    /** True on the frame the action went down. */
    wasPressed: (action) => pressed.has(action),
    /** True on the frame the action went up. */
    wasReleased: (action) => released.has(action),
    /** Drain the taps recorded since the last call; positions are client pixels. */
    takeTaps() {
      if (taps.length === 0) return [];
      const out = taps.slice();
      taps.length = 0;
      return out;
    },
    /** Peek at the pending taps without consuming them. */
    get pendingTaps() {
      return taps.length;
    },
    /** Demo-bot driver for held actions; takes the same path as a real press. */
    inject(action, downState) {
      if (downState) markDown(action);
      else markUp(action);
    },
    /** Demo-bot driver for taps. */
    injectTap(x, y) {
      taps.push({ x, y });
    },
    /** Clear per-frame edge state. Called by the engine at the end of a step. */
    endFrame() {
      pressed.clear();
      released.clear();
      pointer.dx = 0;
      pointer.dy = 0;
    },
    dispose() {
      element.removeEventListener('pointerdown', onPointerDownBound);
      element.removeEventListener('pointermove', onPointerMoveBound);
      element.removeEventListener('pointerup', onPointerUpBound);
      element.removeEventListener('pointercancel', onPointerCancelBound);
      element.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
