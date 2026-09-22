// Spatial contract shared by every module: table geometry, seat placement and
// the camera rig anchor. All distances are metres in world space.
//
// Axes: +x is to the player's right, +y is up, +z is toward the player.
// The player sits at +z looking toward -z.

// --- Tuning constants ---------------------------------------------------
// A real domino table, not a café side table: wide enough that four people sit
// around it without their hands meeting in the middle. It is rectangular
// because a seated player sees far more width than depth, and the board is
// deeper than it is wide.
const TABLE_WIDTH = 1.55; // x extent, left to right across the player's view
const TABLE_DEPTH = 1.25; // z extent, toward and away from the player
const TABLE_TOP_Y = 0.74; // height of the playing surface
const TABLE_THICKNESS = 0.06;
const RIM_WIDTH = 0.075; // raised wooden lip around the playfield
const RIM_HEIGHT = 0.035;
// Seats sit just outside the long and short edges respectively, so the side
// players are not pushed so far out that the portrait-frame problem returns.
const SEAT_INSET_X = 0.98;
const SEAT_INSET_Z = 1.02;
const EYE_HEIGHT = 1.28; // seated eye height above the floor
const EYE_BACK = 1.45; // camera distance from table centre along +z
// Resting gaze, degrees below horizontal. This is a balance, not a preference:
// too shallow and the table is seen at a grazing angle that squashes the board
// into a sliver, too steep and the camera looks down onto the tops of the
// opponents' heads and shows the floor under the table. Aimed here the table
// fills the lower half and the opponents' faces sit across the top fifth.
const BASE_PITCH_DEG = 20;
export const SEAT_HEAD_Y = 1.15; // seated head height, used to frame the other players

export const WORLD_LIMITS = Object.freeze({
  floorY: 0,
  roomHalfX: 2.6,
  roomBackZ: -3.2,
  roomFrontZ: 3.4,
  ceilingY: 2.7,
});

export const TABLE = Object.freeze({
  width: TABLE_WIDTH,
  depth: TABLE_DEPTH,
  topY: TABLE_TOP_Y,
  thickness: TABLE_THICKNESS,
  rimWidth: RIM_WIDTH,
  rimHeight: RIM_HEIGHT,
  halfW: TABLE_WIDTH / 2,
  halfD: TABLE_DEPTH / 2,
  center: Object.freeze([0, TABLE_TOP_Y, 0]),
});

// Seats run in play order. Dominican dominoes passes to the left, so from the
// player's chair the order is: you, left opponent, partner across, right opponent.
export const SEATS = Object.freeze([
  Object.freeze({ id: 'you', label: 'Tú', team: 0, pos: Object.freeze([0, 0, SEAT_INSET_Z]), yaw: Math.PI }),
  Object.freeze({ id: 'left', label: 'Yolanda', team: 1, pos: Object.freeze([-SEAT_INSET_X, 0, 0]), yaw: Math.PI / 2 }),
  Object.freeze({ id: 'across', label: 'Ramón', team: 0, pos: Object.freeze([0, 0, -SEAT_INSET_Z]), yaw: 0 }),
  Object.freeze({ id: 'right', label: 'Manuel', team: 1, pos: Object.freeze([SEAT_INSET_X, 0, 0]), yaw: -Math.PI / 2 }),
]);

// Team 0 is the player's side; team 1 is the opposition.
export const TEAM_NAMES = Object.freeze(['Tú y Ramón', 'Yolanda y Manuel']);

export const RIG = Object.freeze({
  eye: Object.freeze([0, EYE_HEIGHT, EYE_BACK]),
  basePitch: -(BASE_PITCH_DEG * Math.PI) / 180,
  baseYaw: 0,
  // Head-look limits, radians. Yaw reaches far enough to bring either flanking
  // seat near the centre of frame; there is no free walking.
  maxYaw: 1.15,
  maxPitchUp: 0.45,
  maxPitchDown: 0.55,
  seatHeadY: SEAT_HEAD_Y,
  leanDistance: 0.42, // dolly toward the board while leaning in
  leanDrop: 0.06,
});

// A seat position at head height, used for aiming and for line-of-sight checks.
export function seatHead(index) {
  const s = SEATS[index];
  return [s.pos[0], SEAT_HEAD_Y, s.pos[2]];
}
