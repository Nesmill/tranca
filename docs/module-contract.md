# Module Contract — Repite y Tranca

`src/core/engine.js` is law. This document is the complete interface every
feature module (`src/features/<name>.js`) builds against. If a feature needs
something not listed here, raise it rather than reaching around the engine.

## Module export shape

```js
// src/features/<name>.js — one file per module, vanilla ESM
import * as THREE from 'three';

export default {
  name: 'tiles',            // unique, kebab-case; shown in the debug overlay
  init(ctx) { /* build everything here; may throw — fail loud at boot */ },
  update(dt) { /* optional; dt is seconds and already clamped */ },
  dispose() { /* required if init created anything */ },
};
```

- `init(ctx)` runs at registration; the loop may not be running yet.
- `update(dt)` runs every fixed step, in registration order, before the render.
- `dispose()` runs on teardown, in reverse registration order. Everything `init`
  created, `dispose` removes.

## ctx — the complete surface (frozen)

`ctx` is `Object.freeze`d: reassigning any field throws.

| Field | Type | Rules |
|---|---|---|
| `ctx.scene` | `THREE.Scene` | Add your objects; never remove engine-owned nodes. |
| `ctx.renderer` | `THREE.WebGLRenderer` | Read-only. Never call `render`, `setSize`, or touch tone mapping. |
| `ctx.camera` | `THREE.PerspectiveCamera` | Owned by the rig. Read it; ask the rig to move it. |
| `ctx.rig` | Camera rig | See below. The only way the view changes. |
| `ctx.world` | `{ table, lights, group, dispose }` | The stage. Do not rebuild or dispose engine nodes. |
| `ctx.table` | `{ topY, halfW, halfD, mesh, center }` | Table measurements in metres. Use these, never literals. |
| `ctx.game` | Match session | The rules match, seat views, and the player's current selection. See below. |
| `ctx.boardView` | `{ placements }` | Where each placed tile physically landed. Written by the board, read by anything that needs a tile's world position. Do not keep the array. |
| `ctx.hud` | `HTMLElement` | The HUD root. Append your nodes here; remove them in `dispose`. |
| `ctx.input` | Input | See below. |
| `ctx.audio` | Audio | See below. Synthesized only; never loads files. |
| `ctx.state` | State machine | See below. |
| `ctx.rng` | Seeded RNG | `next() range(a,b) int(a,b) pick(arr) shuffle(arr)`. Use it for anything gameplay-random so `?seed=` reproduces. |
| `ctx.params` | frozen `Object` | URL query, parsed once at boot; all values are strings. |
| `ctx.demo` | `boolean` | True when `?demo=1`. Demo behaviour must need zero human input. |
| `ctx.THREE` | module | The same `three` instance the engine uses. |
| `ctx.log(msg)` | function | Appends to the debug overlay trace (keeps the last 6 lines). |

## Spatial contract

`src/core/layout.js` owns every measurement. Import `TABLE`, `SEATS`, `RIG`,
`WORLD_LIMITS` — never hardcode a number that already lives there.

Axes: `+x` is to the player's right, `+y` is up, `+z` is toward the player.

Seats run in play order, which is to the left as Dominican dominoes requires:

| Index | id | Team | Chair |
|---|---|---|---|
| 0 | `you` | 0 | `+z`, the player |
| 1 | `left` | 1 | `-x` |
| 2 | `across` | 0 | `-z`, the partner |
| 3 | `right` | 1 | `+x` |

Partners are 0+2 and opponents are 1+3.

## ctx.rig

- `rig.camera` — the camera. Do not position it yourself.
- `rig.yaw`, `rig.pitch`, `rig.lean` — current angles, read-only.
- `rig.addLook(dxPx, dyPx)` — turn the head by a pointer delta.
- `rig.aimAt(x, y, z)` — aim at a world point; clamped to the look limits.
- `rig.setLean(on)` — request the lean-in dolly; the rig eases toward it.
- `rig.reset()` — return to the resting frame over the board.
- `rig.resize(w, h)` — engine-owned. Never call it.

Vertical FOV is a constant 70 degrees and aspect follows the viewport, so the
vertical composition holds on any screen. Never change the FOV per module.

## ctx.game

The match session. Everything a module needs to draw or drive the game.

- `game.view(seat)` — that seat's filtered view. **Presentation must never read
  another seat's hand**; use `view(0)` for the player and `view.handCounts` for
  everyone else.
