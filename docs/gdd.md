# GDD — Repite y Tranca: Dominó

## Concept

A first-person dominó game set in a Dominican colmado at night. You are one of
four players at the blue plastic table: your partner across from you, two rivals
on either side. You see the table from your own chair — your hands, their hands,
the bare bulb, the shelves, the argument about whether that was a *tranca*.

The title comes from the two calls that define the game: *¡repite!* to your
partner, and *tranca* for the blocked hand.

**Platform:** portrait mobile web. Vanilla ESM + three.js, no build step,
deployable as static files. Playable on desktop in a phone-shaped window.

## Setting

A colmado — the Dominican corner store — after dark. Stocked shelves, a
glass-fronted cooler of beer, a counter with a radio on it, snacks hanging from a
rail, a folding table that has seen years of this. A bare fluorescent tube over
the table and everything beyond it falling away warm and dim.

Two constraints shape the build, both from the camera being a seated player who
turns at most about 65 degrees:

- **Only the back of the shop is ever in shot.** The dressing is concentrated
  there and the side walls stay plain.
- **The portrait frame is narrow.** At the back wall it covers only about 1.3 m
  to either side of centre, so anything placed wider than that is never seen —
  the cooler and the counter sit just inside that band.

The fluorescent tube is the only shadow-casting light and it is aimed at the
table. Everything else is a hemisphere fill that carries the whole room, because
a spot bright enough for a dramatic table leaves the shelves, cooler and counter
as black masses behind the players.

Signage uses **invented brands** (Cerveza Ámbar, Ron Palmares, Refresco Naranja,
Cola Criolla). The reference image carries real trademarks; publishing those is a
legal risk and the invented labels read the same at a glance.

## Rules

Four players, two teams of two, **partners seated opposite**.

- Double-six set, all 28 tiles dealt, **seven each, no boneyard**.
- Play passes to the right. From your chair: you → right → partner → left → you.
- The holder of double-six opens the first hand; the previous hand's winner opens
  thereafter.
- If you cannot play, you pass (*paso*).
- If all four players pass, the hand is blocked (*trancado*). The team holding
  fewer pips takes the hand.
- The winning team banks the total pips left in the losing team's hands.
- First team to **200** wins the match.

> House rules vary widely. These are the assumed defaults and are cheap to change
> — confirm before M1 freezes the scoring model.

## Camera and POV

A fixed chair, not a body. You can turn your head within an arc and lean toward
the board; you cannot stand or walk.

**Vertical FOV is a constant 70 degrees** and aspect comes from the live
viewport. The vertical axis carries the whole composition — your tile strip at
the bottom, the table across the middle, the players and the shop above — so
holding it fixed keeps the framing identical on every phone shape. Only the
horizontal crop varies.

Measured framing at the current rig (eye 1.24 m up, 0.95 m back, resting gaze 18
degrees down):

| Feature | Frame position |
|---|---|
| Partner's head | ~28% down |
| Far table edge | ~51% down |
| Board centre | ~64% down |
| Board near edge | ~91% down |
| Near table edge | ~94% down |

The resting gaze is pitched at the *players*, not at the table centre. Aiming
shallower pushes the near edge of the table down toward the bottom of the frame,
which is what gives the board its size on screen — an earlier 13-degree gaze left
the dominoes at roughly 45 px with unreadable pips.

**The flanking seats are deliberately off-screen.** At roughly 39 degrees off
axis they sit outside a portrait frustum that only covers about 20 degrees to
each side. The reference image shows all four players at once only because it
cheats with an impossible wide angle. Requiring a head-turn to read the players
beside you is the honest consequence of a phone-shaped view, and it is good for
the game: it makes *looking* a decision instead of a formality.

## The hand

Resolved from the reference image, which shows the hand twice:

- A **readable tap strip** along the bottom of the screen holds your tiles
  face-up and sorted. Tapping one selects it. This is the interaction surface —
  fast and legible on a phone. Tiles you cannot play are dimmed, and an action
  chip commits the play (`Jugar ▶` when there is one end, `◀ Izquierda` /
  `Derecha ▶` when there are two).
- **3D hands** in the scene carry the selected tile out and set it down. They
  are embodiment, not interface. At rest they sit forward of the near table
  edge — hands at a true seat position fall behind the strip and are never seen.

Tiles are pre-sorted rather than fumbled out of a physical fan: the tedium of
real dominoes stays out, the tactility stays in.

The other three players are read almost entirely from silhouette and where their
head is turned, because that is what you actually read off an opponent across a
small table. Each one looks at whoever is to move. Faces stay minimal: at this
distance eyes are a suggestion and the performance is in the posture.

## Board layout

The line of play **wraps and turns on the table** in a serpentine, the way it
does on a real table that size, rather than running as one straight line off the
edge. A cell-grid track owns legal tile positions and turns the line at the table
boundary; the two open ends are always addressable.

Three rules make it work, all found by tracing failures rather than by design:

- **Carry straight whenever there is room; turn only when forced.** Then head for
  the most open ground ahead, and only then away from the other end of the line.
  Distance from the other end alone is not enough — a turn can be far from the
  far end and still drive into a wall of its own line two rows later.
