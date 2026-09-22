# Repite y Tranca — Dominó

**▶ Play it live (free, no account): https://nesmill.github.io/tranca/**

A first-person dominó game set in a Dominican colmado at night. Four players at
the blue plastic table — your partner across from you, two rivals on either
side — seen from your own chair. Portrait mobile web, vanilla ESM + three.js, no
build step, no external assets.

![Repite y Tranca](docs/shots/hero.png)

Portrait mobile web, vanilla ESM + three.js, no build step, no external assets —
every texture is drawn into a canvas at boot and every sound is synthesized.

Design lives in [`docs/gdd.md`](docs/gdd.md); the binding feature interface is
[`docs/module-contract.md`](docs/module-contract.md); operations are in
[`studio/TOOLS.md`](studio/TOOLS.md).

## How to run

```sh
node studio/server.mjs   # from the project directory; serves on port 4174
```

Then open <http://localhost:4174> (WebGL2 required). Port 4173 belongs to
`enchantlegacy-proto`.

## URL hooks

| Flag | Effect |
|---|---|
| `?state=BOOT\|MENU\|DEALING\|PLAYING\|HAND_END\|MATCH_END` | Force the initial state |
| `?debug=1` | Overlay: fps, viewport + aspect, state + time, modules, rig angles, draw calls, last error |
| `?tick=<seconds>` | Deterministic fixed-step pre-simulation before the first frame |
| `?seed=<int>` | Seeds gameplay RNG and generated textures (default 1337) |
| `?demo=1` | Auto-start, no human input |
| `?droptime=<seconds>` | Stretch the opponents' tile-drop settle, so a capture catches a tile mid-drop |

## Screenshots

```sh
node studio/shot.mjs "http://127.0.0.1:4174/?state=PLAYING" docs/shots/out.png 4000 492 1066
```

**Always pass `492 1066`.** That is exactly 9:16, and it clears the ~492 px
minimum window width Chrome enforces. Below that the viewport is widened behind
your back and the PNG silently crops the right edge — see `studio/TOOLS.md` for
the measurements.

## Architecture in one paragraph

`src/core/engine.js` boots one frozen `ctx` (renderer, scene, a seated camera
rig, a fixed 1/60 s simulation step, seeded RNG, URL params, synthesized audio,
a named state machine) and runs every feature through one contract: each
`src/features/<name>.js` default-exports `{ name, init(ctx), update(dt), dispose }`.
`src/core/layout.js` owns every spatial measurement — table size, seat placement,
camera anchor — so nothing hardcodes a number that already exists. `src/core/world.js`
builds the colmado: room shell, shelving, invented-brand signs and the blue
plastic table, lit by one shadow-casting spot so bone tiles read against blue.
Textures are drawn into a canvas at boot and audio is synthesized with WebAudio,
so the whole game is a static bundle with no asset files. The only dependency is
the vendored three.js pair behind an import map.

## Layout

```
index.html      game shell          test.html    per-feature harness
studio/         server, shot, canary, board diagnostics, TOOLS.md
src/core/       engine, rig, world, layout, state, input, audio, rng, pips
                rules (pure game logic)  track (pure board layout)  game (session)
src/features/   characters (the other players, 2.5D sprites)  board  hands (yours)
                hand-strip  hud (score bar)  signals (señas)  sound
lib/three/      vendored three 0.185.1
test/           headless suites, no dependencies
docs/           gdd, module-contract, shots
```

## Status

**M0 complete** — scaffold, portrait seated camera, blue colmado table, four
chairs and a working screenshot pipeline. The three other players are
placeholder figures.

**M1 complete** — `src/core/rules.js` is the pure Dominican rules engine: the
deal, the forced double-six opening, left/right orientation, *paso*, *trancado*
with the lower pip total taking the hand, domino scoring, and the race to 200.
It imports no three.js and no DOM, and every seat reads the game through a
filtered view exposing only its own hand — so an AI opponent cannot see your
tiles by construction, and a networked seat can reuse the same interface later.

**M2 complete** — the line of play wraps and turns on the table in a serpentine.
`src/core/track.js` lays the whole line out on a cell grid as a pure function of
the board, so it can be recomputed after every play without any tile moving.
Doubles lie across the line, both ends of the line grow in step, and a forced
turn heads for the most open ground. `src/features/board.js` renders it with
canvas-generated pip faces. `src/core/game.js` drives the three AI seats.

