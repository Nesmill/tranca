#!/usr/bin/env python3
"""Cut a character sheet into aligned, transparent sprites.

    python studio/sprites.py --in docs/art/sheet.jpg --cols 3 --rows 2 --out docs/art/hero

Why it works this way
---------------------
The image model cannot emit alpha, and asking for a "transparent background"
makes it paint a checkerboard. Asking for a flat solid magenta does work, so the
sheet arrives on magenta and the alpha is recovered here.

Aligning the cells is the part that matters. The model draws each cell at a
slightly different scale, so dropping raw crops into the game makes the
character jump and change size between poses. Two anchors fix that, both taken
from the *head* rather than the whole silhouette -- arms move, heads do not:

  * scale each pose so the head is the same width
  * place each pose so the top of the head sits at the same point

Everything below the head then moves naturally, which is exactly what animation
wants. Aligning by the full bounding box instead would make an arms-folded pose
giant and a reaching pose tiny.

Output: <out>-1.png ... <out>-N.png (RGBA), plus <out>-preview.png, a contact
sheet on a checkerboard for judging alignment at a glance.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# --- Tuning constants ---------------------------------------------------
# The background is measured per sheet rather than assumed. Asking several times
# for "flat solid magenta" reliably yields *a* magenta, but its brightness varies
# a lot between generations, and a fixed threshold silently keys nothing on the
# darker ones -- which looks like a working run that produces opaque sprites.
BORDER_FRAC = 0.04   # fraction of each cell edge sampled as background
KEY_CORE_FRAC = 0.85 # background metric at or above this fraction is transparent
KEY_EDGE_FRAC = 0.45 # at or below this fraction is fully opaque
DESPILL = 0.75       # how hard to pull magenta fringing out of edges

HEAD_BAND = 0.38   # top fraction of the silhouette treated as head + cap
ALPHA_FLOOR = 24   # alpha below this counts as background when measuring
PREVIEW_BG = (26, 22, 20, 255)
CHECKER = (44, 38, 34, 255)
CHECKER_PX = 16
# -------------------------------------------------------------------------


def magenta_metric(rgb: np.ndarray) -> np.ndarray:
    """How magenta a pixel is: red and blue far above green.

    Separates magenta from skin (red high, blue low), from white and from dark
    clothing, all of which sit near zero.
    """
    return np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]


def detect_background(rgb: np.ndarray, inset: int) -> tuple[float, float]:
    """Sample the cell border and return (core, edge) metric thresholds."""
    h, w, _ = rgb.shape
    b = max(2, int(min(h, w) * BORDER_FRAC))
    strips = [
        rgb[:b, :, :].reshape(-1, 3),
        rgb[h - b :, :, :].reshape(-1, 3),
        rgb[:, :b, :].reshape(-1, 3),
        rgb[:, w - b :, :].reshape(-1, 3),
    ]
    border = np.concatenate(strips, axis=0)
    metric = magenta_metric(border)
    # Median, not mean: a character that overhangs the border would drag a mean.
    level = float(np.median(metric))
    return level * KEY_CORE_FRAC, level * KEY_EDGE_FRAC


def key_magenta(rgb: np.ndarray, core: float, edge: float) -> tuple[np.ndarray, np.ndarray]:
    """Return (alpha, despilled rgb) for an RGB float array in 0..255."""
    metric = magenta_metric(rgb)
    ramp = max(core - edge, 1.0)
    alpha = np.clip((core - metric) / ramp, 0.0, 1.0)

    # De-spill: on partially transparent pixels, magenta survives as a pink
    # fringe. Pull the offending channels down toward green.
    spill = np.clip(metric, 0.0, None) * DESPILL
    edge_mask = (alpha < 0.98).astype(np.float32)
    fixed = rgb.copy()
    fixed[..., 0] = np.clip(rgb[..., 0] - spill * edge_mask, 0, 255)
    fixed[..., 2] = np.clip(rgb[..., 2] - spill * edge_mask, 0, 255)
    return alpha, fixed


def measure(alpha: np.ndarray) -> dict:
    """Head-anchored measurements for one sprite.

    The head width is the median width across the head band, not the maximum.
    A pose that leans over a table drags the table into the band, and a single
    wide row would otherwise be read as a very wide head -- which scales that
    pose down to a fraction of the others. Rows wider than 1.5x the median are
    treated as props and ignored.
    """
    mask = alpha > (ALPHA_FLOOR / 255.0)
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        raise ValueError("cell is empty after keying")
    y0, y1 = int(ys.min()), int(ys.max())
    height = y1 - y0 + 1

    band_h = max(2, int(height * HEAD_BAND))
    band = mask[y0 : y0 + band_h, :]
    widths = band.sum(axis=1)
    present = widths[widths > 0]
    if present.size == 0:
        raise ValueError("could not find a head in the cell")

    median_w = float(np.median(present))
    plausible = present[present <= median_w * 1.5]
    head_w = int(np.median(plausible if plausible.size else present))

    # Vertical centre of the head, then its horizontal centre on that row only,
    # so shoulders and props do not drag the anchor sideways.
    head_row = y0 + int(np.argmax(widths >= head_w * 0.9))
    head_row = min(head_row, y1)
    row = mask[head_row, :]
    hx = np.nonzero(row)[0]
    head_cx = int((hx.min() + hx.max()) / 2) if hx.size else int(xs.mean())

    return {
        "top": y0,
        "height": height,
        "head_w": max(head_w, 1),
        "head_cx": head_cx,
        "bbox": (int(xs.min()), y0, int(xs.max()) + 1, y1 + 1),
    }


def checkerboard(w: int, h: int) -> Image.Image:
    tile = Image.new("RGBA", (w, h), PREVIEW_BG)
    px = tile.load()
    for y in range(h):
        for x in range(w):
            if ((x // CHECKER_PX) + (y // CHECKER_PX)) % 2 == 0:
                px[x, y] = CHECKER
    return tile


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="out", required=True, help="output prefix, no extension")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--rows", type=int, default=2)
    ap.add_argument("--inset", type=float, default=0.02, help="fraction trimmed off each cell edge")
    ap.add_argument("--head-width", type=float, default=0.0,
                    help="target head width in px; 0 = use the median across cells")
    ap.add_argument("--canvas", type=int, default=512, help="output canvas size")
    ap.add_argument("--anchor-y", type=float, default=0.14, help="where the head top sits, 0..1")
    ap.add_argument("--key-only", action="store_true",
                    help="no grid and no head scaling: key the background, trim, save one PNG. "
                         "For UI art such as a logo, where head-anchored alignment is meaningless.")
    args = ap.parse_args()

    src = Path(args.src)
    img = Image.open(src).convert("RGB")

    if args.key_only:
        rgb = np.asarray(img, dtype=np.float32)
        core, edge = detect_background(rgb, 0)
        alpha, fixed = key_magenta(rgb, core, edge)
        info = measure(alpha)
        x0, y0, x1, y1 = info["bbox"]
        pad = 4
        x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
        x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        target = out.with_suffix(".png")
        rgba = np.dstack([fixed.astype(np.uint8), (alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
        Image.fromarray(rgba, "RGBA").save(target)
        print(f"  bg_metric={core / KEY_CORE_FRAC:.1f}  trimmed to {x1 - x0}x{y1 - y0}")
        print(f"  wrote {target}")
        return 0

    W, H = img.size
    cw, ch = W / args.cols, H / args.rows
    inset_x, inset_y = cw * args.inset, ch * args.inset

    cells = []
    for row in range(args.rows):
        for col in range(args.cols):
            box = (
                int(col * cw + inset_x), int(row * ch + inset_y),
                int((col + 1) * cw - inset_x), int((row + 1) * ch - inset_y),
            )
            cell = img.crop(box)
            rgb = np.asarray(cell, dtype=np.float32)
            core, edge = detect_background(rgb, 0)
            alpha, fixed = key_magenta(rgb, core, edge)
            info = measure(alpha)
            info["bg"] = (core, edge)
            cells.append({"rgb": fixed, "alpha": alpha, "info": info, "box": box})
            covered = float((alpha > 0.5).mean()) * 100
            print(f"  cell {len(cells):>2}  bg_metric={core / KEY_CORE_FRAC:>6.1f}  "
                  f"head_w={info['head_w']:>4}  h={info['height']:>4}  "
                  f"subject={covered:>4.1f}% of cell")

    target_head = args.head_width if args.head_width > 0 else float(
        np.median([c["info"]["head_w"] for c in cells])
    )
    print(f"\n  target head width: {target_head:.0f}px")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas = args.canvas
    anchor_y = int(canvas * args.anchor_y)
    placed = []

    for i, c in enumerate(cells, start=1):
        rgb = c["rgb"]
        alpha = (c["alpha"] * 255).astype(np.uint8)
        sprite = Image.fromarray(np.dstack([rgb.astype(np.uint8), alpha]), "RGBA")

        scale = target_head / c["info"]["head_w"]
        nw, nh = max(1, int(round(sprite.width * scale))), max(1, int(round(sprite.height * scale)))
        sprite = sprite.resize((nw, nh), Image.LANCZOS)

        # Where the head lands once scaled.
        head_top = int(c["info"]["top"] * scale)
        head_cx = int(c["info"]["head_cx"] * scale)

        frame = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        frame.alpha_composite(sprite, (canvas // 2 - head_cx, anchor_y - head_top))
        path = out.with_name(f"{out.name}-{i}.png")
        frame.save(path)
        placed.append(frame)
        print(f"  wrote {path.name}  scale={scale:.3f}")

    # Contact sheet: every pose drawn on the same anchor, over a checkerboard,
    # so misalignment is visible in one look rather than six.
    cols = min(3, len(placed))
    rows = (len(placed) + cols - 1) // cols
    pad = 8
    sheet = checkerboard(cols * canvas + pad * (cols + 1), rows * canvas + pad * (rows + 1))
    for i, spr in enumerate(placed):
        x = pad + (i % cols) * (canvas + pad)
        y = pad + (i // cols) * (canvas + pad)
        sheet.alpha_composite(spr, (x, y))
        guide = Image.new("RGBA", (canvas, 1), (255, 211, 77, 120))
        sheet.alpha_composite(guide, (x, y + anchor_y))
    prev = out.with_name(f"{out.name}-preview.png")
    sheet.save(prev)
    print(f"\n  preview: {prev}  ({cols}x{rows} on the shared anchor line)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
