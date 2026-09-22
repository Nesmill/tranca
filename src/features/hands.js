// The player's own hands.
//
// These are embodiment, not interface: the tiles are chosen in the DOM strip at
// the bottom of the screen, and the hands exist so the play happens to *you*
// rather than to an abstraction. They rest on the table edge, and when you commit
// a tile the right hand carries it out and sets it down.
//
// The rest pose sits well forward of the near table edge on purpose. Hands at a
// real seat position fall behind the hand strip and are never seen at all.

import * as THREE from 'three';
import { faceCanvas } from '../core/pips.js';

// --- Tuning constants ---------------------------------------------------
const SKIN = 0x7a4a2e;
const ARM_R = 0.046;
const HAND_R = 0.040;
const FINGER_R = 0.013;
const FINGER_LEN = 0.036;
const TILE_W = 0.084;
const TILE_H = 0.010;
const TILE_D = 0.042;

// Rest and working positions in world space, for the right hand. Set forward of
// the near table edge: hands at a true seat position fall behind the hand strip
// and are never seen, and any closer to the camera and they balloon.
const REST = { x: 0.145, y: 0.800, z: 0.34 };
const LEFT_REST = { x: -0.145, y: 0.800, z: 0.34 };
const HOVER_LIFT = 0.14; // how far above the table a carried tile rides

// Animation timing, seconds. Scaled by ANIM_SCALE so a QA capture can hold the
// hands mid-play long enough to photograph.
const ANIM_SCALE = Number.parseFloat(
  new URLSearchParams(location.search).get('anim') ?? '1',
) || 1;
const T_LIFT = 0.16 * ANIM_SCALE;
const T_TRAVEL = 0.30 * ANIM_SCALE;
const T_PLACE = 0.10 * ANIM_SCALE;
const T_RETURN = 0.34 * ANIM_SCALE;
const TOTAL = T_LIFT + T_TRAVEL + T_PLACE + T_RETURN;

const IDLE_SWAY = 0.004;
const IDLE_HZ = 0.3;
// -------------------------------------------------------------------------

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 2;

