# QA Report — Repite y Tranca

Every claim below is backed by a named artefact: a test that runs, or a
screenshot that was opened and read. Where something could not be verified, it
says so in [What was not verified](#what-was-not-verified) rather than being
quietly dropped.

## Automated suites

```
node test/rules.test.mjs    32 passed
node test/track.test.mjs    13 passed
node test/game.test.mjs      8 passed
node test/audio.test.mjs     6 passed
```

| Suite | Covers |
|---|---|
| `rules.test.mjs` | The deal, the forced double-six opening, left/right orientation, legality, *paso*, *trancado* scoring (including an even tranca), domino scoring, the target score, view filtering, determinism, and 200 full matches laid out with tiles conserved and no illegal move accepted |
| `track.test.mjs` | Grid centring, inline and crosswise tiles, turning, line connectivity, layout stability as the line grows, and **200 real matches laid out cleanly after every single play** |
| `game.test.mjs` | Void inference from passes, that voids clear between hands, that the bot strands an opponent rather than its own partner, the pista hint (legal when one exists, null without), and a whole match with tiles conserved |
| `audio.test.mjs` | The degraded path: the entire audio surface under Node, where there is no WebAudio at all |

The strongest single test is the one in `track.test.mjs` that drives 200 real
matches through the board layout and asserts no overlap, no off-grid tile and no
stalled placement at any point. It is what turned the serpentine from "usually
works" into a solved problem.

## Screenshot coverage

Every state below was captured and read.

| State | Shot | Verified |
|---|---|---|
| Menu | `qa-state-MENU.png` | Title card, no 3D behind it |
| Playing, player's turn | `m3-hands2.png` | Strip interactive, tiles dimmed by legality, end rings, turn status |
| Playing, mid-placement | `m3-placing.png` | Hand carrying a tile to the end of a 17-tile board |
| Playing, developed board | `m5-world4.png` | 20+ tile serpentine, dressed shop, both hands at rest |
| Señas sheet | `m4-senas-sheet.png` | All four calls with hints |
| Seña bubble | `m4-hero.png` | "Tranca" floating over Ramón, clear of the score bar |
| Hand end | `qa-card2-36.png` | Scoring card: winner, reason, points, running totals |
| Match end | `qa-matchcard.png` | Final card, winner, and the "Otra partida" button |
| Full demo run | `qa-demo.png` | A whole match played with no human input |
| Playing, PISTA chip (post-QA) | `rev2-pista.png` | Chip row reads PISTA + SEÑAS; the two dimmed tiles share neither open suit, so the dimming is correct |
| Opponent tiles frozen mid-drop (post-QA) | `rev2-drop.png` | `?droptime=9999` holds both tiles hovering above the table with displaced shadows — the drop animation exists |
| Resting board, pre/post diff (post-QA) | `revive-playing.png` vs `rev2-pista.png` | Board regions are pixel-identical (207 anti-aliasing pixels differ); the drop leaves the resting pose exactly where it was |
| Player's seña toast (post-QA) | `rev2-toast.png` | "Seña — Tranca" pill above the hand strip, PISTA + SEÑAS below it |
| Full match via one pre-sim window (post-QA) | `rev2-matchend.png` | `?demo=1&tick=120&target=25`: 7200 steps to `match matchend 36-0`, end card with "Otra partida", **no last-error line** |

`?demo=1` completing a full match unaided is the end-to-end proof: rules, seats,
board, hands, HUD and señas all running together for several hundred simulated
seconds without a single uncaught error surfacing in the overlay.

## Bugs found during QA, and fixed

**The title card never lifted — the game was unreachable.** There was no handler
on the menu at all, so a real player could tap the card forever and nothing would
happen; the match was already running underneath it. The demo run exposed it,
because the debug overlay read `state MENU` over a live board. `?demo=1` now
walks straight past the menu — nobody is there to tap — and tapping the card
enters play for everyone else.

**The scoring card flashed past unreadably.** `HAND_END_PAUSE` was declared and
exported but never actually assigned to the timer — `takeTurn` overwrote it with
an ordinary think time immediately after the hand ended, so the real pause was
about 1.5 s instead of the intended 5 s. It surfaced as an *impossible timeline*
while hunting for the card: a hand that had clearly ended by t≈32 was still in
progress at t≈34. The tell was arithmetic that did not add up, not a visual
glitch.

**The score bar showed a dead team's name.** Only the team on turn had its name
written, so the other box kept whatever it last displayed — a stale "MANUEL" sat
beside a strip reading "TU TURNO". Both boxes are now rewritten every time.

**The hand strip could show stale legality.** Its refresh signature used the
*count* of legal moves. When the open ends changed but the count happened to stay
the same, the strip never refreshed and left tiles dimmed that were playable.
The signature now names every legal move.

**The board folded back onto itself around 24 tiles.** Two causes: a crosswise
double at the table edge advances the line only one cell, so the following tile
started off-grid with no legal turn; and both ends of the line grew blindly
toward each other. Fixed by offering a double on *both* perpendicular sides,
growing both ends in step, and having a forced turn head for the most open
ground.

**The shop turned black.** Dropping the hemisphere fill to make the table
dramatic left the shelves, cooler and counter as black masses — the shadow-casting
spot is aimed at the table and never reaches them.

**The cooler was a sealed box.** Bottles were modelled on three shelves *inside*
a solid box, whose own front face hid every one.

**A duplicate `topMat`** stopped the boot with a syntax error. The error trap
caught it and printed it over the title card, which is what a boot failure should
look like.

## What was not verified

- **Audio has never been listened to.** The graph is built, the merengue
  scheduler runs, and the debug overlay reports `audio suspended +ambience`. But
  a headless capture has no user gesture, so the context stays suspended and
  nothing is audible. The mix and the levels are unverified guesswork. What *is*
  proven is the degraded path: with no WebAudio at all, every entry point is
  silent rather than fatal.
- **No real touch input has been used.** Every interaction was driven through the
  DOM or the demo bot. Tap targets, thumb reach and the tap-versus-drag threshold
  on the head-look have not been tested on a device.
- **Nothing has been run on a phone.** All captures are the desktop browser at a
  492x1066 viewport. Real iOS and Android behaviour — safe areas, the audio
  unlock gesture, WebGL performance — is untested.
- **The AI has not been played against by a human.** It plays a defensible
  partnership game and never breaks a rule, but whether it is *fun* to beat is
  not something a test can say.
- **The 200-match layout test is not exhaustive.** It is strong evidence, not a
  proof that no deal can ever produce an overlapping board.

## Known issues

Carried in the README; repeated here as the QA verdict, updated by the post-QA
pass (the PISTA, tile-drop, seña-toast and ambience-variation items are done
and no longer listed).

- The board's near corners can leave the frame. A portrait view shows about 0.5 m
  of table width at the board's near edge and no 28-tile serpentine fits inside
  that. The live ends are ringed so the playable values are never hunted for.
- The opponents are flat 2.5D billboards rather than models.
- The ambience now phrases over four bars, but **the whole mix is still unheard**:
  a headless capture has no gesture, so nothing has ever been listened to.
- Nothing has been run on a phone, and no real touch input has been used.
