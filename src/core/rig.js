// Seated first-person camera rig: a fixed chair, a limited head-look arc and a
// lean-in dolly. There is no walking; the player's only locomotion is turning
// their head and leaning toward the board.
//
// Vertical FOV is held constant and the aspect comes from the live viewport.
// The vertical axis carries the composition (hands, then table, then shop), so
// holding it fixed keeps the framing identical on every phone shape.

import * as THREE from 'three';
import { RIG, SEATS, SEAT_HEAD_Y } from './layout.js';

// --- Tuning constants ---------------------------------------------------
// Vertical FOV is held constant and aspect comes from the viewport, so the
// framing survives any screen shape. In landscape the horizontal field falls out
// of it: 42 degrees vertical at a 2.17 phone aspect gives roughly 80 degrees
// across, which holds all three opponents without any fisheye distortion.
const VERTICAL_FOV = 45; // degrees; constant across aspect ratios
const NEAR = 0.05;
const FAR = 60;
const DRAG_TO_YAW = 0.0042; // radians of head turn per pixel dragged
const DRAG_TO_PITCH = 0.0032;
const LOOK_SMOOTH = 12; // approach rate toward the target angles, per second
const LEAN_SMOOTH = 3.4;
// -------------------------------------------------------------------------

/**
 * Build the camera rig.
 * @returns {object} Rig exposing `camera`, `update`, `addLook`, `setLean`,
 *   `reset`, `yaw`, `pitch` and `lean`.
 */
export function createRig() {
  const camera = new THREE.PerspectiveCamera(VERTICAL_FOV, 1, NEAR, FAR);

  // RigZoomPush (the documented QA hook): `?target=n&zoom=1` locks a static
  // close-up on opponent n (1-3). Not gameplay — used for visual checks. The
  // rig keeps its full API; apply() just parks the camera on the seat.
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const seatNo = Number.parseInt(q.get('target') ?? '', 10);
  const closeUp = Number.isInteger(seatNo) && seatNo >= 1 && seatNo <= 3 && q.get('zoom') === '1';
  const closeUpEye = new THREE.Vector3();
  const closeUpAim = new THREE.Vector3();
  if (closeUp) {
    const seat = SEATS[seatNo];
    const toTable = new THREE.Vector3(-seat.pos.x, 0, -seat.pos.z).normalize();
    closeUpEye.set(seat.pos.x + toTable.x * 0.55, SEAT_HEAD_Y, seat.pos.z + toTable.z * 0.55);
    closeUpAim.set(seat.pos.x, SEAT_HEAD_Y, seat.pos.z);
    camera.fov = 28;
    camera.updateProjectionMatrix();
  }

  let yaw = RIG.baseYaw;
  let pitch = RIG.basePitch;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let lean = 0;
  let targetLean = 0;

  // Scratch vectors: the rig runs every frame and must not allocate.
  const eye = new THREE.Vector3();
  const aim = new THREE.Vector3();

  const clampLook = () => {
    targetYaw = Math.max(-RIG.maxYaw, Math.min(RIG.maxYaw, targetYaw));
    targetPitch = Math.max(
      RIG.basePitch - RIG.maxPitchDown,
      Math.min(RIG.basePitch + RIG.maxPitchUp, targetPitch),
    );
  };

  const apply = () => {
    if (closeUp) {
      camera.position.copy(closeUpEye);
      camera.lookAt(closeUpAim);
      return;
    }
    const leanT = lean;
    // Lean-in travels along the aim direction: forward and slightly down.
    eye.set(
      RIG.eye[0] - Math.sin(yaw) * leanT * RIG.leanDistance,
      RIG.eye[1] - leanT * RIG.leanDrop + Math.sin(pitch) * leanT * RIG.leanDistance,
      RIG.eye[2] - Math.cos(yaw) * leanT * RIG.leanDistance,
    );
    camera.position.copy(eye);

    const cosPitch = Math.cos(pitch);
    aim.set(
      eye.x - Math.sin(yaw) * cosPitch,
      eye.y + Math.sin(pitch),
      eye.z - Math.cos(yaw) * cosPitch,
    );
    camera.lookAt(aim);
  };

  apply();

  return {
    camera,
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get lean() {
      return lean;
    },
    /** Turn the head by a pointer delta, in pixels. */
    addLook(dx, dy) {
      targetYaw -= dx * DRAG_TO_YAW;
      targetPitch -= dy * DRAG_TO_PITCH;
      clampLook();
    },
    /** Aim directly at a world position; used by cutaways and the demo bot. */
    aimAt(x, y, z) {
      const dz = z - RIG.eye[2];
      const dx = x - RIG.eye[0];
      const dy = y - RIG.eye[1];
      targetYaw = Math.atan2(-dx, -dz);
      targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
      clampLook();
    },
    /** Ask for the lean-in dolly; `on` is a target, the rig eases toward it. */
    setLean(on) {
      targetLean = on ? 1 : 0;
    },
    /** Return the head to the resting frame over the board. */
    reset() {
      targetYaw = RIG.baseYaw;
      targetPitch = RIG.basePitch;
      targetLean = 0;
    },
    /** Match the projection to a viewport; the vertical FOV never changes. */
    resize(width, height) {
      const aspect = height > 0 ? width / height : 1;
      camera.aspect = aspect > 0 ? aspect : 1;
      camera.updateProjectionMatrix();
    },
    update(dt) {
      const lookK = 1 - Math.exp(-LOOK_SMOOTH * dt);
      const leanK = 1 - Math.exp(-LEAN_SMOOTH * dt);
      yaw += (targetYaw - yaw) * lookK;
      pitch += (targetPitch - pitch) * lookK;
      lean += (targetLean - lean) * leanK;
      apply();
    },
  };
}
