# TOOLS.md — Studio Ops Manual

Shared tooling for `repite-y-tranca`. Every command below was executed and
verified on this machine; the screenshots they produced are in `docs/shots/`.

Project root (all paths below are relative to it):
`C:/Users/nesto/deepseek-harness/Workspace/repite-y-tranca`

## Ensure the server is running

`studio/server.mjs` is a zero-dependency static server on **port 4174**
(`Cache-Control: no-store` everywhere, `--port <n>` override, 404 for missing
files). Port 4173 belongs to `enchantlegacy-proto` — do not use it.

It may be stopped between agent turns; restarting it is always your job. Start
it as a background job with the pwsh tool:

- command: `node studio/server.mjs`
- workdir: `C:/Users/nesto/deepseek-harness/Workspace/repite-y-tranca`
- `run_in_background: true`

Verify with a GET first, never start a duplicate:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{size_download} bytes`n" --max-time 3 http://127.0.0.1:4174/canary.html
```

Expected: `200 <non-zero> bytes`. `000` means nothing is listening. A probe
against a stopped server can hang; keep `--max-time` small.

## Take a screenshot

```powershell
node studio/shot.mjs <url> <out.png> [virtualTimeMs=4000] [width=430] [height=932]
```

**Always pass `492 1066` explicitly.** The defaults exist only so the CLI has
some value; 492x1066 is the capture size this project is framed for (see below).

```powershell
node studio/shot.mjs "http://127.0.0.1:4174/?state=PLAYING" "$out/shot.png" 4000 492 1066
```

Behavior you can rely on:

- Every installed candidate (Edge x86, Edge x64, Chrome user-local, Chrome x64)
  is **tried in order until one actually writes a frame** — a browser can exit 0
  and produce nothing, and the output file is deleted before each attempt so a
  stale frame never reads as success.
- The output path is resolved to absolute before the browser sees it: current
  Chrome/Edge write `--screenshot` only to an absolute path, and a relative one
  lands nowhere (this is what silently broke the pipeline on 2026-09-22).
- Flags: `--headless=new --no-first-run --no-default-browser-check
  --disable-extensions --hide-scrollbars --window-size=W,H
  --virtual-time-budget=VT --screenshot=OUT <url>`.
- **Never pass `--disable-gpu`** — it kills WebGL. The default GPU path renders
  WebGL headless here; the canary proves it.
- stdio is `"ignore"` because captured stdio is blocked in this environment.
  Success = exit 0 AND a freshly written non-empty output file.
- Output directory is created automatically.
- `SHOT_ARGS` passes extra flags, e.g. `SHOT_ARGS='--use-angle=swiftshader'` if a
  frame comes out black.

## Capture geometry — read this before trusting a screenshot

Measured on this machine, not assumed:

1. **Chrome enforces a minimum window width of about 492 px.** Requesting
   `430x932` produced a **492x932 CSS viewport** while the PNG came out 430x932.
2. **The PNG is a top-left 1:1 crop of the CSS viewport, never a scale.** Proven
   by placing a DOM element at a known CSS position and confirming it landed on
   the same pixel in the PNG, and by a CSS circle that stayed perfectly round.
   With a 492-wide viewport and a 430-wide PNG, the right 62 px are simply gone.
3. Therefore: **request width >= 492** and the viewport width equals the window
   width, so the PNG is the complete frame.

`492 x 1066` is exactly 9:16 (aspect 0.4615) — the phone shape the game is
designed for. Confirmed by the debug overlay reporting `view 492x1066 aspect
0.462` at that size.

A page-side sanity check that costs one image read: the debug overlay prints
`view <cssW>x<cssH> aspect <a>`. If that disagrees with the PNG dimensions
(width aside from the minimum-width case), the capture is not showing the whole
frame.

## Virtual-time ceiling

Captured frames contain only about **0.2–0.3 s of game time** regardless of the
virtual-time budget. Confirmed again here: a run with `--virtual-time-budget=4000`
reported `state PLAYING 0.23s`. rAF and virtual time run fast, but the
compositor completes only a handful of frames before the screenshot fires.

Consequences:

- Never plan a far-future VT shot to reach a later state. Use `?tick=<seconds>`,
  which pre-simulates the real fixed-step loop before the first frame.
- `--disable-threaded-compositing` hangs the capture here. Never use it.
- Consecutive VT values may produce near-identical frames; read bursts for
  differences and use a much larger budget before concluding nothing animates.

## Read images

Screenshots are only useful if a model looks at them. Use the `read_image` tool
with the absolute PNG path.

