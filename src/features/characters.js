// The three opponents, as 2.5D sprite billboards.
//
// This is the 2.5D half of the renderer. The table and the dominoes are real 3D
// so tiles cast real shadows and land in perspective; the people are flat sprite
// layers that always face the camera. That works because the camera is a seated
// player who only turns their head -- a billboard breaks the moment you orbit
// around it, and we never do.
//
// Sprites were cut from generated character sheets by studio/sprites.py, which
// normalises every pose to the same head width and anchors them on the head.
// Because of that, all three characters can share one world size and one head
// height here, and the poses line up without per-sprite offsets.

import * as THREE from 'three';
import { SEATS } from '../core/layout.js';

// --- Tuning constants ---------------------------------------------------
// Pose index in the sheet, 1-based, in the order the sheets were generated.
const POSE = { IDLE: 1, THINK: 2, PLAY: 3, ANNOYED: 4, LAUGH: 5, SHRUG: 6 };

// Head width in the cut sprite is 150px out of a 512px canvas, and sprites.py
// normalises every pose and every character to that. Sizing the plane in world
// metres therefore sizes every head identically.
const CANVAS_M = 0.55; // world size of one 512px sprite canvas
const HEAD_TOP_Y = 1.19; // where the top of a head sits, metres
const ANCHOR_FRAC = 0.14; // the anchor line sprites.py places heads on
const SPRITE_Y = HEAD_TOP_Y - (0.5 - ANCHOR_FRAC) * CANVAS_M;

const HOLD_SECONDS = 1.1; // how long a reaction pose stays up
const PLATE_Y = 1.26; // world height the name plate floats at
const MIN_PLATE_Y = 96; // screen px floor, so no plate hides behind the score pill

// Flags are drawn in CSS. Emoji flags do not render on Windows at all, and a
// simplified flag beats a missing one.
const STYLE_ID = 'plate-style';
const CSS = `
.plate {
  position: absolute; left: 0; top: 0;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 9px 5px; border-radius: 10px;
  background: rgba(14,10,7,0.78);
  border: 1px solid rgba(240,230,210,0.16);
  box-shadow: 0 3px 10px rgba(0,0,0,0.5);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: nowrap; pointer-events: none;
  transition: opacity 200ms ease;
}
.plate.is-turn { border-color: rgba(240,198,90,0.75); background: rgba(30,20,8,0.88); }
.plate-top { display: flex; align-items: center; gap: 5px; }
.plate-flag { width: 19px; height: 13px; border-radius: 2px; flex: 0 0 auto;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35); }
.flag-do {
  background:
    linear-gradient(90deg, transparent 42%, #fff 42% 58%, transparent 58%),
    linear-gradient(180deg, transparent 38%, #fff 38% 62%, transparent 62%),
    linear-gradient(90deg, #002d62 50%, #ce1126 50%);
}
.flag-pr {
  background:
    linear-gradient(90deg, #002d62 0 36%, transparent 36%),
    linear-gradient(180deg, #ce1126 0 20%, #fff 20% 40%, #ce1126 40% 60%, #fff 60% 80%, #ce1126 80%);
}
.flag-cu {
  background:
    linear-gradient(90deg, #cf142b 0 34%, transparent 34%),
    linear-gradient(180deg, #002a8f 0 20%, #fff 20% 40%, #002a8f 40% 60%, #fff 60% 80%, #002a8f 80%);
}
.plate-name { font-size: 11px; font-weight: 700; color: #f4ead8; letter-spacing: 0.02em; }
.plate-count { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #b0a48c; }
.plate.is-turn .plate-count { color: #f0c65a; }
`;
// -------------------------------------------------------------------------

/** Which sprite set sits in which chair, and who they are. */
const CAST = [
  { seat: 1, set: 'lanegrita', flag: 'do' },
  { seat: 2, set: 'elbori', flag: 'pr' },
  { seat: 3, set: 'eltigre', flag: 'do' },
];

// Dominican-flavoured handles in the style of a real lobby: ElBori23, Chino_27.
const PREFIX = ['El', 'La', ''];
const NICK = [
  'Bori', 'Chino', 'Negro', 'Negra', 'Flaco', 'Gordo', 'Tigre', 'Sombra',
  'Trueno', 'Maestro', 'Jefe', 'Pantera', 'Rubio', 'Moreno', 'Picante', 'Rey',
  'Reina', 'Duende', 'Fantasma', 'Cangri',
];

/**
 * A random lobby handle.
 * @param {object} rng Seeded random source.
 * @returns {string} e.g. `ElTigre_14`, `LaSombra_07`.
 */
function makeHandle(rng) {
  const n = rng.int(2, 89);
  return `${rng.pick(PREFIX)}${rng.pick(NICK)}_${String(n).padStart(2, '0')}`;
}

