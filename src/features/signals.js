// Señas at the table: the sheet of calls, and the bubbles that float over
// whoever just made one.
//
// Bubbles are sprites in the scene rather than DOM pinned to a projected point:
// that keeps them correctly occluded by the table, costs no per-frame camera
// maths, and needs no resize handling.
//
// The SEÑAS chip itself lives in the hand strip's action row. The two modules
// stay decoupled by talking through a data attribute on the HUD rather than
// through each other.

import * as THREE from 'three';
import { SEATS } from '../core/layout.js';
import { SIGNALS, SIGNAL_LIFETIME, signalById } from '../core/signals.js';

// --- Tuning constants ---------------------------------------------------
const STYLE_ID = 'senas-style';
const BUBBLE_PX = 256;
const BUBBLE_RISE = 0.14; // how far above the head a bubble floats
const BUBBLE_W = 0.44;
const BUBBLE_H = 0.22;
const BUBBLE_FADE = 0.7; // seconds of fade at the end of a call's life
// Sits just clear of the head — a seat's head top is around 1.19 m — so the
// bubble reads as spoken by that player and does not climb into the score bar.
const BUBBLE_REST_Y = 1.36;
// Your own seña gets no bubble: seat 0 is behind the camera. It surfaces as a
// brief toast over the hand strip instead, so a call you made is never silent.
const TOAST_SECONDS = 1.6;
// -------------------------------------------------------------------------

