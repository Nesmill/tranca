// The player's hand: a readable strip of face-up tiles along the bottom.
//
// This is the interaction surface, not the 3D hand. Tapping a tile picks it up;
// the two open ends then light on the table and an action chip commits the play.
// Keeping selection in the DOM means no 3D picking, which on a phone is both
// faster and far more forgiving of a thumb.

import { faceCanvas } from '../core/pips.js';
import { SEATS } from '../core/layout.js';

// --- Tuning constants ---------------------------------------------------
const FACE_W = 112; // backing-store pixels per tile face, drawn at 2x
const FACE_H = 200;
const STYLE_ID = 'hand-strip-style';
// -------------------------------------------------------------------------

const CSS = `
#hand-strip {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; gap: 7px;
  padding: 10px 8px calc(8px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(8,6,4,0.94) 42%, rgba(8,6,4,0));
  pointer-events: none;
}
#hs-status {
  text-align: center; font: 600 12px/1 system-ui, sans-serif;
  letter-spacing: 0.14em; text-transform: uppercase; color: #cdbf9f;
  min-height: 14px;
}
#hs-status.is-you { color: #f0c65a; }
#hs-actions { display: flex; gap: 8px; justify-content: center; min-height: 36px; }
#hs-tiles { display: flex; gap: 4px; justify-content: center; align-items: flex-end; }
.hs-tile {
  pointer-events: auto; background: none; border: 0; padding: 0;
  width: 13%; max-width: 58px; cursor: pointer;
  transition: transform 130ms cubic-bezier(.2,.8,.3,1), filter 130ms ease;
  filter: drop-shadow(0 3px 4px rgba(0,0,0,0.55));
}
.hs-tile canvas { display: block; width: 100%; height: auto; border-radius: 4px; }
.hs-tile.is-selected {
  transform: translateY(-16px);
  filter: drop-shadow(0 0 12px rgba(255,211,77,0.95));
}
.hs-tile.is-dim { filter: brightness(0.5) drop-shadow(0 3px 4px rgba(0,0,0,0.55)); }
.hs-tile:disabled { cursor: default; }
.hs-action {
  pointer-events: auto; cursor: pointer; border: 0; border-radius: 999px;
  padding: 10px 18px; font: 700 12px/1 system-ui, sans-serif;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #1b1409; background: #f0c65a;
}
.hs-action.ghost { background: rgba(240,230,210,0.18); color: #f0e6d2; }
`;

