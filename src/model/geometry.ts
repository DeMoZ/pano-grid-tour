import type { GridSize, Rect } from "./types";

export interface Point {
  x: number;
  y: number;
}

/** Which edges a resize handle moves. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Normalizes an angle in degrees to [0, 360). */
export function normalizeDegrees(degrees: number): number {
  return (((degrees % 360) + 360) % 360) + 0;
}

export function center(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Direction from `from` to `to` in degrees clockwise from the top of the grid
 * (0 = up, 90 = right, 180 = down, 270 = left).
 */
export function bearing(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) {
    return 0;
  }
  return normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI);
}

/** Keeps a rectangle inside the grid, at least one cell big, in whole cells. */
export function clampRect(rect: Rect, grid: GridSize): Rect {
  const w = Math.max(1, Math.min(Math.round(rect.w), grid.cols));
  const h = Math.max(1, Math.min(Math.round(rect.h), grid.rows));
  const x = Math.max(0, Math.min(Math.round(rect.x), grid.cols - w));
  const y = Math.max(0, Math.min(Math.round(rect.y), grid.rows - h));
  return { x, y, w, h };
}

/** The rectangle spanned by two cells (both included), clamped to the grid. */
export function rectFromCells(a: Point, b: Point, grid: GridSize): Rect {
  const x0 = Math.min(Math.floor(a.x), Math.floor(b.x));
  const y0 = Math.min(Math.floor(a.y), Math.floor(b.y));
  const x1 = Math.max(Math.floor(a.x), Math.floor(b.x));
  const y1 = Math.max(Math.floor(a.y), Math.floor(b.y));
  return clampRect({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, grid);
}

/** Moves a rectangle by a pointer offset in cells, snapped to whole cells and kept inside the grid. */
export function moveRect(rect: Rect, dx: number, dy: number, grid: GridSize): Rect {
  return clampRect({ ...rect, x: rect.x + Math.round(dx), y: rect.y + Math.round(dy) }, grid);
}

/**
 * Resizes a rectangle by dragging one of its handles to `point` (grid units), snapping
 * the moved edges to the nearest grid line. The opposite edges stay where they are and
 * the rectangle never gets smaller than one cell.
 */
export function resizeRect(rect: Rect, handle: Handle, point: Point, grid: GridSize): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  const px = Math.max(0, Math.min(Math.round(point.x), grid.cols));
  const py = Math.max(0, Math.min(Math.round(point.y), grid.rows));
  if (handle.includes("w")) {
    left = Math.min(px, right - 1);
  }
  if (handle.includes("e")) {
    right = Math.max(px, left + 1);
  }
  if (handle.includes("n")) {
    top = Math.min(py, bottom - 1);
  }
  if (handle.includes("s")) {
    bottom = Math.max(py, top + 1);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Position of a resize handle on the rectangle's outline. */
export function handlePoint(rect: Rect, handle: Handle): Point {
  const x = handle.includes("w") ? rect.x : handle.includes("e") ? rect.x + rect.w : rect.x + rect.w / 2;
  const y = handle.includes("n") ? rect.y : handle.includes("s") ? rect.y + rect.h : rect.y + rect.h / 2;
  return { x, y };
}

/** True when two rectangles share at least one cell (touching edges don't count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.w && point.y >= rect.y && point.y < rect.y + rect.h;
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Where a link between two rooms leaves the first room and enters the second, and the
 * point between them (on the shared wall for rooms that touch). Used to draw and tap links.
 */
export function linkAnchor(a: Rect, b: Rect): { from: Point; to: Point; mid: Point } {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  const exit = (rect: Rect) => {
    const tx = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
    const ty = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
    return Math.min(tx, ty);
  };
  const ta = exit(a);
  const tb = exit(b);
  if (!Number.isFinite(ta)) {
    return { from: ca, to: ca, mid: ca };
  }
  if (ta + tb >= 1) {
    // Touching (or overlapping) rooms: one point, on the shared wall when they touch.
    const t = ta / (ta + tb);
    const mid = { x: ca.x + dx * t, y: ca.y + dy * t };
    return { from: mid, to: mid, mid };
  }
  const from = { x: ca.x + dx * ta, y: ca.y + dy * ta };
  const to = { x: cb.x - dx * tb, y: cb.y - dy * tb };
  return { from, to, mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } };
}
