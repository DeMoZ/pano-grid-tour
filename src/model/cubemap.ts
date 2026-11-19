import type { CubeFace, PanoramaSource, Projection } from "./types";

/**
 * Face order of the cubestrips this library expects by default: right, left, top, bottom,
 * front, back (the +X −X +Y −Y +Z −Z order many cameras and tools write).
 */
export const CUBESTRIP_ORDER: readonly CubeFace[] = ["right", "left", "top", "bottom", "front", "back"];

/** Guesses the projection from the image size: 6:1 is a cubestrip, anything else equirectangular. */
export function detectProjection(width: number, height: number): Projection {
  return height > 0 && Math.abs(width / height - 6) < 0.02 ? "cubestrip" : "equirectangular";
}

export function isCubestrip(source: PanoramaSource): boolean {
  return source.projection === "cubestrip";
}

export function cubeOrder(source: PanoramaSource): readonly CubeFace[] {
  return source.cubeOrder && source.cubeOrder.length === 6 ? source.cubeOrder : CUBESTRIP_ORDER;
}

/**
 * The point of a cube face seen in a direction. `yaw` (radians) grows clockwise seen from
 * above, 0 = the middle of the front face; `pitch` (radians) grows upwards. `s` and `t` are
 * the position on the face image, 0..1 from its top-left corner.
 */
export function cubeLookup(yaw: number, pitch: number): { face: CubeFace; s: number; t: number } {
  const forward = Math.cos(pitch) * Math.cos(yaw);
  const right = Math.cos(pitch) * Math.sin(yaw);
  const up = Math.sin(pitch);
  const af = Math.abs(forward);
  const ar = Math.abs(right);
  const au = Math.abs(up);
  let face: CubeFace;
  let s: number;
  let t: number;
  if (au >= af && au >= ar) {
    // Top: its lower edge touches the front. Bottom: its upper edge does.
    face = up > 0 ? "top" : "bottom";
    s = right / au;
    t = up > 0 ? forward / au : -forward / au;
  } else if (af >= ar) {
    face = forward > 0 ? "front" : "back";
    s = forward > 0 ? right / af : -right / af;
    t = -up / af;
  } else {
    face = right > 0 ? "right" : "left";
    s = right > 0 ? -forward / ar : forward / ar;
    t = -up / ar;
  }
  return { face, s: (s + 1) / 2, t: (t + 1) / 2 };
}
