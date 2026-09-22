// The score bar: both teams, the hand number, and whose turn it is.
//
// Sits at the very top of the frame, which is the one band of the portrait
// composition the game itself never needs — the shop is already background.

import { SEATS, TEAM_NAMES } from '../core/layout.js';

// --- Tuning constants ---------------------------------------------------
const STYLE_ID = 'scorebar-style';
// -------------------------------------------------------------------------

const CSS = `
/* A compact centred pill rather than a full-width bar: the corners are left
   free for the opponents' name plates, which float at head height. */
#scorebar {
  position: absolute; left: 50%; top: calc(6px + env(safe-area-inset-top));
  transform: translateX(-50%);
  display: flex; align-items: stretch; gap: 5px;
  padding: 4px 6px; border-radius: 12px;
  background: rgba(14,10,7,0.82);
  border: 1px solid rgba(240,230,210,0.14);
  box-shadow: 0 4px 14px rgba(0,0,0,0.5);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.sb-team {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 0;
  padding: 3px 10px; border-radius: 8px; min-width: 90px;
  background: rgba(240,230,210,0.06);
  border: 1px solid rgba(240,230,210,0.10);
  transition: background 180ms ease, border-color 180ms ease;
}
.sb-team.is-turn {
  background: rgba(240,198,90,0.16);
  border-color: rgba(240,198,90,0.55);
}
.sb-names {
  font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase;
  color: #b8ab90; white-space: nowrap;
}
.sb-team.is-turn .sb-names { color: #f0c65a; }
.sb-score {
  font-size: 19px; font-weight: 700; line-height: 1.1; color: #f4ead8;
  font-variant-numeric: tabular-nums;
}
#sb-hand {
  align-self: center; text-align: center;
  font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
  color: #cdbf9f; padding: 0 6px; line-height: 1.35;
}
#sb-hand b { display: block; font-size: 13px; color: #f4ead8; letter-spacing: 0.04em; }
#sb-target { display: block; font-size: 8px; color: #8e8471; letter-spacing: 0.1em; }

/* Top-left, in the corner the centred score pill leaves free. */
#game-logo {
  position: absolute; left: 10px; top: calc(8px + env(safe-area-inset-top));
  width: 132px; height: auto; pointer-events: none;
  filter: drop-shadow(0 3px 8px rgba(0,0,0,0.65));
}

#round-card {
  position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%) scale(0.94);
  min-width: 250px; max-width: 88vw;
  display: none; flex-direction: column; align-items: center; gap: 3px;
  padding: 18px 22px 16px; border-radius: 16px;
  background: rgba(12,9,7,0.95); border: 1px solid rgba(240,198,90,0.35);
  box-shadow: 0 14px 44px rgba(0,0,0,0.7);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0; transition: opacity 220ms ease, transform 220ms ease;
}
#round-card.is-open { display: flex; opacity: 1; transform: translate(-50%, -50%) scale(1); }
.rc-hand {
  font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #b0a48c;
}
.rc-who { font-size: 22px; font-weight: 700; color: #f4ead8; text-align: center; line-height: 1.15; }
.rc-why { font-size: 12px; color: #cdbf9f; letter-spacing: 0.04em; }
.rc-points { font-size: 30px; font-weight: 700; color: #f0c65a; font-variant-numeric: tabular-nums; }
.rc-rule { width: 100%; height: 1px; background: rgba(240,230,210,0.14); margin: 7px 0 5px; }
.rc-line {
  width: 100%; display: flex; justify-content: space-between; gap: 16px;
  font-size: 13px; color: #e0d5be;
}
.rc-line b { font-variant-numeric: tabular-nums; color: #f4ead8; }
.rc-line.is-won b, .rc-line.is-won span { color: #f0c65a; }
.rc-again {
  pointer-events: auto; cursor: pointer; margin-top: 11px;
  padding: 11px 22px; border: 0; border-radius: 999px;
  font: 700 13px/1 system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase;
  color: #1b1409; background: #f0c65a;
}
`;

