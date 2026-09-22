// Board layout: turns the rules engine's line of play into positions on a cell
// grid, so a long line wraps and turns on the table instead of running off the
// edge the way a single straight line would.
//
// Pure geometry — no three.js, no DOM. `layout(line)` is a total function of the
// line, always walking outward from the anchor tile, so recomputing it after
// every play leaves every already-placed tile exactly where it was.
//
// Grid axes map to world axes as +gx -> +x (right) and +gy -> +z (toward the
// player). A tile is two cells long and one cell wide; a double lies across the
// line, so it advances the line by a single cell.

// --- Tuning constants ---------------------------------------------------
// Columns are even because a tile spans two cells along x, and rows are odd
// because it spans one cell along z — that combination is what centres the
// opening tile on the table in both axes.
//
// The grid shape is chosen for a portrait frame, where width is the scarce
// axis: the camera only shows about half a metre of table across at board
// distance, but the full metre of depth. So the board is narrow and deep and
// spends its cells on rows rather than columns.
//
// Columns still set how many tiles fit in one serpentine pass, so a narrow
// board needs more rows to finish a hand — 16 columns needs 23 rows where 18
// needs 19. Measured over 120 matches per shape (studio/sweep-track.mjs).
const COLUMNS = 16;
const ROWS = 23;
const CELL = 0.042; // metres per cell; the board covers 0.672 x 0.966 m
// -------------------------------------------------------------------------

export const DEFAULT_GRID = Object.freeze({ columns: COLUMNS, rows: ROWS, cell: CELL });

/**
 * Build a board track.
 * @param {{columns?: number, rows?: number, cell?: number}} [grid] Grid overrides.
 * @returns {object} Track exposing `layout`, `cellToWorld` and `grid`.
 */