The debug overlay is anchored to the **top** of the frame (`#debug { top: 0 }`
in `index.html`). Shoot **twice** when evaluating framing: one shot with
`?debug=1` for the numbers, one without for the picture.

Verification habit: expected subject visible, colours correct, HUD text correct,
and no red error text. `window.__errors` on every page collects anything the
error trap caught; it is also mirrored into `#debug`.

## Project layout map

```
repite-y-tranca/
  index.html      game shell: import map, #stage canvas, #hud, #debug, error trap
  test.html       feature harness: ?module=<name>[,<name2>]
  studio/
    server.mjs    static server (port 4174, --port override, no-store)
    shot.mjs      screenshot CLI (browser auto-resolve, SHOT_ARGS passthrough)
    canary.html   portrait WebGL canary + CSS circle/square proportion probes
    TOOLS.md      this manual
  src/
    main.js       entry: creates the engine, registers features
    core/         engine, rig, world, layout, state, input, audio, rng
    features/     gameplay modules, one file each (see docs/module-contract.md)
  lib/three/      vendored three 0.185.1 (three.module.js + three.core.js PAIR)
  docs/
    gdd.md              design: rules, camera, HUD, milestones
    module-contract.md  the binding feature-module interface
    shots/              screenshots
```

Pages:

- `/` (`index.html`) — the game. `body[data-state]` mirrors the state machine.
- `/test.html?module=<name>[,<name2>]` — boots the engine and registers only the
  named features. A missing module boots cleanly with a `[harness]` line in
  `#debug`; that is the harness working, not a failure.
- `/canary.html` — WebGL + proportion canary. Aliased in `server.mjs`; the file
  lives in `studio/`.

## URL hooks (combine freely)

| Hook | Effect |
|---|---|
| `?state=BOOT\|MENU\|DEALING\|PLAYING\|HAND_END\|MATCH_END` | Force the initial state |
| `?debug=1` | Overlay: fps, viewport + aspect, state + time, modules, rig angles, draw calls, last error |
| `?tick=<seconds>` | Deterministic fixed-step pre-simulation before the first frame (capped 120 s) |
| `?seed=<int>` | Seeds gameplay RNG and generated textures (default 1337) |
| `?demo=1` | Auto-start and drive the game with no human input, including the player's own seat |
| `?anim=<n>` | Stretch the hand-placement animation `n` times |
| `?senas=1` | Open the señas sheet on load |
| `?call=<seat>:<id>` | Re-issue a seña every step, so its bubble stays up |
| `?audio=1` | Unlock and start the ambience without waiting for a gesture |
| `?target=<n>` | Lower the score that ends the match (default 200) |
| `?droptime=<seconds>` | Stretch the board's tile-drop settle (default 0.32 s), so a capture catches opponents' tiles mid-drop |

Feature-owned hooks belong to their modules, not the engine.

### Reaching the end of a match

A real match runs to 200 points, which is several hundred simulated seconds and
well past what `?tick=` will pre-simulate in one go. `?target=25` ends the match
in a handful of hands, and because the end-of-match card stays up, any tick past
the end will capture it:

```powershell
node studio/shot.mjs "http://127.0.0.1:4174/?demo=1&state=PLAYING&target=25&tick=115" out.png 3000 492 1066
```