export default {
  name: 'hands',

  init(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'hands';
    this.time = 0;
    this.anim = null;
    this.lastEvent = null;
    this.disposables = [];

    const track = (o) => {
      this.disposables.push(o);
      return o;
    };

    const skin = track(new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 }));
    this.skinMat = skin;

    /** One arm: a forearm reaching up out of frame, ending in a hand. */
    const makeArm = (rest, mirror) => {
      const arm = new THREE.Group();

      // The elbow sits down and back, off the bottom of the frame, so the
      // forearm reads as entering the shot rather than floating.
      const elbow = new THREE.Vector3(rest.x * 1.9, rest.y - 0.26, rest.z + 0.42);
      const wrist = new THREE.Vector3(rest.x, rest.y, rest.z);
      const dir = new THREE.Vector3().subVectors(wrist, elbow);
      const len = dir.length() - ARM_R * 2;

      const forearm = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(ARM_R, Math.max(len, 0.02), 5, 12)),
        skin,
      );
      forearm.position.copy(elbow).add(wrist).multiplyScalar(0.5);
      forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      forearm.castShadow = true;
      arm.add(forearm);

      // Palm plus four fingers and a thumb: without fingers an ellipsoid reads
      // as a stone, and these are the hands the whole POV rests on.
      const hand = new THREE.Group();
      hand.position.copy(wrist);
      arm.add(hand);

      const palm = new THREE.Mesh(track(new THREE.SphereGeometry(HAND_R, 14, 12)), skin);
      palm.scale.set(1.2, 0.62, 1.3);
      palm.castShadow = true;
      hand.add(palm);

      const fingerGeo = track(new THREE.CapsuleGeometry(FINGER_R, FINGER_LEN, 4, 8));
      for (let i = 0; i < 4; i += 1) {
        const finger = new THREE.Mesh(fingerGeo, skin);
        const across = (i - 1.5) * FINGER_R * 2.3;
        finger.position.set(across, -0.004, HAND_R * 1.15);
        finger.rotation.x = Math.PI / 2;
        finger.rotation.z = mirror * across * 1.6;
        finger.castShadow = true;
        hand.add(finger);
      }
      const thumb = new THREE.Mesh(fingerGeo, skin);
      thumb.position.set(mirror * HAND_R * 1.15, -0.004, HAND_R * 0.5);
      thumb.rotation.set(Math.PI / 2.6, 0, mirror * 0.5);
      thumb.castShadow = true;
      hand.add(thumb);

      arm.position.set(0, 0, 0);
      return { arm, hand, rest };
    };

    this.right = makeArm({ ...REST }, 1);
    this.left = makeArm({ ...LEFT_REST }, -1);
    this.group.add(this.right.arm, this.left.arm);

    // The tile the right hand carries while making a play.
    const canvas = faceCanvas(6, 6, 128, 64);
    this.tileTexture = track(new THREE.CanvasTexture(canvas));
    this.tileTexture.colorSpace = THREE.SRGBColorSpace;
    this.tileMat = track(new THREE.MeshStandardMaterial({ map: this.tileTexture, roughness: 0.66 }));
    this.tileGeo = track(new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D));
    this.carried = new THREE.Mesh(this.tileGeo, this.tileMat);
    this.carried.visible = false;
    this.carried.castShadow = true;
    this.group.add(this.carried);

    // The face drawn on the carried tile changes per play, so the map is looked
    // up from a tiny cache rather than rebuilt.
    this.faces = new Map();
    this.faces.set('0-0', this.tileTexture);

    ctx.scene.add(this.group);
    ctx.log('hands: player arms ready');
  },

  /** Swap the carried tile's face to match the tile being played. */
  setCarriedFace(a, b) {
    const key = `${a}-${b}`;
    let tex = this.faces.get(key);
    if (!tex) {
      tex = new THREE.CanvasTexture(faceCanvas(a, b, 128, 64));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(tex);
      this.faces.set(key, tex);
    }
    this.carried.material = this.tileMat;
    this.tileMat.map = tex;
    this.tileMat.needsUpdate = true;
  },

  /** Start carrying a tile out to a world position. */
  beginPlacement(tile, target) {
    this.setCarriedFace(tile.a, tile.b);
    this.carried.visible = true;
    this.anim = {
      t: 0,
      target: { x: target.x, y: this.ctx.table.topY + TILE_H / 2, z: target.z },
      from: { ...REST },
    };
  },

  update(dt) {
    this.time += dt;

    // A new play by the player starts an animation. The board places tiles
    // before this runs, so the layout for the finished line is already up.
    const ev = this.ctx.game.lastEvent;
    if (ev !== this.lastEvent) {
      this.lastEvent = ev;
      if (ev?.type === 'played' && ev.seat === 0) {
        const placement = this.ctx.boardView.placements.find((p) => p.id === ev.tile.id);
        if (placement) this.beginPlacement(ev.tile, placement.center);
      } else if (ev?.type === 'handEnd' || ev?.type === 'dealt') {
        this.anim = null;
        this.carried.visible = false;
      }
    }

    const sway = Math.sin(this.time * IDLE_HZ * Math.PI * 2) * IDLE_SWAY;
    const right = this.right.hand;
    const left = this.left.hand;

    if (!this.anim) {
      right.position.set(this.right.rest.x + sway, this.right.rest.y, this.right.rest.z);
      left.position.set(this.left.rest.x - sway, this.left.rest.y, this.left.rest.z);
      this.carried.visible = false;
      return;
    }

    // lift -> travel -> set down -> withdraw
    const a = this.anim;
    a.t = Math.min(a.t + dt, TOTAL);
    const t = a.t;
    const from = a.from;
    const to = a.target;
    let px;
    let py;
    let pz;
    let lift;

    if (t < T_LIFT) {
      const k = easeOut(t / T_LIFT);
      px = from.x;
      py = from.y + HOVER_LIFT * k;
      pz = from.z;
      lift = HOVER_LIFT * k;
    } else if (t < T_LIFT + T_TRAVEL) {
      const k = easeInOut((t - T_LIFT) / T_TRAVEL);
      px = from.x + (to.x - from.x) * k;
      py = from.y + HOVER_LIFT + (to.y + HAND_R * 0.6 - from.y - HOVER_LIFT) * k;
      pz = from.z + (to.z - from.z) * k;
      lift = py - to.y;
    } else if (t < T_LIFT + T_TRAVEL + T_PLACE) {
      const k = easeOut((t - T_LIFT - T_TRAVEL) / T_PLACE);
      px = to.x;
      py = to.y + HAND_R * 0.6 + (HAND_R * 0.1) * (1 - k);
      pz = to.z;
      lift = py - to.y;
      // The tile is released as the hand sets down.
      this.carried.visible = k < 0.75;
    } else {
      const k = easeInOut((t - T_LIFT - T_TRAVEL - T_PLACE) / T_RETURN);
      px = to.x + (from.x - to.x) * k;
      py = to.y + HAND_R * 0.6 + (from.y - to.y - HAND_R * 0.6) * k;
      pz = to.z + (from.z - to.z) * k;
      lift = py - to.y;
    }

    right.position.set(px, py, pz);
    left.position.set(this.left.rest.x - sway, this.left.rest.y, this.left.rest.z);

    // The carried tile rides just under the hand, flat.
    this.carried.position.set(px, this.ctx.table.topY + TILE_H / 2 + Math.max(lift - HAND_R * 0.7, 0), pz);
    this.carried.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + Math.PI / 2;

    if (t >= TOTAL) {
      this.anim = null;
      this.carried.visible = false;
    }
  },

  dispose() {
    this.group?.parent?.remove(this.group);
    for (const o of this.disposables ?? []) o.dispose?.();
    this.disposables = [];
    this.faces?.clear();
    this.group = null;
    this.ctx = null;
  },
};