**M3 complete** — the table is playable. `src/features/hand-strip.js` is the
interaction surface: a strip of face-up tiles you tap, with unplayable tiles
dimmed and an action chip that commits the play. `src/features/hands.js` gives
you first-person hands that carry the tile out and set it down.
`src/features/seats.js` seats three players who breathe and look at whoever is
to move. The board marks its two live ends with rings — gold for an end the
selected tile can go on.

**M4 complete** — the HUD and the partnership. `src/features/hud.js` is the score
bar; `src/features/signals.js` is señas. The AI plays the partnership, not just
its own hand: because there is no boneyard, a pass is permanent proof of void in
both open suits, and the bots steer the line toward suits the opposition cannot
follow and away from suits their partner cannot. Señas are *claims* — untested
against the hand that made them, because a call you cannot bluff is not a call.

**M5 complete** — the colmado. `src/core/world.js` dresses the shop where the
camera can actually see it: a glass-fronted cooler racked with bottles, a counter
with a radio on it, hanging snacks, a tiled floor, and two silhouettes at the
back. The fluorescent tube over the table is the only shadow-casting light;
everything else is a hemisphere fill, because a spot dramatic enough for the
table leaves the shop as black masses. `src/features/sound.js` ties synthesized
audio to the table — a clack weighted by the tile's pips, a knock for a pass or a
seña, and a merengue loop underneath.

**M6 complete** — QA. Every state was captured and read, `?demo=1` plays a whole
match unaided without an uncaught error, and the hand-end and match-end screens
exist at all — they did not before this pass. Bugs found and fixed during QA are
listed in [`docs/qa-report.md`](docs/qa-report.md), which also states plainly what
**was not verified**: audio has never been listened to, no real touch input has
been used, and nothing has run on a phone.

**M7 — characters, and the post-QA pass.** The opponents are no longer
placeholder figures: `src/features/characters.js` seats three 2.5D sprite
billboards cut from generated sheets (`studio/sprites.py`), each with a
floating name plate and six poses. The table itself gained the things QA and
the HUD spec said were missing: a **PISTA** chip — `game.hint()` runs the
bots' own partnership scoring, so it names a *good* play rather than a merely
legal one, and lifts the tile it recommends; opponents' tiles now drop the
last few centimetres onto the table instead of appearing (`?droptime=` holds
them mid-drop for a capture); and your own seña surfaces as a brief toast,
because seat 0 sits behind the camera and gets no bubble. The merengue
ambience phrases over four bars — ghost scrapes, an end-of-phrase tambora
fill, a bass breath before the pickup — instead of looping one identical bar.
`studio/shot.mjs` also resolves `--screenshot` to an absolute path and falls
through to the next installed browser, which is what repaired the capture
pipeline on this machine.

```sh
node test/rules.test.mjs    # 32 tests
node test/track.test.mjs    # 13 tests, including 200 full matches laid out
node test/game.test.mjs     #  8 tests: void inference, partnership play, pista hint
node test/audio.test.mjs    #  6 tests: the no-WebAudio degraded path
```

## Known issues

- **The board's near corners can leave the frame.** A portrait view shows only
  about 0.5 m of table width at the board's near edge, and no 28-tile serpentine
  fits inside that. The board is narrow-and-deep to minimise it and the two live
  ends are ringed, so the playable values are never hunted for.
- The opponents are flat 2.5D billboards rather than models — cut-out sprite
  art that holds up because the camera never leaves its chair, but it is not
  finished 3D character work and would not survive a free orbit.
- **Audio is unverified by ear.** Every sound is synthesized and the graph is
  built, but a headless capture cannot hear it, so the mix has never actually
  been listened to. Levels in particular are guesswork — that includes the
  four-bar ambience phrase added in M7, which is reasoned about, not heard.
- Nothing has been run on a phone, and no real touch input has been used. See
  [`docs/qa-report.md`](docs/qa-report.md) for the full list of what is unproven.
- The player's hands do not hold the visible fan of tiles the reference image
  shows — the strip is the hand. See `docs/gdd.md`.
- The debug overlay is anchored top. Capture twice when judging framing: once
  with `?debug=1`, once without.
- Headless captures report audio as suspended (no user gesture). Expected; in a
  real browser audio unlocks on first input.