The hand-end card is harder: it only shows for the five seconds between the hand
ending and the next one being dealt. Read the debug overlay's `match <phase>
hand <n>` line to find which hand a tick lands in, then bracket it — the card is
up for `HAND_END_PAUSE` seconds before the deal.

### Capturing a timed animation

A hand placement runs for about 0.7 s, and `?tick=` lands wherever the match
happens to be, so the odds of catching one are poor. `?anim=12` stretches it to
roughly 8 s, which makes the carry almost always in progress:

```powershell
node studio/shot.mjs "http://127.0.0.1:4174/?demo=1&state=PLAYING&tick=30&anim=12" out.png 4000 492 1066
```

That is how `docs/shots/m3-placing.png` was taken. Use the same trick for any
other short effect rather than taking screenshots until one happens to land.

A seña bubble lasts 4.5 s and a tap cannot be delivered headlessly, so
`?call=2:pasame` re-issues the call on every step and holds the bubble up
(`docs/shots/m4-hero.png`). `?senas=1` opens the sheet for the same reason.

The board's opponents-tile drop (0.32 s settle) has its own stretch:
`?droptime=9999` leaves every settling tile frozen a few centimetres above the
table (`docs/shots/rev2-drop.png`). Your own seña's toast lives 1.6 s, and
`?call=0:<id>` re-issues it every step to hold it up (`docs/shots/rev2-toast.png`).

### Capturing the player's own turn

`?demo=1` hands seat 0 to the bot, so the hand strip goes passive. For the strip
in its interactive state, drop `demo` and pre-simulate: the bots play seats 1-3
and then the match parks on the player's seat.

```powershell
node studio/shot.mjs "http://127.0.0.1:4174/?state=PLAYING&tick=25&debug=1" out.png 4000 492 1066
```

## Audio cannot be verified by screenshot

A headless capture has no user gesture, so the `AudioContext` stays `suspended`
and the game is silent. That is correct behaviour, not a failure.

What a capture *can* show is that the module is live: the debug overlay prints
`audio <state> +ambience`. `?audio=1` starts the scheduler without a gesture, so
`audio suspended +ambience` is the expected line — the loop is queued and would
be audible the moment a real gesture resumed the context.

What is actually asserted about audio is the degraded path:
`node test/audio.test.mjs` runs the whole surface under Node, where there is no
WebAudio at all, and checks that every entry point is silent rather than fatal.

Do not claim a sound "works" from a screenshot. The honest claims are that the
graph is built, the scheduler runs, and the game survives having no audio.

## Camera framing reference

The camera is a fixed chair. Vertical FOV is a constant 70 degrees and the
aspect comes from the live viewport, so the vertical composition — hands, then
table, then shop — survives any screen shape. Only the horizontal crop varies.

At the current rig (`eye [0, 1.24, 0.95]`, base pitch 18 degrees down, table top
0.74, table 1.02 x 1.02), measured from a 492x1066 capture:

| Feature | Depth (z) | Frame position |
|---|---|---|
| Partner's head | -0.86 | ~28% down |
| Far table edge | -0.51 | ~51% down |
| Board far edge | -0.48 | ~52% down |
| Board centre | 0 | ~64% down |
| Board near edge | +0.48 | ~91% down |
| Near table edge | +0.51 | ~94% down |

**The flanking seats are off-screen by design.** They sit about 39 degrees off
axis while the portrait frustum only covers about 20 degrees to each side, so
neither can be framed without turning. This is a consequence of a phone-shaped
viewport, not a bug — the reference image cheats with an impossible wide angle.
Head-turn (`RIG.maxYaw`, 1.15 rad) is how the player reads them.

If the framing is retuned, update this table and re-shoot `docs/shots/m0-clean.png`.

## Board grid: width is the scarce axis

The board is a cell grid (`src/core/track.js`). Portrait has a **tall** frame and
a **narrow** one, and the horizontal crop is what limits the board:

- The camera shows roughly **0.7 m of table width** at board-centre distance, and
  only about **0.5 m** at the board's near edge.
- It shows the full **1.0 m of depth** without difficulty.

So the board is deliberately **narrow and deep** — it spends cells on rows, not
columns. A square board wastes its width on tiles that fall outside the frame.

Columns still matter mechanically: a serpentine pass holds half as many tiles as
there are columns, so a narrow board needs more rows to finish a hand. Measured
over 120 matches per shape:

| Columns | Minimum rows | Board width | Tile |
|---|---|---|---|
| 16 | 23 | 0.67 m | 84 x 42 mm |
| 18 | 19 | 0.90 m | 107 x 54 mm |
| 20 | 19 | 1.02 m | 102 x 51 mm |

Wide shapes pass their tests and still look wrong on a phone: an 18-column board
is 0.90 m across, so only its far edge stays inside the frame and two or three
tiles vanish off each side. **Test the shape on screen, not just in the suite.**

Retuning: `node studio/sweep-track.mjs <matches>` reports which shapes survive
real matches, and `node studio/trace-board.mjs <seed>` dumps an ASCII board for
the first layout that overlaps, which is how every turning bug so far was found.

## Gotchas

- Port 4173 is `enchantlegacy-proto`. This project is 4174.
- `GET /` 404s until `index.html` exists at the project root.
- No bundler, no TypeScript, no JSX. Vanilla ESM served statically.
- **No external assets of any kind** — no images, audio or models. Textures are
  drawn into a `<canvas>` at boot; audio is synthesized with WebAudio.
- `lib/three/three.module.js` imports `./three.core.js`; shipping one without the
  other 404s every page. Game code imports only the bare specifier `'three'`, so
  `grep -r "three.module" src/` must stay empty.
- Captured stdio is blocked: background jobs and `shot.mjs` must not rely on
  reading subprocess output. Decide success by exit code plus output file.
- The pwsh tool defaults to the session workspace — always pass `workdir` for
  project-relative commands.
- Files end with exactly one trailing newline.