export function createTrack(grid = {}) {
  const columns = grid.columns ?? COLUMNS;
  const rows = grid.rows ?? ROWS;
  const cell = grid.cell ?? CELL;
  const midX = (columns - 1) / 2;
  const midY = (rows - 1) / 2;

  const key = (x, y) => y * columns + x;
  const onGrid = (x, y) => x >= 0 && x < columns && y >= 0 && y < rows;

  /** Grid cell to a world offset from the table centre. */
  const cellToWorld = (x, y) => ({ x: (x - midX) * cell, z: (y - midY) * cell });

  /**
   * The two sides a double's spare half can fall on, preferred first.
   *
   * Keying the bump to the direction of travel mirrors it between the two
   * arms of the line (one arm walks right, the other left), so doubles look
   * stuck out at random. Real tables keep the bumps on one side: prefer one
   * world side throughout — away from the player (grid -y) on a horizontal
   * run, screen-left (grid -x) on a vertical one — and keep the other side
   * second for crowded stretches where the first is occupied.
   */
  const bumpSides = (dx, dy) => {
    const sides = [[-dy, dx], [dy, -dx]];
    const want = dx !== 0 ? [0, -1] : [-1, 0];
    return sides[0][0] === want[0] && sides[0][1] === want[1] ? sides : [sides[1], sides[0]];
  };

  /**
   * Cells a tile occupies when it begins at (x, y).
   * `dx, dy` is the direction the line travels at that point. A normal tile
   * spans two cells along the heading; a double lies across it.
   */
  const cellsFor = (x, y, dx, dy, cross) => {
    if (!cross) return [[x, y], [x + dx, y + dy]];
    const [px, py] = bumpSides(dx, dy)[0];
    return [[x, y], [x + px, y + py]];
  };

  /** How far the line advances past a tile's first cell. */
  const advanceFor = (cross) => (cross ? 1 : 2);

  /**
   * Lay the whole line out on the grid.
   * @param {Array<object>} line Board line from the rules engine, left to right.
   * @returns {Array<object>} One placement per tile, in the same order.
   */
  function layout(line) {
    if (!Array.isArray(line) || line.length === 0) return [];

    const occupied = new Set();
    const out = new Array(line.length);
    let stalled = 0;

    let anchor = line.findIndex((t) => t.start);
    if (anchor < 0) anchor = 0;

    /**
     * Reserve the cells for one tile. A crosswise double has two possible cell
     * pairs, so the caller may pass the one it chose.
     */
    const commit = (x, y, dx, dy, cross, cells = cellsFor(x, y, dx, dy, cross)) => {
      for (const [gx, gy] of cells) occupied.add(key(gx, gy));
      return cells;
    };

    // The anchor sits on the centre of the grid, travelling to the right.
    const ax = columns / 2 - 1;
    const ay = Math.floor(rows / 2);
    const anchorTile = line[anchor];
    const anchorCross = anchorTile.a === anchorTile.b;
    const anchorCells = commit(ax, ay, 1, 0, anchorCross);
    const anchorAdvance = advanceFor(anchorCross);
    out[anchor] = make(anchorTile, anchorCells, 1, 0, anchorCross, anchor);

    // `ends[side]` is the cell where the next tile on that side begins, and the
    // outward heading there. Both halves of the line grow away from the anchor.
    const ends = {
      right: { x: ax + anchorAdvance, y: ay, dx: 1, dy: 0 },
      left: { x: ax - 1, y: ay, dx: -1, dy: 0 },
    };

    /**
     * Extend one side by a tile.
     *
     * Headings are tried straight first, then rotated either way, which is what
     * makes the line turn at the table edge. A double is offered on *both* of
     * its perpendicular sides — one world side preferred (bumpSides) so the
     * bumps stay on one side of the table like real play, the other kept for
     * when the preferred side is blocked.
     *
     * A candidate is preferred when the line still has somewhere to go
     * afterwards — the following tile's cell must be on the grid with room to
     * continue. That reserves the margin the line needs to turn before it runs
     * into the edge. A placement that merely fits is accepted as a fallback, and
     * if nothing fits at all the tile is forced down and flagged.
     */
    const extend = (side, cross) => {
      const end = ends[side];
      const options = [];
      const headings = [
        [end.dx, end.dy],
        [-end.dy, end.dx],
        [end.dy, -end.dx],
      ];
      for (const [dx, dy] of headings) {
        if (cross) {
          // Preferred world side first (see bumpSides); the other stays as a
          // fallback for when a wall or the line itself blocks it.
          for (const [px, py] of bumpSides(dx, dy)) {
            options.push({ dx, dy, cells: [[end.x, end.y], [end.x + px, end.y + py]] });
          }
        } else {
          options.push({ dx, dy, cells: [[end.x, end.y], [end.x + dx, end.y + dy]] });
        }
      }

      const advance = advanceFor(cross);
      const other = side === 'right' ? 'left' : 'right';
      const fits = (o) =>
        o.cells.every(([gx, gy]) => onGrid(gx, gy) && !occupied.has(key(gx, gy)));
      const roomy = (o) => {
        const nx = end.x + advance * o.dx;
        const ny = end.y + advance * o.dy;
        return onGrid(nx, ny) && onGrid(nx + o.dx, ny + o.dy);
      };
      // How far a candidate would leave this end from the other one. Both ends
      // grow toward each other, so without this they eventually meet and the
      // line overlaps itself.
      const clearance = (o) => {
        const nx = end.x + advance * o.dx;
        const ny = end.y + advance * o.dy;
        const dx = nx - ends[other].x;
        const dy = ny - ends[other].y;
        return dx * dx + dy * dy;
      };
      // Free cells ahead of a candidate, capped. Distance from the other end is
      // not enough on its own: a turning can be far from the far end and still
      // drive straight into a wall of its own line two rows later.
      const RUN_CAP = 14;
      const runAhead = (o) => {
        let n = 0;
        let x = end.x + advance * o.dx;
        let y = end.y + advance * o.dy;
        for (let i = 0; i < RUN_CAP; i += 1) {
          if (!onGrid(x, y) || occupied.has(key(x, y))) break;
          n += 1;
          x += o.dx;
          y += o.dy;
        }
        return n;
      };

      let chosen = null;
      const viable = options.filter((o) => fits(o) && roomy(o));
      if (viable.length > 0) {
        // Carry straight on whenever there is room; turn only when forced, and
        // then head for the most open ground.
        chosen = viable.find((o) => o.dx === end.dx && o.dy === end.dy) ?? null;
        if (!chosen) {
          chosen = viable.reduce((best, o) => {
            const ahead = runAhead(o);
            const bestAhead = runAhead(best);
            if (ahead !== bestAhead) return ahead > bestAhead ? o : best;
            return clearance(o) > clearance(best) ? o : best;
          });
        }
      } else {
        chosen = options.find(fits) ?? null;
      }

      if (chosen) {
        commit(end.x, end.y, chosen.dx, chosen.dy, cross, chosen.cells);
        ends[side] = {
          x: end.x + advance * chosen.dx,
          y: end.y + advance * chosen.dy,
          dx: chosen.dx,
          dy: chosen.dy,
        };
        return { cells: chosen.cells, dx: chosen.dx, dy: chosen.dy, overflow: false };
      }

      // Boxed in: place it anyway so the board still renders, and flag it so a
      // test can assert this never happens in a real match.
      stalled += 1;
      const cells = cellsFor(end.x, end.y, end.dx, end.dy, cross);
      commit(end.x, end.y, end.dx, end.dy, cross, cells);
      ends[side] = {
        x: end.x + advance * end.dx,
        y: end.y + advance * end.dy,
        dx: end.dx,
        dy: end.dy,
      };
      return { cells, dx: end.dx, dy: end.dy, overflow: true };
    };

    /**
     * Build the placement record for a tile.
     *
     * Local +x runs from the tile's first cell to its second, so for a tile laid
     * on an end that is always the outward direction and `pips[1]` is the new
     * open end. For the anchor, local +x is simply the opening heading.
     */
    function make(tile, cells, dx, dy, cross, index) {
      const [c0, c1] = cells;
      const dirX = c1[0] - c0[0];
      const dirY = c1[1] - c0[1];
      const centreX = (c0[0] + c1[0]) / 2;
      const centreY = (c0[1] + c1[1]) / 2;
      const displayedLeft = tile.flipped ? tile.b : tile.a;
      const displayedRight = tile.flipped ? tile.a : tile.b;

      let pips;
      if (index === anchor) pips = [displayedLeft, displayedRight];
      else if (index > anchor) pips = [displayedLeft, displayedRight]; // appended right
      else pips = [displayedRight, displayedLeft]; // prepended left

      return {
        id: tile.id,
        index,
        a: tile.a,
        b: tile.b,
        cross,
        cells: [c0, c1],
        grid: { x: c0[0], y: c0[1], dx, dy },
        center: cellToWorld(centreX, centreY),
        // A grid direction of (gx, gy) is world (x, z); three.js yaw maps local
        // +x to (cos, 0, -sin), hence the negated z term.
        angle: Math.atan2(-dirY, dirX),
        pips,
        overflow: false,
      };
    }

    // Both sides grow in step rather than one after the other. The repulsion
    // rule needs the other end to be somewhere real, and a side that has not
    // started yet would still be sitting at the anchor's shoulder.
    let lo = anchor - 1;
    let hi = anchor + 1;
    let side = 'right';
    while (lo >= 0 || hi < line.length) {
      const takeRight = side === 'right' ? hi < line.length : lo < 0;
      if (takeRight) {
        const tile = line[hi];
        const r = extend('right', tile.a === tile.b);
        out[hi] = { ...make(tile, r.cells, r.dx, r.dy, tile.a === tile.b, hi), overflow: r.overflow };
        hi += 1;
      } else {
        const tile = line[lo];
        const r = extend('left', tile.a === tile.b);
        out[lo] = { ...make(tile, r.cells, r.dx, r.dy, tile.a === tile.b, lo), overflow: r.overflow };
        lo -= 1;
      }
      side = side === 'right' ? 'left' : 'right';
    }

    out.stalled = stalled;
    out.occupiedCount = occupied.size;
    return out;
  }

  return { layout, cellToWorld, grid: { columns, rows, cell } };
}
