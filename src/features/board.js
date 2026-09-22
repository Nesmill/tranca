// The board: renders the line of play on the table.
//
// Every face is drawn into a canvas at boot, so there is no asset file: seven
// pip patterns cover the whole double-six set, and each tile's top face is a
// two-pip texture composed from them. The geometry and materials are created
// once and pooled across all 28 tiles.

import * as THREE from 'three';
import { createTrack } from '../core/track.js';
import { drawFace } from '../core/pips.js';

// --- Tuning constants ---------------------------------------------------
const BONE_TILE = 0xe8e0d0;
// Fraction of its cell footprint a tile covers. Length sits at ~1 so tiles in
// the line actually touch — 0.94 everywhere left visible joints and the line
// read as scattered. Width keeps its inset so a turning pair stays distinct.
const TILE_FILL_LEN = 0.99;
const TILE_FILL_W = 0.94;
const TILE_HEIGHT = 0.009;
const TOP_LIFT = 0.0006; // keep the face just clear of the body
const FACE_PX = 128;
const POOL = 28;

// Open-end markers: a flat ring on the table under each live end of the line.
// Sized to about one cell across, so it reads as marking a slot rather than
// drawing a circle around the table.
const RING_INNER = 0.020;
const RING_OUTER = 0.031;
const RING_LIFT = 0.0012;
const RING_IDLE = 0xd8ecff; // any end, when it is not your decision (icy on the blue field)
const RING_LIVE = 0xffd34d; // an end the selected tile can actually go on
const PULSE_HZ = 1.6;
// Opponent placement: a tile nobody carried out falls the last few centimetres
// and settles, so a bot's play lands instead of appearing. The player's own
// tile is skipped — the hands module already carries that one out.
const DROP_H = 0.055;
const DROP_TIME = 0.32;
// -------------------------------------------------------------------------

