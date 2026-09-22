// The three opponents as 3D figures built from primitives.
//
// This is the original cast restored: a cream head with dot eyes and a small
// brown mouth, a white puffy torso, and brown capsule arms ending in rounded
// hands resting on the table lip — the construction the table had before the
// 2.5D sprite billboards (`characters.js`, still reachable with `?cast=sprites`).
//
// What makes them read as players rather than props is the head turn: every
// figure eases its gaze toward whoever is to move, so the table itself says
// whose turn it is — when it is your turn all three are looking at you.
// Faces sit on +z and the group's yaw (from SEATS) turns +z toward the table
// centre, so aiming +z at a target aims the face.

import * as THREE from 'three';
import { SEATS, SEAT_HEAD_Y, TABLE } from '../core/layout.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// --- Tuning constants ---------------------------------------------------
const HEAD_R = 0.088; // head top lands on SEAT_HEAD_Y (1.15)
const NECK_Y = 0.985; // where the head group pivots
const HEAD_CY = 0.085; // head centre above the pivot
const TORSO_R = 0.115;
const TORSO_LEN = 0.16;
const TORSO_Y = 0.80;
const ARM_R = 0.042;
const HAND_R = 0.038;
const EYE_R = 0.012;
const EYE_X = 0.032;
const EYE_Y = 0.016; // relative to the head centre
const EYE_Z = 0.078;
const MOUTH_R = 0.026;
const MOUTH_Y = -0.030;
const MOUTH_Z = 0.080;
const SHOULDER_X = 0.125;
const SHOULDER_Y = 0.945;
const SHOULDER_Z = 0.02;
const HAND_X = SHOULDER_X + 0.045;
const HAND_Y = 0.782; // resting on the table lip
const HAND_Z = 0.24; // forward of the seat, onto the table edge

const HEAD_COLOR = 0xf2e7cf; // the cream head
const SHIRT_COLOR = 0xf4eee2; // white puffy shirt
const LIMB_COLOR = 0x7a4a2e; // brown arms — matches the player's own hands
const EYE_COLOR = 0x14100c;
const MOUTH_COLOR = 0x8a5a3b;

// Gaze clamps (radians): a neck does not swivel forever.
const MAX_YAW = 1.1;
const PITCH_DOWN = 0.5;
const PITCH_UP = 0.4;
const LOOK_SMOOTH = 7;
const BREATH_HZ = 0.55;
// -------------------------------------------------------------------------

const STYLE_ID = 'seats-style';
const CSS = `
.plate {
  position: absolute; left: 0; top: 0;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 9px 5px; border-radius: 10px;
  background: rgba(14,10,7,0.78);
  border: 1px solid rgba(240,230,210,0.16);
  box-shadow: 0 3px 10px rgba(0,0,0,0.5);
  font-family: system-ui, sans-serif;
  white-space: nowrap; pointer-events: none;
  transition: opacity 200ms ease, border-color 200ms ease, background 200ms ease;
}
.plate.is-turn { border-color: rgba(240,198,90,0.75); background: rgba(30,20,8,0.88); }
.plate-name { font-size: 11px; font-weight: 700; color: #f4ead8; letter-spacing: 0.02em; }
.plate-count { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #b0a48c; }
.plate.is-turn .plate-count { color: #f0c65a; }
`;

// The plate floats clear of the head top (1.15 m) without hiding behind the
// score pill; MIN_PLATE_Y is the same screen-space floor the sprite cast used.
const PLATE_Y = 1.26;
const MIN_PLATE_Y = 96;