- `game.boardLine()` — the line of play, for the board renderer.
- `game.turn`, `game.phase`, `game.scores`, `game.result`, `game.lastEvent`.
- `game.playerToMove()`, `game.playerMustPass()`.
- `game.hint()` — the move the session recommends for the player (the bots'
  own partnership scoring applied to seat 0's view), or null when it is not
  the player's turn or there is no legal placement. The hand strip's PISTA
  chip selects it.
- Selection: `game.selected`, `game.select(id)`, `game.clearSelection()`,
  `game.selectedEnds()`, `game.playSelected(end)`, `game.playPass()`.
- Señas: `game.call(id)`, `game.callFor(seat)`, `game.calls`, `game.clock`.
  `game.forceCall(seat, id)` is a QA hook that ignores the cooldown.
- `game.voidsFor(seat)` — suits that seat has proved it cannot follow. Derived
  only from public passes, so it is legitimate knowledge for any seat.

Selection lives here rather than in the hand strip because the strip and the
board both need to agree on which tile is up. The strip owns the DOM; the board
owns the rings on the table; neither reaches into the other.

The hand strip and the señas sheet are decoupled the same way: the strip renders
a chip carrying `data-action="senas"` and the signals module listens on `ctx.hud`
for it, so neither module imports the other.

## Signals

`src/core/signals.js` holds the vocabulary; `src/features/signals.js` renders it.

**A seña is a claim, not a fact.** Calling `pásame` tells your partner you are
void in the suits showing, and the partner plays as though you are. Nothing
verifies the claim against the hand that made it, and nothing should — bluffing
is part of the game at a real table. Do not add validation that would make a
signal truthful by construction.

## ctx.input

Actions: `pass confirm cancel lean menu`. Real pointers and `inject()` funnel
through the same mutator, so the demo bot is indistinguishable from a human.

- `input.isDown(action)` — held this step.
- `input.wasPressed(action)` / `input.wasReleased(action)` — edge, cleared at the
  end of the step.
- `input.pointer` — `{ x, y, dx, dy, active, dragging }`; `dx/dy` are per-step
  deltas cleared at step end.
- `input.takeTaps()` — drain taps recorded since the last call. A press that
  stays within 10 px and 600 ms is a tap; anything further is a head-look drag.
  Both live on the same pointer surface, so **always route tile selection through
  taps, never through raw pointerdown**.
- `input.inject(action, down)` / `input.injectTap(x, y)` — demo-bot drivers.

The hand strip uses plain DOM `click` handlers rather than `takeTaps()`, because
the buttons are real elements and the browser already does the hit-testing. It is
a sibling of the canvas, so its taps never reach the head-look drag.

## ctx.audio

One-shots: `clack(strength)`, `shuffle(intensity)`, `thud()`, `knock()`,
`blip(freq)`, `knell()`.

Ambience: `startAmbience()`, `stopAmbience()`, `ambienceOn`. The shop's merengue
loop and room tone. `startAmbience` returns `false` when there is no context
rather than pretending to have started.

Control: `setVolume(v)`, `unlock()`, `enabled`, `state` (the AudioContext state,
for the debug overlay, or `'none'`).

Everything is failure-proof: a blocked or suspended `AudioContext`, or a browser
with no WebAudio at all, degrades to silence rather than throwing. `test/audio.test.mjs`
runs the whole surface under Node, which is exactly that degraded case. Never
await audio state. `unlock()` must be called from a real user gesture, and
browsers will keep the context suspended until then — that is the correct
outcome, not a bug to work around.

## ctx.state

States: `BOOT → MENU → DEALING → PLAYING → HAND_END → MATCH_END`.

- `state.name`, `state.time` (seconds in the current state), `state.is(name)`.
- `state.onEnter(name, fn)` / `state.onExit(name, fn)` → return a disposer.
- `state.go(name)` — moves only along legal edges; an illegal source is a no-op
  and returns `false`. The shell syncs `body[data-state]` on every entry.

## Hard rules for feature authors

1. **No engine tampering.** No reassigning `ctx` fields, no monkey-patching, no
   `renderer` calls, no replacing `scene.fog` or the lights.
2. **No per-frame allocations.** No `new THREE.Vector3/Color/Matrix4` or object
   churn inside `update` — use module-level scratch objects. Pool anything that
   spawns in bursts.
3. **Dispose everything you create.** Track geometries, materials, textures,
   lights, meshes, DOM nodes and listeners from `init`; release them in `dispose`.
   Share one geometry and material per type across entities of that type.
4. **`dt` is seconds.** Never read wall clocks (`Date.now`, `performance.now`) in
   gameplay — they break deterministic `?tick=` captures.
5. **Raycast named arrays**, never `scene.children`.
6. **Shadows**: `castShadow` on tiles, figures and furniture; `receiveShadow` on
   the table and floor; never on signs, the tube or the sky. One shadow-casting
   light exists (the key spot over the table); do not add another.
7. **DOM**: build HUD nodes inside `#hud`. The debug overlay is engine-owned.
8. **Fail loud in `init`, never throw in `update`.**
9. **No external assets.** Textures are drawn to a canvas at boot; audio is
   synthesized. Nothing is fetched.

## The rules engine is not a feature

`src/core/rules.js` (M1) is pure logic: it takes actions and returns state plus
events, with no three.js import and no DOM. Seats receive a **filtered view** —
their own hand plus public information only. An AI seat implements
`decide(view) -> action` locally; a remote player will implement the same
interface over a socket. Presentation must never read another seat's hand
directly, or online play becomes a rewrite and the AI can cheat by construction.

## Verifying a feature

Boot only your module: `http://127.0.0.1:4174/test.html?module=<name>`
(comma-separate for pairs) plus any hooks from TOOLS.md. Then capture with
`node studio/shot.mjs <url> <out.png> 4000 492 1066`, **read the PNG**, and only
claim what a fresh screenshot proves. To reach a later state use `?tick=`, never
a large virtual-time budget.