/** Draw the top face of a tile showing `left` pips then `right` pips. */
function makeFaceTexture(left, right) {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_PX;
  canvas.height = FACE_PX / 2;
  drawFace(canvas.getContext('2d'), 0, 0, canvas.width, canvas.height, left, right);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export default {
  name: 'board',

  init(ctx) {
    this.ctx = ctx;
    this.track = createTrack();
    this.group = new THREE.Group();
    this.group.name = 'board';

    const cell = this.track.grid.cell;
    const length = cell * 2 * TILE_FILL_LEN;
    const width = cell * TILE_FILL_W;

    this.bodyGeo = new THREE.BoxGeometry(length, TILE_HEIGHT, width);
    this.faceGeo = new THREE.PlaneGeometry(length, width);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: BONE_TILE,
      roughness: 0.72,
      metalness: 0.0,
    });

    this.faces = new Map(); // "a-b" -> material, built on demand
    this.tiles = [];
    for (let i = 0; i < POOL; i += 1) {
      const body = new THREE.Mesh(this.bodyGeo, this.bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;

      const face = new THREE.Mesh(this.faceGeo, null);
      face.rotation.x = -Math.PI / 2;
      face.position.y = TILE_HEIGHT / 2 + TOP_LIFT;

      const tile = new THREE.Group();
      tile.add(body, face);
      tile.visible = false;
      this.group.add(tile);
      // `drop` counts down the settle of a tile that fell in; 0 is at rest.
      this.tiles.push({ root: tile, face, drop: 0 });
    }

    this.baseY = ctx.table.topY + TILE_HEIGHT / 2;
    this.lastIds = new Set(); // ids on the table last place(), to spot new ones
    // QA hook: `?droptime=<seconds>` stretches the settle so a headless capture
    // can catch a tile mid-drop.
    const dropRaw = Number.parseFloat(ctx.params.droptime ?? '');
    this.dropTime = Number.isFinite(dropRaw) && dropRaw > 0 ? dropRaw : DROP_TIME;

    // Two flat rings that sit on the table under the live ends of the line.
    this.ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 32);
    this.rings = [];
    for (let i = 0; i < 2; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: RING_IDLE,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(this.ringGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = this.ctx.table.topY + RING_LIFT;
      ring.visible = false;
      this.group.add(ring);
      this.rings.push(ring);
    }
    this.pulse = 0;

    ctx.scene.add(this.group);
    this.signature = '';
    ctx.log(`board: ${POOL} tiles, grid ${this.track.grid.columns}x${this.track.grid.rows}`);
  },

  /** Face material for an ordered pip pair, built once and reused. */
  faceFor(left, right) {
    const key = `${left}-${right}`;
    let mat = this.faces.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        map: makeFaceTexture(left, right),
        roughness: 0.66,
      });
      this.faces.set(key, mat);
    }
    return mat;
  },

  update(dt) {
    const line = this.ctx.game.boardLine();
    // Only rebuild when the line actually changes.
    const signature = line
      .map((t) => `${t.id}${t.flipped ? 'f' : ''}${t.start ? 's' : ''}`)
      .join(',');
    if (signature !== this.signature) {
      this.signature = signature;
      this.place(line);
    }
    this.settle(dt);
    this.updateEnds(line, dt);
  },

  /** Position every placed tile, and remember the layout for the end markers. */
  place(line) {
    const placements = this.track.layout(line);
    this.placements = placements;
    this.ctx.boardView.placements = placements;

    for (let i = 0; i < this.tiles.length; i += 1) {
      const slot = this.tiles[i];
      const p = placements[i];
      if (!p) {
        slot.root.visible = false;
        slot.drop = 0;
        continue;
      }
      slot.root.visible = true;
      slot.root.position.set(p.center.x, this.baseY, p.center.z);
      slot.root.rotation.y = p.angle;
      slot.face.material = this.faceFor(p.pips[0], p.pips[1]);

      // A tile that was not on the table last time and was not carried out by
      // the player's hand drops in from just above its spot.
      const entry = line[i];
      if (!this.lastIds.has(p.id) && entry && entry.by !== 0 && slot.drop <= 0) {
        slot.drop = this.dropTime;
      }
    }

    this.lastIds.clear();
    for (const p of placements) if (p) this.lastIds.add(p.id);

    if (placements.stalled) this.ctx.log(`board: ${placements.stalled} tile(s) overflowed`);
    this.ctx.log(`board: ${placements.length} tiles on the table`);
  },

  /**
   * Advance every tile still settling. Slots carry their own countdown, so a
   * burst of plays allocates nothing and each drop is independent.
   */
  settle(dt) {
    for (const slot of this.tiles) {
      if (slot.drop <= 0) continue;
      slot.drop = Math.max(0, slot.drop - dt);
      const k = 1 - slot.drop / this.dropTime;
      const ease = 1 - (1 - k) * (1 - k); // arrives softly, like a tile set down
      slot.root.position.y = this.baseY + DROP_H * (1 - ease);
    }
  },

  /**
   * Mark the two live ends of the line.
   *
   * The board is wider than a portrait frame's near edge, so a player cannot
   * always see both ends at once. These rings are how they find the playable
   * values without hunting: gold means the tile in hand can go there, a cool
   * blue means it is an end but not a legal one, and everything fades when it
   * is somebody else's turn.
   *
   * A marker always sits one cell along the end tile's own outward heading,
   * which lands on the tile's outer half whether it is inline or lying across.
   */
  updateEnds(line, dt) {
    this.pulse += dt;
    const beat = 0.5 + 0.5 * Math.sin(this.pulse * PULSE_HZ * Math.PI * 2);

    const marks = [];
    if (line.length > 0 && this.placements?.length === line.length) {
      const right = this.placements[line.length - 1];
      const left = this.placements[0];
      marks.push({ side: 'right', cell: [right.cells[0][0] + right.grid.dx, right.cells[0][1] + right.grid.dy] });
      if (line.length === 1) {
        // The opening tile is both ends; its heading only points right.
        marks.push({ side: 'left', cell: [left.cells[0][0] - left.grid.dx, left.cells[0][1] - left.grid.dy] });
      } else {
        marks.push({ side: 'left', cell: [left.cells[0][0] + left.grid.dx, left.cells[0][1] + left.grid.dy] });
      }
    }

    const game = this.ctx.game;
    const toMove = game.playerToMove();
    const ends = game.selectedEnds();
    const choosing = game.selected !== null && ends.length > 0;

    for (let i = 0; i < this.rings.length; i += 1) {
      const ring = this.rings[i];
      const mark = marks[i];
      if (!mark) {
        ring.visible = false;
        continue;
      }
      const world = this.track.cellToWorld(mark.cell[0], mark.cell[1]);
      ring.visible = true;
      ring.position.x = world.x;
      ring.position.z = world.z;

      const isLive = choosing && ends.includes(mark.side);
      if (isLive) {
        ring.material.color.setHex(RING_LIVE);
        ring.material.opacity = 0.55 + 0.45 * beat;
      } else if (toMove) {
        ring.material.color.setHex(RING_IDLE);
        ring.material.opacity = choosing ? 0.12 : 0.4 + 0.25 * beat;
      } else {
        ring.material.color.setHex(RING_IDLE);
        ring.material.opacity = 0.14;
      }
    }
  },

  dispose() {
    this.group?.parent?.remove(this.group);
    this.bodyGeo?.dispose();
    this.faceGeo?.dispose();
    this.bodyMat?.dispose();
    this.ringGeo?.dispose();
    for (const ring of this.rings ?? []) ring.material.dispose();
    this.rings = [];
    for (const mat of this.faces?.values() ?? []) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.faces?.clear();
    this.tiles = [];
    this.lastIds?.clear();
    this.ctx = null;
  },
};