// The generated cast (assets/characters3d/): rigged, retargeted Tripo models,
// meshopt-compressed and texture-shrunk for the web. Each GLB is 1.0 unit
// tall with its origin at the feet and its forward on +X (see the manifest).
// The exports measure ~0.7 units tall (the manifest's "height 1.0" is wrong;
// measured from screenshots: 1.18 left only the crown over the table rim).
// 1.75 puts the head top just above the rim, legs hidden by the table.
const GLB_SCALE = 1.75;
const BODY_YAW_MAX = 0.5; // a body turns toward the action less than a head does
const glbName = (label) => label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default {
  name: 'seats',

  init(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'seats';
    this.people = [];
    this.time = 0;
    this.projected = new THREE.Vector3();
    this.look = new THREE.Vector3();

    this.style = document.createElement('style');
    this.style.id = STYLE_ID;
    this.style.textContent = CSS;
    document.head.appendChild(this.style);

    // Shared parts: one geometry and one material per part type across all
    // three figures.
    this.geo = {
      head: new THREE.SphereGeometry(HEAD_R, 24, 18),
      torso: new THREE.CapsuleGeometry(TORSO_R, TORSO_LEN, 6, 16),
      hand: new THREE.SphereGeometry(HAND_R, 14, 12),
      eye: new THREE.SphereGeometry(EYE_R, 10, 8),
      mouth: new THREE.TorusGeometry(MOUTH_R, 0.006, 8, 20, 2.2),
      neck: new THREE.CylinderGeometry(0.038, 0.045, 0.06, 12),
    };
    // Arc centred on the bottom: a small smile.
    this.geo.mouth.rotateZ(3 * Math.PI / 2 - 2.2 / 2);
    this.mat = {
      head: new THREE.MeshStandardMaterial({ color: HEAD_COLOR, roughness: 0.6 }),
      shirt: new THREE.MeshStandardMaterial({ color: SHIRT_COLOR, roughness: 0.72 }),
      limb: new THREE.MeshStandardMaterial({ color: LIMB_COLOR, roughness: 0.7 }),
      eye: new THREE.MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.5 }),
      mouth: new THREE.MeshStandardMaterial({ color: MOUTH_COLOR, roughness: 0.6 }),
    };

    // The arm runs shoulder → table lip; every figure is built the same, so
    // the capsule and its placement are measured once and shared.
    const shoulder = new THREE.Vector3(SHOULDER_X, SHOULDER_Y, SHOULDER_Z);
    const wrist = new THREE.Vector3(HAND_X, HAND_Y, HAND_Z);
    const armDir = new THREE.Vector3().subVectors(wrist, shoulder);
    const armLen = Math.max(armDir.length() - ARM_R * 2, 0.05);
    this.geo.arm = new THREE.CapsuleGeometry(ARM_R, armLen, 6, 12);
    const armMid = new THREE.Vector3().copy(shoulder).add(wrist).multiplyScalar(0.5);
    const armQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      armDir.clone().normalize(),
    );
    // The mirrored arm is the same capsule with x flipped in position and the
    // direction mirrored, which is its own unit quaternion.
    const armDirL = new THREE.Vector3(-armDir.x, armDir.y, armDir.z);
    const armQuatL = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      armDirL.normalize(),
    );

    for (let seatIndex = 1; seatIndex < SEATS.length; seatIndex += 1) {
      const seat = SEATS[seatIndex];
      const figure = new THREE.Group();
      figure.position.set(seat.pos[0], 0, seat.pos[2]);
      figure.rotation.y = seat.yaw; // model faces +z; yaw turns +z to the table

      // Torso: a puffy shirt — wider than deep; the table hides its lower half.
      const torso = new THREE.Mesh(this.geo.torso, this.mat.shirt);
      torso.position.y = TORSO_Y;
      torso.scale.set(1.15, 1, 0.85);
      torso.castShadow = true;
      figure.add(torso);

      for (const side of [1, -1]) {
        const arm = new THREE.Mesh(this.geo.arm, this.mat.limb);
        arm.position.set(side * armMid.x, armMid.y, armMid.z);
        arm.quaternion.copy(side === 1 ? armQuat : armQuatL);
        arm.castShadow = true;
        figure.add(arm);

        const hand = new THREE.Mesh(this.geo.hand, this.mat.limb);
        hand.position.set(side * HAND_X, HAND_Y, HAND_Z);
        hand.scale.set(1.25, 0.7, 1.35);
        hand.castShadow = true;
        figure.add(hand);
      }

      // Neck and head. The head group is what turns: everything inside it is
      // arranged on +z, so aiming +z at a target aims the face.
      const neck = new THREE.Mesh(this.geo.neck, this.mat.head);
      neck.position.y = NECK_Y - 0.03;
      figure.add(neck);

      const head = new THREE.Group();
      head.position.y = NECK_Y;
      head.rotation.order = 'YXZ';
      const skull = new THREE.Mesh(this.geo.head, this.mat.head);
      skull.position.y = HEAD_CY;
      skull.castShadow = true;
      head.add(skull);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(this.geo.eye, this.mat.eye);
        eye.position.set(side * EYE_X, HEAD_CY + EYE_Y, EYE_Z);
        eye.scale.set(1, 1.15, 0.6);
        head.add(eye);
      }
      const mouth = new THREE.Mesh(this.geo.mouth, this.mat.mouth);
      mouth.position.set(0, HEAD_CY + MOUTH_Y, MOUTH_Z);
      head.add(mouth);
      figure.add(head);

      // Name plate: the real seat name (matching the score bar), tile count,
      // and the gold is-turn highlight. The sprite cast's random lobby handles
      // went with it — a chair and a name have to agree across the HUD.
      const plate = document.createElement('div');
      plate.className = 'plate';
      plate.innerHTML =
        `<span class="plate-name">${seat.label}</span>` +
        '<span class="plate-count"></span>';
      ctx.hud.appendChild(plate);

      this.group.add(figure);
      this.people.push({
        seat: seatIndex,
        figure,
        head,
        torso,
        plate,
        countEl: plate.querySelector('.plate-count'),
        countSig: '',
        yaw: 0,
        pitch: 0,
        phase: seatIndex * 1.7,
        baseYaw: seat.yaw,
        model: null,
        mixer: null,
        // The head's world position never moves: the group only rotates
        // about y, which leaves the pivot's (x, y, z) exactly where it is.
        headWorld: new THREE.Vector3(seat.pos[0], NECK_Y, seat.pos[2]),
      });
    }

    ctx.scene.add(this.group);
    ctx.log(`seats: ${this.people.map((p) => SEATS[p.seat].label).join(', ')} seated`);

    // The generated cast swaps in for each stand-in as its GLB arrives;
    // `?cast=primitives` keeps the built figures. A failed load leaves the
    // stand-in in place — the table never waits on the network.
    if (ctx.params.cast !== 'primitives') {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      for (const person of this.people) {
        const name = glbName(SEATS[person.seat].label);
        const url = `assets/characters3d/${name}/${name}-web.glb`;
        loader.load(
          url,
          (gltf) => this.installGlb(person, gltf),
          undefined,
          (err) => ctx.log(`seats: ${name} GLB failed (${err?.message ?? err}); keeping the stand-in`),
        );
      }
    }
  },

  /**
   * Ease every head toward whoever is to move.
   *
   * The target is the active seat's head — or the player's camera for seat 0 —
   * brought into each figure's own frame, clamped like a neck and eased so
   * heads swivel rather than snap. When a figure itself is to move it studies
   * the centre of the table instead.
   */
  gaze(dt) {
    const game = this.ctx.game;
    const active = game.turn;
    const smooth = 1 - Math.exp(-LOOK_SMOOTH * dt);
    let tx;
    let ty;
    let tz;

    for (const person of this.people) {
      if (active === person.seat) {
        // It is this figure's move: study the board.
        tx = 0;
        ty = TABLE.topY;
        tz = 0;
      } else if (active === 0) {
        this.ctx.camera.getWorldPosition(this.projected);
        tx = this.projected.x;
        ty = this.projected.y;
        tz = this.projected.z;
      } else {
        const s = SEATS[active];
        tx = s.pos[0];
        ty = SEAT_HEAD_Y;
        tz = s.pos[2];
      }

      const p = person.headWorld;
      this.look.set(tx - p.x, ty - p.y, tz - p.z);

      // Into the figure's own frame (the group only rotates about y).
      const th = person.figure.rotation.y;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const lx = this.look.x * cos - this.look.z * sin;
      const lz = this.look.x * sin + this.look.z * cos;
      const ly = this.look.y;

      let wantYaw = Math.atan2(lx, lz);
      let wantPitch = Math.atan2(-ly, Math.hypot(lx, lz));

      if (person.model) {
        // The generated cast turns the whole body toward the action.
        wantYaw = Math.max(-BODY_YAW_MAX, Math.min(BODY_YAW_MAX, wantYaw));
        person.yaw += (wantYaw - person.yaw) * smooth;
        person.figure.rotation.y = person.baseYaw + person.yaw;
        continue;
      }

      wantYaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, wantYaw));
      wantPitch = Math.max(-PITCH_UP, Math.min(PITCH_DOWN, wantPitch));

      person.yaw += (wantYaw - person.yaw) * smooth;
      person.pitch += (wantPitch - person.pitch) * smooth;
      person.head.rotation.set(person.pitch, person.yaw, 0);
    }
  },

  /** Swap a generated character in for its primitive stand-in. */
  installGlb(person, gltf) {
    const model = gltf.scene;
    for (const child of person.figure.children) child.visible = false;
    model.scale.setScalar(GLB_SCALE);
    // Model forward is +X (measured ankle-to-toe in the manifest); the
    // figure's +Z faces the table, so -90 lines the face up with it.
    model.rotation.y = -Math.PI / 2;
    model.traverse((o) => {
      // Their shadows fall behind the table where nobody sees them.
      if (o.isMesh) o.castShadow = false;
    });
    person.figure.add(model);
    person.model = model;

    // The exports are one-shots: looping has to be asked for explicitly.
    const clips = gltf.animations ?? [];
    const idle = clips.find((c) => /idle/i.test(c.name)) ?? clips[0];
    if (idle) {
      person.mixer = new THREE.AnimationMixer(model);
      const action = person.mixer.clipAction(idle);
      action.setLoop(THREE.LoopRepeat);
      action.play();
    }
    this.ctx.log(`seats: ${SEATS[person.seat].label} is in (clips: ${clips.map((c) => c.name).join(', ') || 'none'})`);
  },

  update(dt) {
    this.time += dt;
    const game = this.ctx.game;
    const canvas = this.ctx.renderer.domElement;
    const vw = canvas.clientWidth || 1;
    const vh = canvas.clientHeight || 1;

    for (const person of this.people) person.mixer?.update(dt);
    this.gaze(dt);

    for (const person of this.people) {
      // A small breath so a seated figure does not read as a statue. The
      // generated cast breathes through its idle clip instead.
      if (!person.model) {
        const breath = 1 + Math.sin(this.time * BREATH_HZ * Math.PI * 2 + person.phase) * 0.012;
        person.torso.scale.set(1.15, breath, 0.85);
      }

      // Float the plate over the head, in screen space.
      const seat = SEATS[person.seat];
      this.projected.set(seat.pos[0], PLATE_Y, seat.pos[2]).project(this.ctx.camera);
      const behind = this.projected.z > 1;
      const x = (this.projected.x * 0.5 + 0.5) * vw;
      const y = Math.max((-this.projected.y * 0.5 + 0.5) * vh, MIN_PLATE_Y);
      person.plate.style.transform =
        `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      person.plate.style.opacity = behind ? '0' : '1';

      // Tile count and the is-turn highlight.
      const remaining = game.view(0).handCounts[person.seat] ?? 0;
      const isTurn = game.turn === person.seat && game.phase === 'playing';
      const sig = `${remaining}|${isTurn}|${game.phase}`;
      if (sig !== person.countSig) {
        person.countSig = sig;
        person.countEl.textContent = `${remaining} ficha${remaining === 1 ? '' : 's'}`;
        person.plate.classList.toggle('is-turn', isTurn);
      }
    }
  },

  dispose() {
    this.group?.parent?.remove(this.group);
    for (const geo of Object.values(this.geo ?? {})) geo?.dispose?.();
    for (const mat of Object.values(this.mat ?? {})) mat?.dispose?.();
    for (const person of this.people ?? []) {
      person.mixer?.stopAllAction();
      person.model?.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            m?.map?.dispose();
            m?.dispose();
          }
        }
      });
      person.plate?.remove();
    }
    this.style?.remove();
    this.people = [];
    this.geo = null;
    this.mat = null;
    this.group = null;
    this.ctx = null;
  },
};