- **A double lies across the line and advances it one cell, not two.** It is also
  offered on *both* perpendicular sides, because only one of them clears the tile
  behind, and which one depends on where the line has got to.
- **Both ends grow in step.** The layout alternates left and right rather than
  laying one side out completely first, so the repulsion rule always has a real
  position to steer away from.

### The board is narrow and deep on purpose

A portrait frame is tall and narrow: the camera shows the full metre of table
depth but only about 0.7 m of width at board distance, and 0.5 m at the board's
near edge. So the grid spends its cells on **rows rather than columns**.

This is a real tension. Columns are what let a serpentine pass hold tiles, so a
narrow board needs more rows to finish a hand — 16 columns needs 23 rows where
18 needs 19, and 16 columns with fewer rows folds back on itself around 24 tiles.
Wide boards pass their tests and still look wrong, because two or three tiles
fall outside the frame on each side.

Even at 16 columns the board's near corners leave frame. That is unavoidable in
portrait and is answered in the interface rather than by resizing: **the two open
ends are highlighted**, so the player never has to hunt for the playable values,
and leaning in brings the detail closer.

**A tranca is always a late-game event.** The set holds seven 6s, so after a 6-6
lead six of them remain spread across three hands and somebody can always follow.
A blocked hand therefore only becomes possible once most of a value has been
played out. That fell out of building the M1 fixtures, and it is worth keeping:
the moment the board goes quiet is genuinely tense because it can only happen
deep into a hand.

## HUD

- **Top:** both team totals, the hand number, and whichever team is on turn lit
  up with the name of the seat actually thinking.
- **Bottom:** the tile strip, plus `PASAR` when you are stuck, `SEÑAS` always, and
  the placement chips when a tile is up.

## The partner

Two things make the 2v2 partnership real rather than decorative.

**Passes are proof.** Dominican dominoes deals the whole set and has no boneyard,
so a player who passes can never later acquire a tile. A pass is therefore
permanent proof of void in both open suits — and it is public information, so any
seat could work it out unaided. The bots use it to steer the line toward suits
the opposition cannot follow and away from suits their own partner cannot.

**Señas are claims.** `¡Échate!`, `Pásame`, `Tranca`, `¡Wepa!` — the canned calls
and the look across the table. Calling `pásame` tells your partner you are void in
the suits showing and they play as though you are. Nothing checks the claim
against your hand, and nothing should: a seña you cannot bluff is not a seña.
That is the whole reason they belong in the game.

A bot calls when it has something true to say — going void, or taking the hand —
and plays on what its partner has told it. It never calls on the strength of a
hand it cannot see.

## Audio

Fully synthesized, no files. **Bone on plastic is the signature sound** and the
one that has to be right: a `clack` whose weight scales with the tile's pips, and
which is loud for your own play, softer for the partner across the table, softer
again for the players beside you. A tile rattles when the hand is dealt, a
knuckle knocks on the table for a pass or a seña, and a knell marks the hand.

Underneath sits the shop: a merengue-flavoured loop — güira on the sixteenths,
tambora on the accents, a two-note bass — over a quiet room tone so the gaps
between notes are never actually silent. It is scheduled on a 16th-note grid with
a lookahead rather than driven from the game loop, so it stays steady regardless
of frame rate.

**Nothing plays until a real gesture.** Browsers keep an `AudioContext` suspended
until then, so the game is silently playable until the player first touches it.
There is a sound toggle in the HUD.

## Architecture

The rules engine is **pure and deterministic**: it takes actions and returns
state plus events, with no three.js import and no DOM. Each seat receives a
**filtered view** — its own hand plus public information only.

An AI seat implements `decide(view) -> action` locally with human-feeling pacing.
A remote human will later implement the same interface over a socket. The table
code never learns the difference.

This costs almost nothing to build now and is the difference between online play
being an addition later versus a rewrite. It also means the AI opponents
*structurally cannot* see your tiles.

## Milestones

| | Scope | State |
|---|---|---|
| **M0** | Scaffold: studio tooling, engine, portrait seated camera, blue table, colmado shell, screenshot pipeline | done |
| **M1** | Rules engine — pure, deterministic, headless-testable | done |
| **M2** | Serpentine board: wrapping tile track, legal positions, open ends | done |
| **M3** | The table: four characters, tap strip, 3D hands performing plays | done |
| **M4** | Seats and HUD: team scores, hand counter, señas, partner-aware AI | done |
| **M5** | The colmado: full interior dressing, lighting pass, synthesized audio | done |
| **M6** | QA: demo run, screenshot pass over every state, known-issues list | done |

Each milestone is verified by a screenshot that a model has actually looked at.
Only what a fresh capture proves gets claimed.

## Open questions

- Confirm the scoring rules above against house rules.
- Turn timer: 30 seconds, or none in solo?
- How much partner signalling to build — a small fixed vocabulary, or a richer
  set with a cooldown so it cannot be spammed?
- Should `SEÑAS` be visible to opponents (as at a real table, where a good player
  reads them) or private?
