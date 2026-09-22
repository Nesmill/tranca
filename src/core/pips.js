// Domino face drawing, shared by the 3D tiles and the 2D hand strip so a pip
// looks the same wherever it appears. Pure 2D canvas, no three.js.

export const BONE = '#f2ece0';
export const BONE_EDGE = '#cfc4b0';
export const PIPE_INK = '#2b2622';

// Standard domino pip arrangements, normalised inside one half of a face.
export const PIP_LAYOUT = {
  0: [],
  1: [[0.5, 0.5]],
  2: [[0.3, 0.29], [0.7, 0.71]],
  3: [[0.29, 0.26], [0.5, 0.5], [0.71, 0.74]],
  4: [[0.29, 0.29], [0.71, 0.29], [0.29, 0.71], [0.71, 0.71]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.3, 0.22], [0.7, 0.22], [0.3, 0.5], [0.7, 0.5], [0.3, 0.78], [0.7, 0.78]],
};

/**
 * Draw a domino face into a 2D context.
 * @param {CanvasRenderingContext2D} g Target context.
 * @param {number} x Left edge of the face.
 * @param {number} y Top edge of the face.
 * @param {number} w Face width.
 * @param {number} h Face height.
 * @param {number} left Pips in the first half.
 * @param {number} right Pips in the second half.
 * @param {{vertical?: boolean}} [opts] `vertical` stacks the halves instead of
 *   placing them side by side, which is how a tile reads in the hand strip.
 */
export function drawFace(g, x, y, w, h, left, right, opts = {}) {
  const vertical = opts.vertical === true;

  g.save();
  g.fillStyle = BONE;
  g.fillRect(x, y, w, h);
  g.strokeStyle = BONE_EDGE;
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.03);
  g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);

  // The divide between the two halves of the tile.
  g.beginPath();
  if (vertical) {
    g.moveTo(x + w * 0.07, y + h / 2);
    g.lineTo(x + w * 0.93, y + h / 2);
  } else {
    g.moveTo(x + w / 2, y + h * 0.07);
    g.lineTo(x + w / 2, y + h * 0.93);
  }
  g.strokeStyle = BONE_EDGE;
  g.stroke();

  const halves = vertical
    ? [
        { v: left, ox: x, oy: y, hw: w, hh: h / 2 },
        { v: right, ox: x, oy: y + h / 2, hw: w, hh: h / 2 },
      ]
    : [
        { v: left, ox: x, oy: y, hw: w / 2, hh: h },
        { v: right, ox: x + w / 2, oy: y, hw: w / 2, hh: h },
      ];

  const radius = Math.min(w, h) * 0.085;
  g.fillStyle = PIPE_INK;
  for (const half of halves) {
    for (const [px, py] of PIP_LAYOUT[half.v] ?? []) {
      g.beginPath();
      g.arc(half.ox + px * half.hw, half.oy + py * half.hh, radius, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/**
 * Build a standalone canvas holding one domino face.
 * @param {number} left Pips in the first half.
 * @param {number} right Pips in the second half.
 * @param {number} w Canvas width in pixels.
 * @param {number} h Canvas height in pixels.
 * @param {{vertical?: boolean}} [opts] Passed through to `drawFace`.
 * @returns {HTMLCanvasElement} A canvas the caller owns and may append.
 */
export function faceCanvas(left, right, w, h, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawFace(canvas.getContext('2d'), 0, 0, w, h, left, right, opts);
  return canvas;
}