const CSS = `
#senas-sheet {
  position: absolute; left: 8px; right: 8px; bottom: 140px;
  display: none; flex-direction: column; gap: 6px;
  padding: 10px; border-radius: 14px;
  background: rgba(14,11,8,0.96); border: 1px solid rgba(240,230,210,0.16);
  box-shadow: 0 8px 30px rgba(0,0,0,0.6);
}
#senas-sheet.is-open { display: flex; }
.sn-title {
  font: 700 10px/1 system-ui, sans-serif; letter-spacing: 0.18em;
  text-transform: uppercase; color: #cdbf9f; padding: 0 2px 2px;
}
.sn-call {
  pointer-events: auto; cursor: pointer; text-align: left;
  display: flex; flex-direction: column; gap: 1px;
  padding: 9px 12px; border-radius: 10px; border: 0;
  background: rgba(240,230,210,0.09); color: #f4ead8;
  font-family: system-ui, sans-serif;
}
.sn-call:active { background: rgba(240,198,90,0.22); }
.sn-call b { font-size: 14px; }
.sn-call span { font-size: 11px; color: #b0a48c; }
#sena-toast {
  position: absolute; left: 50%; bottom: 168px;
  transform: translateX(-50%) translateY(6px);
  padding: 8px 16px; border-radius: 999px; pointer-events: none;
  background: rgba(14,11,8,0.92); border: 1px solid rgba(240,198,90,0.5);
  box-shadow: 0 6px 18px rgba(0,0,0,0.5);
  font: 700 12px/1 system-ui, sans-serif; letter-spacing: 0.1em;
  text-transform: uppercase; color: #f0c65a; white-space: nowrap;
  opacity: 0; transition: opacity 180ms ease, transform 180ms ease;
}
#sena-toast.is-on { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

export default {
  name: 'signals',

  init(ctx) {
    this.ctx = ctx;

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.sheet = document.createElement('div');
    this.sheet.id = 'senas-sheet';
    this.sheet.innerHTML =
      '<div class="sn-title">Señas</div>' +
      SIGNALS.map(
        (s) =>
          `<button class="sn-call" type="button" data-id="${s.id}">` +
          `<b>${s.label}</b><span>${s.hint}</span></button>`,
      ).join('');
    ctx.hud.appendChild(this.sheet);

    this.onSheetClick = (e) => {
      const btn = e.target.closest('.sn-call');
      if (!btn) return;
      ctx.game.call(btn.dataset.id);
      this.close();
    };
    this.sheet.addEventListener('click', this.onSheetClick);

    // Your own seña's confirmation: a brief toast above the hand strip.
    this.toast = document.createElement('div');
    this.toast.id = 'sena-toast';
    ctx.hud.appendChild(this.toast);
    this.toastLeft = 0;

    // The strip owns the chip; it only has to carry the attribute.
    this.onHudClick = (e) => {
      const chip = e.target.closest('[data-action="senas"]');
      if (!chip) return;
      this.toggle();
    };
    ctx.hud.addEventListener('click', this.onHudClick);

    this.group = new THREE.Group();
    this.group.name = 'senas';
    ctx.scene.add(this.group);

    this.disposables = [];
    this.bubbles = new Array(SEATS.length).fill(null);
    this.seen = new Array(SEATS.length).fill(null);

    // QA hook: the sheet only opens on a tap otherwise, which a headless
    // capture cannot deliver.
    if (ctx.params.senas === '1') this.open();
  },

  open() {
    this.sheet.classList.add('is-open');
  },
  toggle() {
    this.sheet.classList.toggle('is-open');
  },
  close() {
    this.sheet.classList.remove('is-open');
  },

  /** Build a rounded call bubble in the signal's colour. */
  makeBubble(signal) {
    const canvas = document.createElement('canvas');
    canvas.width = BUBBLE_PX;
    canvas.height = BUBBLE_PX / 2;
    const g = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const hex = `#${signal.bubble.toString(16).padStart(6, '0')}`;

    const r = h * 0.36;
    g.fillStyle = 'rgba(14,11,8,0.92)';
    g.beginPath();
    g.moveTo(r, 0);
    g.arcTo(w, 0, w, h, r);
    g.arcTo(w, h, 0, h, r);
    g.arcTo(0, h, 0, 0, r);
    g.arcTo(0, 0, w, 0, r);
    g.closePath();
    g.fill();
    g.strokeStyle = hex;
    g.lineWidth = 8;
    g.stroke();

    g.fillStyle = hex;
    g.font = `bold ${Math.round(h * 0.4)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(signal.label, w / 2, h / 2 + 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    this.disposables.push(tex, mat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(BUBBLE_W, BUBBLE_H, 1);
    sprite.visible = false;
    this.group.add(sprite);
    return sprite;
  },

  update(dt) {
    const game = this.ctx.game;

    // QA hook: `?call=2:pasame` re-issues a call every step so the bubble can be
    // photographed. See studio/TOOLS.md.
    const forced = this.ctx.params.call;
    if (forced) {
      const [seatRaw, id] = forced.split(':');
      const seat = Number.parseInt(seatRaw, 10);
      if (Number.isInteger(seat) && seat >= 0 && seat < SEATS.length) game.forceCall(seat, id);
    }

    // Seat 0's own call: no bubble (the seat is behind the camera), so it gets
    // the toast instead. Seen the same way the other seats' bubbles are seen.
    const own = game.calls[0];
    if (own !== this.seen[0]) {
      this.seen[0] = own;
      if (own) {
        const signal = signalById(own.id);
        if (signal) {
          this.toast.textContent = `Seña — ${signal.label}`;
          this.toast.classList.add('is-on');
          this.toastLeft = TOAST_SECONDS;
        }
      }
    }
    if (this.toastLeft > 0) {
      this.toastLeft = Math.max(0, this.toastLeft - dt);
      if (this.toastLeft === 0) this.toast.classList.remove('is-on');
    }

    for (let seat = 1; seat < SEATS.length; seat += 1) {
      const call = game.calls[seat];
      if (call !== this.seen[seat]) {
        this.seen[seat] = call;
        if (call) {
          const signal = signalById(call.id);
          if (signal) {
            this.bubbles[seat]?.removeFromParent();
            const sprite = this.makeBubble(signal);
            const pos = SEATS[seat].pos;
            sprite.position.set(pos[0], BUBBLE_REST_Y + BUBBLE_RISE, pos[2]);
            this.bubbles[seat] = sprite;
          }
        }
      }

      const bubble = this.bubbles[seat];
      if (!bubble) continue;

      const active = game.callFor(seat);
      if (!active) {
        bubble.visible = false;
        continue;
      }
      const remaining = SIGNAL_LIFETIME - (game.clock - active.at);
      bubble.visible = true;
      bubble.material.opacity = Math.min(1, Math.max(0, remaining / BUBBLE_FADE));
      // A small rise as it fades, so a call reads as spoken and gone.
      bubble.position.y = BUBBLE_REST_Y + BUBBLE_RISE + Math.max(0, 1 - remaining) * 0.04;
    }
  },

  dispose() {
    this.sheet?.removeEventListener('click', this.onSheetClick);
    this.ctx?.hud?.removeEventListener('click', this.onHudClick);
    this.sheet?.remove();
    this.toast?.remove();
    this.style?.remove();
    this.group?.parent?.remove(this.group);
    for (const o of this.disposables ?? []) o.dispose?.();
    this.disposables = [];
    this.bubbles = [];
    this.seen = [];
    this.ctx = null;
  },
};