export default {
  name: 'characters',

  init(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'characters';
    this.people = [];
    this.textures = new Map();
    this.loaded = 0;
    this.expected = CAST.length * Object.keys(POSE).length;
    this.time = 0;
    this.projected = new THREE.Vector3();

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    const loader = new THREE.TextureLoader();

    for (const entry of CAST) {
      const seat = SEATS[entry.seat];
      const person = {
        seat: entry.seat,
        label: makeHandle(ctx.rng),
        set: entry.set,
        pose: POSE.IDLE,
        hold: 0,
        wasTurn: false,
        lastEvent: null,
        sprites: {},
      };

      // The name plate. Positioned every frame from the projected seat, so it
      // tracks the character and stays put in the scene rather than the HUD.
      const plate = document.createElement('div');
      plate.className = 'plate';
      plate.innerHTML =
        `<div class="plate-top"><span class="plate-flag flag-${entry.flag}"></span>` +
        `<span class="plate-name">${person.label}</span></div>` +
        '<div class="plate-count"></div>';
      ctx.hud.appendChild(plate);
      person.plate = plate;
      person.countEl = plate.querySelector('.plate-count');
      person.countSig = '';

      for (const [name, index] of Object.entries(POSE)) {
        const url = `./assets/characters/${entry.set}-${index}.png`;
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            this.textures.set(url, tex);
            person.sprites[name] = tex;
            this.loaded += 1;
            if (this.loaded === this.expected) ctx.log(`characters: ${this.loaded} sprites loaded`);
          },
          undefined,
          () => {
            // Fail loud but keep the game up: a missing sprite should not blank
            // the table, but it must not pass silently either.
            this.loaded += 1;
            ctx.log(`characters: MISSING ${url}`);
          },
        );
      }

      const material = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false, // the table must be able to cut the body off
        alphaTest: 0.04,
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(CANVAS_M, CANVAS_M, 1);
      sprite.position.set(seat.pos[0], SPRITE_Y, seat.pos[2]);
      sprite.visible = false;
      this.group.add(sprite);

      person.sprite = sprite;
      this.people.push(person);
    }

    ctx.scene.add(this.group);
    ctx.log(`characters: ${this.people.map((p) => p.label).join(', ')}`);
  },

  /** Choose the pose a seat should be wearing right now. */
  poseFor(person) {
    const game = this.ctx.game;
    const phase = game.phase;

    if (phase === 'handEnd' || phase === 'matchEnd') {
      const won = game.result?.winningSeat === person.seat;
      return won ? POSE.LAUGH : POSE.ANNOYED;
    }
    if (phase !== 'playing') return POSE.IDLE;

    // A reaction to this seat's own last action outranks whose turn it is.
    const ev = game.lastEvent;
    if (ev && ev.seat === person.seat && this.time - (person.reactedAt ?? -99) < HOLD_SECONDS) {
      if (ev.type === 'played') return POSE.PLAY;
      if (ev.type === 'passed') return POSE.SHRUG;
    }

    if (game.turn === person.seat) return POSE.THINK;
    return POSE.IDLE;
  },

  update(dt) {
    this.time += dt;
    const game = this.ctx.game;
    const canvas = this.ctx.renderer.domElement;
    const vw = canvas.clientWidth || 1;
    const vh = canvas.clientHeight || 1;

    for (const person of this.people) {
      // Note when this seat acts, so the reaction pose gets its moment.
      const ev = game.lastEvent;
      if (ev !== person.lastEvent) {
        person.lastEvent = ev;
        if (ev && ev.seat === person.seat) person.reactedAt = this.time;
      }

      const wanted = this.poseFor(person);
      if (wanted !== person.pose) {
        person.pose = wanted;
        person.hold = 0;
      }

      const tex = person.sprites[Object.keys(POSE).find((k) => POSE[k] === person.pose)];
      if (!tex) {
        person.sprite.visible = false;
      } else {
        person.sprite.visible = true;
        if (person.sprite.material.map !== tex) {
          person.sprite.material.map = tex;
          person.sprite.material.needsUpdate = true;
        }
        // A small breath so a still sprite does not read as a frozen image.
        person.sprite.position.y = SPRITE_Y + Math.sin(this.time * 0.6 + person.seat) * 0.006;
      }

      // Float the plate over the character's head, in screen space.
      //
      // Clamped to a minimum screen height. The centre seat sits directly under
      // the score pill at x=0, so an unclamped plate vanishes behind it; the
      // clamp pushes any colliding plate down to just clear the pill, which
      // keeps all three readable without moving the pill off centre.
      const seat = SEATS[person.seat];
      this.projected.set(seat.pos[0], PLATE_Y, seat.pos[2]).project(this.ctx.camera);
      const behind = this.projected.z > 1;
      const x = (this.projected.x * 0.5 + 0.5) * vw;
      const y = Math.max((-this.projected.y * 0.5 + 0.5) * vh, MIN_PLATE_Y);
      person.plate.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      person.plate.style.opacity = behind ? '0' : '1';

      // Tile count, and whether it is this seat's turn.
      const remaining = game.view(0).handCounts[person.seat] ?? 0;
      const sig = `${remaining}|${game.turn === person.seat}|${game.phase}`;
      if (sig !== person.countSig) {
        person.countSig = sig;
        person.countEl.textContent = `${remaining} ficha${remaining === 1 ? '' : 's'}`;
        person.plate.classList.toggle('is-turn', game.turn === person.seat && game.phase === 'playing');
      }
    }
  },

  dispose() {
    this.group?.parent?.remove(this.group);
    for (const tex of this.textures?.values() ?? []) tex.dispose();
    for (const person of this.people ?? []) {
      person.sprite?.material?.dispose();
      person.plate?.remove();
    }
    this.style?.remove();
    this.textures?.clear();
    this.people = [];
    this.group = null;
    this.ctx = null;
  },
};

export { makeHandle };
