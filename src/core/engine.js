// Engine: owns the renderer, the scene, the camera rig and the fixed-step loop.
// Everything else is a registered module.
//
// Simulation runs on a fixed 1/60 s step so that `?tick=` reproduces a match
// exactly, independent of how fast the browser happens to be running.

import * as THREE from 'three';
import { createRig } from './rig.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRng } from './rng.js';
import { createState } from './state.js';
import { buildWorld } from './world.js';
import { createGame } from './game.js';

// --- Tuning constants ---------------------------------------------------
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_DT = 0.1;
const MAX_PIXEL_RATIO = 2;
const MAX_TICK_SECONDS = 120;
const STATES = ['BOOT', 'MENU', 'DEALING', 'PLAYING', 'HAND_END', 'MATCH_END'];
const FPS_SMOOTH = 0.9;
// -------------------------------------------------------------------------

/**
 * Boot the engine against a canvas.
 * @param {{canvas: HTMLCanvasElement, debugEl?: HTMLElement, hudEl?: HTMLElement}} options
 *   Canvas to render into, plus optional overlay elements.
 * @returns {object} Engine exposing `ctx`, `register`, `start`, `stop` and `renderer`.
 */
export function createEngine({ canvas, debugEl, hudEl }) {
  const params = Object.freeze(
    Object.fromEntries(new URLSearchParams(location.search).entries()),
  );
  const demo = params.demo === '1';
  const debugOn = params.debug === '1';
  const seed = Number.parseInt(params.seed ?? '1337', 10);
  // A real match runs to 200, which is far past what `?tick=` will pre-simulate.
  // `?target=` lets QA reach the end-of-match screen in one capture.
  const targetRaw = Number.parseInt(params.target ?? '200', 10);
  const targetScore = Number.isInteger(targetRaw) && targetRaw > 0 ? targetRaw : 200;

  const rng = createRng(Number.isInteger(seed) ? seed : 1337);
  const audio = createAudio();
  const input = createInput(canvas);
  const rig = createRig();

  const requestedState = STATES.includes(params.state) ? params.state : null;
  const state = createState(requestedState ?? 'BOOT');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, MAX_PIXEL_RATIO));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2620);
  scene.fog = new THREE.Fog(0x2b2620, 6, 16);

  const world = buildWorld(scene, rng);
  // `?demo=1` also hands the player's own seat to the bot, so a run needs no input.
  const game = createGame({ rng, autoPlaySeat0: demo, targetScore });
  // Narrow seam between the board and anything that needs to know where a tile
  // physically landed — currently only the player's hands. The board owns and
  // rewrites `placements`; readers must not hold on to the array.
  const boardView = { placements: [] };

  let lastError = null;
  const trace = [];

  const ctx = Object.freeze({
    scene,
    renderer,
    camera: rig.camera,
    rig,
    world,
    table: world.table,
    game,
    boardView,
    hud: hudEl,
    input,
    audio,
    state,
    rng,
    params,
    demo,
    THREE,
    /** Record a line in the debug overlay and the module trace. */
    log(message) {
      trace.push(String(message));
      if (trace.length > 40) trace.shift();
    },
  });

  const modules = [];
  /** Register a module: `{ name, init(ctx), update(dt), dispose() }`. */
  function register(mod) {
    if (!mod?.name) throw new Error('module needs a name');
    if (modules.some((m) => m.name === mod.name)) {
      throw new Error(`module already registered: ${mod.name}`);
    }
    modules.push(mod);
    mod.init?.(ctx);
    return () => {
      const i = modules.indexOf(mod);
      if (i >= 0) modules.splice(i, 1);
      mod.dispose?.();
    };
  }

  // --- Resize -----------------------------------------------------------
  // The canvas always fills its box; the camera aspect follows the live
  // viewport and the vertical FOV stays fixed, so framing survives any shape.
  let viewW = 1;
  let viewH = 1;
  const resize = () => {
    const w = canvas.clientWidth || globalThis.innerWidth || 1;
    const h = canvas.clientHeight || globalThis.innerHeight || 1;
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    rig.resize(w, h);
  };
  globalThis.addEventListener('resize', resize);
  resize();

  // --- Loop -------------------------------------------------------------
  let raf = 0;
  let running = false;
  let lastTime = 0;
  let acc = 0;
  let fps = 0;

  const step = (dt) => {
    state.tick(dt);
    game.update(dt);
    for (const mod of modules) mod.update?.(dt);
    rig.update(dt);
    input.endFrame();
  };

  const render = () => renderer.render(scene, rig.camera);

  /**
   * Move the shell from the menu into a match. The states are stepped rather
   * than jumped because the machine only allows legal edges, and the shell
   * keys its title card off them.
   */
  const enterPlay = () => {
    if (state.is('MENU')) state.go('DEALING');
    if (state.is('DEALING')) state.go('PLAYING');
  };

  const frame = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const raw = lastTime ? (now - lastTime) / 1000 : FIXED_DT;
    lastTime = now;
    const dt = Math.min(raw, MAX_FRAME_DT);
    fps = fps ? fps * FPS_SMOOTH + (1 / Math.max(raw, 1e-4)) * (1 - FPS_SMOOTH) : 1 / Math.max(raw, 1e-4);

    acc += dt;
    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      step(FIXED_DT);
      acc -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0; // give up on a stalled backlog

    render();
    updateDebug();
  };

  // --- Debug overlay ----------------------------------------------------
  const updateDebug = () => {
    if (!debugEl) return;
    if (!debugOn) {
      debugEl.style.display = 'none';
      return;
    }
    debugEl.style.display = 'block';
    const lines = [
      `fps ${fps.toFixed(0)}  view ${viewW}x${viewH}  aspect ${(viewW / viewH).toFixed(3)}`,
      `state ${state.name} ${state.time.toFixed(2)}s  seed ${seed}  demo ${demo ? 'on' : 'off'}`,
      `match ${game.phase} hand ${game.match.state.handNumber} turn ${game.turn} ` +
        `score ${game.scores[0]}-${game.scores[1]}`,
      `modules ${modules.map((m) => m.name).join(', ') || '(none)'}`,
      `yaw ${rig.yaw.toFixed(3)} pitch ${rig.pitch.toFixed(3)} lean ${rig.lean.toFixed(2)}`,
      `audio ${audio.state}${audio.ambienceOn ? ' +ambience' : ''}${audio.enabled ? '' : ' muted'}`,
      `draws ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`,
    ];
    if (lastError) lines.push(`ERROR ${lastError}`);
    for (const line of trace.slice(-6)) lines.push(`· ${line}`);
    debugEl.textContent = lines.join('\n');
  };

  const onError = (e) => {
    lastError = `${e?.message ?? e}`;
    updateDebug();
  };
  globalThis.addEventListener('error', onError);
  globalThis.addEventListener('unhandledrejection', (e) => onError(e.reason));

  // --- URL hooks --------------------------------------------------------
  // ?tick=<seconds> pre-simulates the real fixed-step loop before the first
  // frame. Headless capture only reaches ~0.3 s of live time, so this is the
  // only way to photograph a later state.
  const preSimulate = () => {
    const seconds = Number.parseFloat(params.tick ?? '0');
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    const total = Math.min(seconds, MAX_TICK_SECONDS);
    const steps = Math.round(total / FIXED_DT);
    for (let i = 0; i < steps; i += 1) step(FIXED_DT);
    return steps;
  };

  return {
    ctx,
    renderer,
    register,
    enterPlay,
    get modules() {
      return modules;
    },
    /** Begin the loop, applying `?tick=` first. */
    start() {
      if (running) return;
      resize();
      const steps = preSimulate();
      if (steps) ctx.log(`?tick= pre-simulated ${steps} steps`);
      if (state.is('BOOT')) state.go('MENU');
      // A demo run has nobody to tap the title card, so it walks straight past
      // the menu. Without this the card sits over a match that is already
      // playing underneath it.
      if (demo && state.is('MENU')) enterPlay();
      running = true;
      lastTime = 0;
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    /** Force one render without running the loop; used by the harness. */
    renderOnce() {
      resize();
      render();
      updateDebug();
    },
    dispose() {
      this.stop();
      globalThis.removeEventListener('resize', resize);
      globalThis.removeEventListener('error', onError);
      for (const mod of [...modules].reverse()) mod.dispose?.();
      modules.length = 0;
      input.dispose();
      audio.dispose();
      world.dispose();
      renderer.dispose();
      hudEl?.replaceChildren();
    },
  };
}
