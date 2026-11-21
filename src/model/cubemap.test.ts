import { describe, expect, it } from "vitest";
import { tourToNodes, viewerProjection } from "../viewer/nodes";
import { CUBESTRIP_ORDER, cubeLookup, detectProjection } from "./cubemap";
import { addRoom, createTour, updateRoom } from "./tour";
import type { PanoramaSource } from "./types";

const deg = (d: number) => (d * Math.PI) / 180;

describe("detectProjection", () => {
  it("tells a 6:1 strip from a 2:1 image", () => {
    expect(detectProjection(12288, 2048)).toBe("cubestrip");
    expect(detectProjection(8192, 4096)).toBe("equirectangular");
  });
});

describe("cubeLookup", () => {
  it.each([
    [0, 0, "front"],
    [90, 0, "right"],
    [180, 0, "back"],
    [-90, 0, "left"],
    [0, 89, "top"],
    [0, -89, "bottom"],
  ] as const)("yaw %d pitch %d is the middle of %s", (yaw, pitch, face) => {
    const hit = cubeLookup(deg(yaw), deg(pitch));
    expect(hit.face).toBe(face);
    if (Math.abs(pitch) < 45) {
      expect(hit.s).toBeCloseTo(0.5);
      expect(hit.t).toBeCloseTo(0.5);
    }
  });

  it("joins the faces edge to edge", () => {
    // Just right of the front's right edge is the right face's left edge.
    expect(cubeLookup(deg(44.9), 0)).toMatchObject({ face: "front" });
    expect(cubeLookup(deg(44.9), 0).s).toBeCloseTo(1, 2);
    expect(cubeLookup(deg(45.1), 0)).toMatchObject({ face: "right" });
    expect(cubeLookup(deg(45.1), 0).s).toBeCloseTo(0, 2);
    // Above the front is the lower edge of the top face, same left-to-right.
    const top = cubeLookup(deg(20), deg(80));
    expect(top.face).toBe("top");
    expect(top.s).toBeGreaterThan(0.5);
    expect(cubeLookup(0, deg(45.1)).t).toBeCloseTo(1, 2);
    // Below the front is the upper edge of the bottom face.
    expect(cubeLookup(0, deg(-45.1))).toMatchObject({ face: "bottom" });
    expect(cubeLookup(0, deg(-45.1)).t).toBeCloseTo(0, 2);
  });
});

describe("cubestrips in a tour", () => {
  const strip: PanoramaSource = { id: "s", url: "strip.jpg", projection: "cubestrip" };
  const flat: PanoramaSource = { id: "e", url: "flat.jpg" };
  let tour = createTour();
  const a = addRoom(tour, { x: 0, y: 0, w: 2, h: 2 });
  tour = updateRoom(a.tour, a.id, { panoramaId: "s" });

  it("uses the cubemap adapter only when every photo is a cubestrip", () => {
    expect(viewerProjection(tour, [strip, flat])).toBe("cubemap");
    const b = addRoom(tour, { x: 3, y: 0, w: 2, h: 2 });
    expect(viewerProjection(updateRoom(b.tour, b.id, { panoramaId: "e" }), [strip, flat])).toBe("equirectangular");
  });

  it("passes the strip with its face order", () => {
    expect(tourToNodes(tour, [strip])[0]!.panorama).toEqual({
      type: "stripe",
      path: "strip.jpg",
      order: [...CUBESTRIP_ORDER],
      flipTopBottom: true,
    });
  });
});

describe("Photo Sphere Viewer's cubemap adapter with flipTopBottom", () => {
  // Its textureCoordsToSphericalCoords for the top and bottom faces with flipTopBottom (x forward, y right, z down),
  // copied from @photo-sphere-viewer/cubemap-adapter 5.15: it must read the faces the way cubeLookup does.
  function psv(face: "top" | "bottom", s: number, t: number) {
    const u = 2 * (s - 0.5);
    const v = 2 * (t - 0.5);
    const [x, y, z] = face === "top" ? [v, u, -1] : [-v, u, 1];
    const d = Math.hypot(x, y, z);
    return { yaw: Math.atan2(y / d, x / d), pitch: -Math.asin(z / d) };
  }

  it.each([
    ["top", 0.5, 0.9],
    ["top", 0.8, 0.3],
    ["bottom", 0.5, 0.1],
    ["bottom", 0.2, 0.7],
  ] as const)("%s face at (%d, %d) is the same point", (face, s, t) => {
    const { yaw, pitch } = psv(face, s, t);
    const hit = cubeLookup(yaw, pitch);
    expect(hit.face).toBe(face);
    expect(hit.s).toBeCloseTo(s);
    expect(hit.t).toBeCloseTo(t);
  });
});
