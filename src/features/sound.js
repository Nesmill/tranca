// Sound: ties the colmado's audio to what actually happens at the table.
//
// Nothing plays until a real gesture, because browsers suspend an AudioContext
// created without one. Until then the game is silently playable, which is the
// correct failure mode on a phone.

import { SEATS } from '../core/layout.js';

// --- Tuning constants ---------------------------------------------------
const STYLE_ID = 'sound-style';
const CLACK_BASE = 0.55;
const CLACK_PER_PIP = 0.05; // a heavier tile lands harder
const PASS_KNOCK = 0.7;
// -------------------------------------------------------------------------

const CSS = `
#sound-toggle {
  position: absolute; right: 8px; top: calc(74px + env(safe-area-inset-top));
  width: 40px; height: 40px; padding: 0;
  display: grid; place-items: center; cursor: pointer;
  border-radius: 50%; border: 1px solid rgba(240,230,210,0.18);
  background: rgba(14,11,8,0.72); color: #e8dcc2;
  font: 16px/1 system-ui, sans-serif;
  transition: background 160ms ease, color 160ms ease;
}
#sound-toggle.is-on { color: #f0c65a; border-color: rgba(240,198,90,0.5); }
#sound-toggle.is-off { color: #7d7466; }
`;

export default {
  name: 'sound',

  init(ctx) {
    this.ctx = ctx;
    this.lastEvent = null;
    this.seenCalls = [null, null, null, null];
    this.started = false;
    this.muted = false;

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.button = document.createElement('button');
    this.button.id = 'sound-toggle';
    this.button.type = 'button';
    this.button.className = 'is-off';
    this.button.textContent = '♪';
    this.button.title = 'Sonido';
    ctx.hud.appendChild(this.button);

    // A real gesture is the only thing that can start audio.
    this.onGesture = () => {
      this.start();
      globalThis.removeEventListener('pointerdown', this.onGesture);
    };
    globalThis.addEventListener('pointerdown', this.onGesture);

    this.onToggle = (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      ctx.audio.setVolume(this.muted ? 0 : 1);
      if (this.muted) ctx.audio.stopAmbience();
      else this.start();
      this.refreshButton();
    };
    this.button.addEventListener('click', this.onToggle);

    // QA hook: with no gesture available headlessly, the context stays
    // suspended either way, but this at least exercises the scheduler.
    if (ctx.params.audio === '1') this.start();
  },

  start() {
    this.started = true;
    this.ctx.audio.unlock();
    this.ctx.audio.startAmbience();
    this.refreshButton();
  },

  refreshButton() {
    const on = this.started && !this.muted;
    // Colour carries the state; a combined glyph for "muted" renders
    // inconsistently across platforms, so the letter itself never changes.
    this.button.classList.toggle('is-on', on);
    this.button.classList.toggle('is-off', !on);
  },

  update() {
    const audio = this.ctx.audio;
    const game = this.ctx.game;

    const ev = game.lastEvent;
    if (ev !== this.lastEvent) {
      this.lastEvent = ev;
      if (ev && this.started && !this.muted) {
        if (ev.type === 'dealt') {
          audio.shuffle(1);
        } else if (ev.type === 'played') {
          // Only your own play is loud; the others are across the table.
          const pips = ev.tile.a + ev.tile.b;
          const near = ev.seat === 0 ? 1 : ev.seat === 2 ? 0.75 : 0.55;
          audio.clack((CLACK_BASE + pips * CLACK_PER_PIP) * near);
        } else if (ev.type === 'passed') {
          audio.knock();
        } else if (ev.type === 'handEnd') {
          audio.knell();
        }
      }
    }

    // A seña gets a knock, so a call is heard and not only seen.
    if (this.started && !this.muted) {
      for (let seat = 0; seat < SEATS.length; seat += 1) {
        const call = game.calls[seat];
        if (call !== this.seenCalls[seat]) {
          this.seenCalls[seat] = call;
          if (call) audio.knock();
        }
      }
    }
  },

  dispose() {
    globalThis.removeEventListener('pointerdown', this.onGesture);
    this.button?.removeEventListener('click', this.onToggle);
    this.ctx?.audio?.stopAmbience();
    this.button?.remove();
    this.style?.remove();
    this.ctx = null;
  },
};