export default {
  name: 'hand-strip',

  init(ctx) {
    this.ctx = ctx;

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = document.createElement('div');
    this.root.id = 'hand-strip';
    this.root.innerHTML =
      '<div id="hs-status"></div><div id="hs-actions"></div><div id="hs-tiles"></div>';
    ctx.hud.appendChild(this.root);

    this.statusEl = this.root.querySelector('#hs-status');
    this.actionsEl = this.root.querySelector('#hs-actions');
    this.tilesEl = this.root.querySelector('#hs-tiles');

    this.handSig = '';
    this.stateSig = '';
    this.tileButtons = new Map();
    // One delegated listener rather than one per tile; the strip is rebuilt
    // whenever the hand changes.
    this.onTileClick = (e) => {
      const btn = e.target.closest('.hs-tile');
      if (!btn || btn.disabled) return;
      ctx.game.select(Number.parseInt(btn.dataset.tileId, 10));
    };
    this.tilesEl.addEventListener('click', this.onTileClick);
  },

  /** Rebuild the tile buttons when the hand itself changes. */
  rebuildTiles(hand) {
    this.tilesEl.replaceChildren();
    this.tileButtons.clear();
    for (const tile of hand) {
      const btn = document.createElement('button');
      btn.className = 'hs-tile';
      btn.dataset.tileId = String(tile.id);
      btn.type = 'button';
      btn.appendChild(faceCanvas(tile.a, tile.b, FACE_W, FACE_H, { vertical: true }));
      this.tilesEl.appendChild(btn);
      this.tileButtons.set(tile.id, btn);
    }
  },

  /** Refresh selection, dimming and the action chips. */
  refreshState() {
    const game = this.ctx.game;
    const view = game.view(0);
    const mine = game.playerToMove();
    const selected = game.selected;
    const ends = game.selectedEnds();

    for (const [id, btn] of this.tileButtons) {
      const playable = view.legal.some((m) => m.tileId === id);
      btn.classList.toggle('is-selected', id === selected);
      btn.classList.toggle('is-dim', mine && !playable);
      btn.disabled = !mine;
    }

    // Status line: whose turn it is.
    if (view.phase === 'matchEnd') {
      this.statusEl.textContent = 'Fin de la partida';
      this.statusEl.classList.remove('is-you');
    } else if (view.phase === 'handEnd') {
      this.statusEl.textContent = 'Mano terminada';
      this.statusEl.classList.remove('is-you');
    } else if (mine) {
      this.statusEl.textContent = selected === null ? 'Tu turno — escoge una ficha' : 'Escoge dónde';
      this.statusEl.classList.add('is-you');
    } else {
      const seat = SEATS[view.turn];
      this.statusEl.textContent = `Turno de ${seat ? seat.label : '...'}`;
      this.statusEl.classList.remove('is-you');
    }

    // Action chips.
    this.actionsEl.replaceChildren();
    const chip = (label, ghost, onClick, action) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = ghost ? 'hs-action ghost' : 'hs-action';
      b.textContent = label;
      if (action) b.dataset.action = action;
      b.addEventListener('click', onClick);
      this.actionsEl.appendChild(b);
      return b;
    };

    if (game.playerMustPass()) {
      chip('Pasar', false, () => game.playPass());
    } else if (selected !== null) {
      if (ends.length === 0) {
        chip('No se puede', true, () => game.clearSelection());
      } else if (ends.length === 1) {
        const label = ends[0] === 'left' ? '◀ Jugar' : ends[0] === 'right' ? 'Jugar ▶' : 'Jugar';
        chip(label, false, () => game.playSelected(ends[0]));
      } else {
        chip('◀ Izquierda', false, () => game.playSelected('left'));
        chip('Derecha ▶', false, () => game.playSelected('right'));
      }
    }

    // PISTA: names a good play rather than a legal one. It lifts the tile the
    // table itself would play, and the gold rings then show where it can go.
    if (mine && selected === null && !game.playerMustPass()) {
      chip('Pista', true, () => {
        const hint = game.hint();
        if (!hint) return;
        game.select(hint.tileId);
        this.ctx.audio.blip(880);
      }, 'pista');
    }

    // Señas are always available on your turn. The signals module listens for
    // the data attribute rather than being wired in here.
    if (mine || selected !== null) {
      chip('Señas', true, () => {}, 'senas');
    }
  },

  update() {
    const view = this.ctx.game.view(0);
    const handSig = view.myHand.map((t) => t.id).join(',');
    if (handSig !== this.handSig) {
      this.handSig = handSig;
      this.rebuildTiles(view.myHand);
      this.stateSig = '';
    }

    // The signature has to name every legal move, not just count them: when the
    // open ends change but the number of playable tiles happens to stay the
    // same, a count would leave the dimming and the action chips stale.
    const legalSig = view.legal
      .map((m) => `${m.tileId}:${m.end}`)
      .sort()
      .join(',');
    const stateSig = [
      view.turn,
      view.phase,
      this.ctx.game.selected,
      legalSig,
      this.ctx.game.playerMustPass() ? 1 : 0,
    ].join('|');
    if (stateSig !== this.stateSig) {
      this.stateSig = stateSig;
      this.refreshState();
      // Only speak up when the DOM and the view disagree; routine state is
      // silent so the overlay stays useful.
      const domIds = [...this.tileButtons.keys()].join(',');
      const handIds = view.myHand.map((t) => t.id).join(',');
      if (domIds !== handIds) {
        this.ctx.log(`strip MISMATCH dom[${domIds}] hand[${handIds}]`);
      }
    }
  },

  dispose() {
    this.tilesEl?.removeEventListener('click', this.onTileClick);
    this.root?.remove();
    this.style?.remove();
    this.tileButtons?.clear();
    this.ctx = null;
  },
};
