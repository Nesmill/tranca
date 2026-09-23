// Entry point. Creates the engine, registers the feature modules, and wires the
// few cross-feature seams. Feature modules live in src/features/<name>.js and
// build against docs/module-contract.md.

import { createEngine } from './core/engine.js';
import characters from './features/characters.js';
import seats from './features/seats.js';
import board from './features/board.js';
import handStrip from './features/hand-strip.js';
import hands from './features/hands.js';
import props from './features/props.js';
import hud from './features/hud.js';
import signals from './features/signals.js';
import sound from './features/sound.js';

/**
 * Boot the game.
 * @returns {Promise<object>} The running engine.
 */
export async function main() {
  const canvas = document.getElementById('stage');
  const hudEl = document.getElementById('hud');
  const debugEl = document.getElementById('debug');

  const engine = createEngine({ canvas, debugEl, hudEl });
  const { ctx } = engine;

  // Keep body[data-state] in sync so CSS can key off the match phase.
  const syncBody = (name) => {
    document.body.dataset.state = ctx.state.name;
    ctx.log(`state -> ${name}`);
  };
  for (const name of ['MENU', 'DEALING', 'PLAYING', 'HAND_END', 'MATCH_END']) {
    ctx.state.onEnter(name, syncBody);
  }
  document.body.dataset.state = ctx.state.name;

  // The opponents: seats.js by default (generated GLB cast over primitive
  // stand-ins). `?cast=sprites` brings back the 2.5D billboards; seats.js also
  // honours `?cast=primitives` to skip the generated models.
  const cast = ctx.params.cast === 'sprites' ? characters : seats;
  engine.register(cast);
  // The generated colmado props dress the room world.js builds.
  engine.register(props);
  engine.register(board);
  // Registered after the board: the hands read the layout the board just wrote.
  engine.register(hands);
  engine.register(handStrip);
  engine.register(hud);
  engine.register(signals);
  engine.register(sound);

  // The title card is the only way into a match. Without this the game runs
  // underneath a card that never lifts.
  const titleCard = document.getElementById('title-card');
  const start = () => {
    engine.enterPlay();
    ctx.audio.unlock();
  };
  titleCard?.addEventListener('pointerdown', start);

  engine.start();
  return engine;
}