export default {
  name: 'hud',

  init(ctx) {
    this.ctx = ctx;

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    this.root = document.createElement('div');
    this.root.id = 'scorebar';
    this.root.innerHTML = `
      <div class="sb-team" data-team="0"><span class="sb-names"></span><span class="sb-score">0</span></div>
      <div id="sb-hand">Mano<b>1</b></div>
      <div class="sb-team" data-team="1"><span class="sb-names"></span><span class="sb-score">0</span></div>`;
    ctx.hud.appendChild(this.root);

    // The card that tells you a hand is over. Without it a hand simply stops:
    // the board clears, the next one is dealt, and nothing was ever said.
    this.card = document.createElement('div');
    this.card.id = 'round-card';
    ctx.hud.appendChild(this.card);

    this.cardSig = '';

    // The generated wordmark, keyed to a transparent PNG by studio/sprites.py.
    // It fails soft: a missing logo leaves a gap, not a broken HUD.
    this.logo = document.createElement('img');
    this.logo.id = 'game-logo';
    this.logo.alt = '';
    this.logo.src = './assets/ui/logo.png';
    this.logo.addEventListener('error', () => {
      this.logo.remove();
      ctx.log('hud: logo.png missing');
    });
    ctx.hud.appendChild(this.logo);

    this.teams = [0, 1].map((t) => {
      const el = this.root.querySelector(`.sb-team[data-team="${t}"]`);
      return { el, names: el.querySelector('.sb-names'), score: el.querySelector('.sb-score') };
    });
    for (let t = 0; t < 2; t += 1) {
      this.teams[t].names.textContent = TEAM_NAMES[t];
    }
    this.handEl = this.root.querySelector('#sb-hand b');
    this.sig = '';
  },

  update() {
    const view = this.ctx.game.view(0);
    const sig = [view.scores[0], view.scores[1], view.handNumber, view.phase, view.turn].join('|');
    if (sig !== this.sig) {
      this.sig = sig;
      this.render();
    }
    this.renderCard();
  },

  /**
   * The hand-over card.
   *
   * Driven by the match phase rather than by the engine's state machine: an
   * engine state can be forced from a URL, but only the match knows whether a
   * hand has actually been won.
   */
  renderCard() {
    const game = this.ctx.game;
    const phase = game.phase;
    const result = game.result;
    const open = (phase === 'handEnd' || phase === 'matchEnd') && Boolean(result);
    if (!open) {
      if (this.cardSig !== '') {
        this.cardSig = '';
        this.card.classList.remove('is-open');
        this.card.replaceChildren();
      }
      return;
    }

    const cardSig = [phase, result.type, result.winningSeat, result.winningTeam, result.points, result.scores.join('-')].join('|');
    if (cardSig === this.cardSig) return;
    this.cardSig = cardSig;

    const view = game.view(0);
    const final = phase === 'matchEnd';
    const teamWon = result.winningTeam === 0;
    const who =
      result.type === 'domino'
        ? `${SEATS[result.winningSeat]?.label ?? ''} ganó la mano`
        : result.winningTeam === null
          ? 'Trancado'
          : `${TEAM_NAMES[result.winningTeam]} ganaron`;
    const why =
      result.type === 'domino'
        ? 'Dominó'
        : result.type === 'tranca-tie'
          ? 'Tranca — nadie anota'
          : 'Tranca — menos puntos';

    const lines = [0, 1]
      .map(
        (t) =>
          `<div class="rc-line ${t === result.winningTeam ? 'is-won' : ''}">` +
          `<span>${TEAM_NAMES[t]}</span><b>${view.scores[t]}</b></div>`,
      )
      .join('');

    this.card.innerHTML =
      `<div class="rc-hand">${final ? 'Partida' : `Mano ${view.handNumber}`}</div>` +
      `<div class="rc-who">${final ? (teamWon ? '¡Ganaron!' : 'Perdieron') : who}</div>` +
      `<div class="rc-why">${final ? `${TEAM_NAMES[result.winningTeam]} se llevan la partida` : why}</div>` +
      (result.points > 0 ? `<div class="rc-points">+${result.points}</div>` : '') +
      '<div class="rc-rule"></div>' +
      lines +
      (final ? '<button class="rc-again" type="button">Otra partida</button>' : '');

    if (final) {
      this.card.querySelector('.rc-again').addEventListener('click', () => game.restart());
    }
    this.card.classList.add('is-open');
  },

  /** The score bar itself. */
  render() {
    const view = this.ctx.game.view(0);
    this.teams[0].score.textContent = String(view.scores[0]);
    this.teams[1].score.textContent = String(view.scores[1]);
    this.handEl.textContent = String(Math.max(view.handNumber, 1));

    // Rewrite BOTH boxes every time. Writing only the team on turn leaves the
    // other side holding whatever name it last displayed, so a stale "Manuel"
    // sits next to a strip that says it is your turn.
    const turnTeam = view.phase === 'playing' ? view.turn % 2 : -1;
    for (let t = 0; t < 2; t += 1) {
      const onTurn = t === turnTeam;
      const seat = onTurn ? SEATS[view.turn] : null;
      this.teams[t].names.textContent = onTurn
        ? view.turn === 0
          ? 'Tu turno'
          : (seat?.label ?? '')
        : TEAM_NAMES[t];
      this.teams[t].el.classList.toggle('is-turn', onTurn);
    }
  },

  dispose() {
    this.root?.remove();
    this.card?.remove();
    this.style?.remove();
    this.ctx = null;
  },
};
