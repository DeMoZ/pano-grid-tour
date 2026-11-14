import { describe, expect, it } from "vitest";
import {
  bearing,
  clampRect,
  linkAnchor,
  moveRect,
  normalizeDegrees,
  overlaps,
  rectFromCells,
  resizeRect,
} from "./geometry";
import { parseTour } from "./parse";
import {
  addLink,
  addRoom,
  createTour,
  exitsOf,
  removeRoom,
  resizeGrid,
  reverseLink,
  roomName,
  setExitBearing,
  startRoom,
  updateLink,
  updateRoom,
} from "./tour";
import type { Tour } from "./types";
import { validateTour } from "./validate";
import { tourToNodes } from "../viewer/nodes";

const grid = { cols: 10, rows: 6 };

function twoRooms(): Tour {
  let tour = createTour(grid);
  tour = addRoom(tour, { x: 0, y: 0, w: 2, h: 2 }, "a").tour;
  tour = addRoom(tour, { x: 4, y: 0, w: 2, h: 2 }, "b").tour;
  return tour;
}

describe("geometry", () => {
  it("bearing_GridDirections_ClockwiseFromUp", () => {
    const o = { x: 5, y: 5 };
    expect(bearing(o, { x: 5, y: 1 })).toBe(0);
    expect(bearing(o, { x: 9, y: 5 })).toBe(90);
    expect(bearing(o, { x: 5, y: 9 })).toBe(180);
    expect(bearing(o, { x: 1, y: 5 })).toBe(270);
    expect(bearing(o, { x: 9, y: 1 })).toBeCloseTo(45);
  });

  it("normalizeDegrees_NegativeAndLarge_Wrapped", () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(720)).toBe(0);
    expect(Object.is(normalizeDegrees(-0), 0)).toBe(true);
  });

  it("clampRect_OutsideGrid_KeptInsideAndAtLeastOneCell", () => {
    expect(clampRect({ x: 9, y: -2, w: 3, h: 0 }, grid)).toEqual({ x: 7, y: 0, w: 3, h: 1 });
    expect(clampRect({ x: 0, y: 0, w: 99, h: 99 }, grid)).toEqual({ x: 0, y: 0, w: 10, h: 6 });
  });

  it("rectFromCells_DraggedBackwards_SpansBothCells", () => {
    expect(rectFromCells({ x: 4.7, y: 3.2 }, { x: 1.1, y: 1.9 }, grid)).toEqual({ x: 1, y: 1, w: 4, h: 3 });
  });

  it("moveRect_PastTheEdge_StopsAtTheEdge", () => {
    expect(moveRect({ x: 1, y: 1, w: 3, h: 2 }, 20.4, -0.6, grid)).toEqual({ x: 7, y: 0, w: 3, h: 2 });
  });

  it("resizeRect_EdgesAndCorners_SnapAndKeepOneCell", () => {
    const rect = { x: 2, y: 2, w: 3, h: 2 };
    expect(resizeRect(rect, "e", { x: 7.4, y: 0 }, grid)).toEqual({ x: 2, y: 2, w: 5, h: 2 });
    expect(resizeRect(rect, "nw", { x: 0.6, y: 0.4 }, grid)).toEqual({ x: 1, y: 0, w: 4, h: 4 });
    expect(resizeRect(rect, "w", { x: 9, y: 0 }, grid)).toEqual({ x: 4, y: 2, w: 1, h: 2 });
    expect(resizeRect(rect, "s", { x: 0, y: 40 }, grid)).toEqual({ x: 2, y: 2, w: 3, h: 4 });
  });

  it("linkAnchor_TouchingAndApartRooms_MidOnTheWallOrBetween", () => {
    const touching = linkAnchor({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 4, h: 2 });
    expect(touching.mid).toEqual({ x: 2, y: 1 });
    const apart = linkAnchor({ x: 0, y: 0, w: 2, h: 2 }, { x: 4, y: 0, w: 2, h: 2 });
    expect(apart).toEqual({ from: { x: 2, y: 1 }, to: { x: 4, y: 1 }, mid: { x: 3, y: 1 } });
  });

  it("overlaps_TouchingEdges_NotAnOverlap", () => {
    expect(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
  });
});

describe("tour", () => {
  it("addRoom_FirstRoom_BecomesStart", () => {
    const tour = twoRooms();
    expect(tour.startRoomId).toBe("a");
    expect(tour.rooms).toHaveLength(2);
  });

  it("updateRoom_RectAndHeading_ClampedAndNormalized", () => {
    const tour = updateRoom(twoRooms(), "a", { x: 50, heading: -10, name: { en: "Kitchen" } });
    const room = tour.rooms[0]!;
    expect(room.x).toBe(8);
    expect(room.heading).toBe(350);
    expect(roomName(room, "ru")).toBe("Kitchen");
  });

  it("addLink_SameRoomsTwiceEitherWay_KeepsOneLink", () => {
    let tour = twoRooms();
    const first = addLink(tour, "a", "b", "l1");
    tour = first.tour;
    const again = addLink(tour, "b", "a", "l2");
    expect(again.id).toBe("l1");
    expect(again.tour.links).toHaveLength(1);
    expect(addLink(tour, "a", "a").id).toBeUndefined();
    expect(addLink(tour, "a", "zzz").id).toBeUndefined();
  });

  it("exitsOf_TwoWayLink_ArrowsBothWaysFromTheCentres", () => {
    const tour = addLink(twoRooms(), "a", "b", "l1").tour;
    expect(exitsOf(tour, "a").map((e) => [e.to.id, e.bearing])).toEqual([["b", 90]]);
    expect(exitsOf(tour, "b").map((e) => [e.to.id, e.bearing])).toEqual([["a", 270]]);
  });

  it("exitsOf_OneWayLink_NoArrowBack", () => {
    let tour = addLink(twoRooms(), "a", "b", "l1").tour;
    tour = updateLink(tour, "l1", { twoWay: false, toBearing: 10 });
    expect(exitsOf(tour, "b")).toEqual([]);
    expect(tour.links[0]!.toBearing).toBeUndefined();
    tour = reverseLink(tour, "l1");
    expect(exitsOf(tour, "a")).toEqual([]);
    expect(exitsOf(tour, "b")).toHaveLength(1);
  });

  it("setExitBearing_EachSide_StoredOnTheRightField", () => {
    let tour = addLink(twoRooms(), "a", "b", "l1").tour;
    tour = setExitBearing(tour, "a", "l1", 100);
    tour = setExitBearing(tour, "b", "l1", -20);
    expect(tour.links[0]).toMatchObject({ fromBearing: 100, toBearing: 340 });
    expect(exitsOf(tour, "a")[0]).toMatchObject({ bearing: 100, custom: true });
    tour = setExitBearing(tour, "a", "l1", undefined);
    expect(exitsOf(tour, "a")[0]).toMatchObject({ bearing: 90, custom: false });
  });

  it("removeRoom_LinkedStartRoom_DropsLinksAndMovesStart", () => {
    const tour = removeRoom(addLink(twoRooms(), "a", "b").tour, "a");
    expect(tour.links).toEqual([]);
    expect(tour.startRoomId).toBe("b");
    expect(removeRoom(tour, "b").startRoomId).toBeUndefined();
  });

  it("resizeGrid_SmallerThanRooms_KeepsRoomsInside", () => {
    expect(resizeGrid(twoRooms(), { cols: 3, rows: 1 }).grid).toEqual({ cols: 6, rows: 2 });
    expect(resizeGrid(twoRooms(), { cols: 500, rows: 20 }).grid).toEqual({ cols: 60, rows: 20 });
  });

  it("startRoom_StartWithoutPanorama_FirstRoomWithOne", () => {
    let tour = twoRooms();
    expect(startRoom(tour)).toBeUndefined();
    tour = updateRoom(tour, "b", { panoramaId: "p2" });
    expect(startRoom(tour)?.id).toBe("b");
  });
});

describe("validateTour", () => {
  it("validateTour_Problems_AllReported", () => {
    let tour = twoRooms();
    tour = addRoom(tour, { x: 1, y: 1, w: 2, h: 2 }, "c").tour; // overlaps a
    tour = addRoom(tour, { x: 8, y: 4, w: 1, h: 1 }, "d").tour;
    tour = addLink(tour, "a", "b", "ab").tour;
    tour = addLink(tour, "c", "d", "cd").tour;
    tour = updateRoom(tour, "a", { panoramaId: "p1" });
    tour = updateRoom(tour, "b", { panoramaId: "gone" });
    const kinds = validateTour(tour, [{ id: "p1", url: "p1.jpg" }]).map(
      (i) => i.kind + ":" + ("roomId" in i ? i.roomId : ""),
    );
    expect(kinds).toEqual(
      expect.arrayContaining(["missingPanorama:b", "noPanorama:c", "overlap:a", "unreachable:c", "unreachable:d"]),
    );
  });

  it("validateTour_OneWayIntoARoom_DeadEnd", () => {
    let tour = addLink(twoRooms(), "a", "b", "ab").tour;
    tour = updateLink(tour, "ab", { twoWay: false });
    expect(validateTour(tour).map((i) => i.kind)).toContain("deadEnd");
  });

  it("validateTour_Empty_NoRooms", () => {
    expect(validateTour(createTour())).toEqual([{ kind: "noRooms" }]);
  });
});

describe("parseTour", () => {
  it("parseTour_RoundTrip_Equal", () => {
    let tour = addLink(twoRooms(), "a", "b", "l1").tour;
    tour = updateRoom(tour, "a", { name: { en: "Hall" }, panoramaId: "p1", heading: 30 });
    tour = setExitBearing(tour, "b", "l1", 200);
    expect(parseTour(JSON.parse(JSON.stringify(tour)))).toEqual(tour);
  });

  it("parseTour_Garbage_DroppedOrUndefined", () => {
    expect(parseTour(null)).toBeUndefined();
    expect(parseTour({ version: 2, rooms: [], links: [] })).toBeUndefined();
    const tour = parseTour({
      version: 1,
      grid: { cols: 1000, rows: "x" },
      rooms: [{ id: "a", x: -5, y: 0, w: 2, h: 2, name: { en: " Hall ", ru: 5 } }, { id: "a" }, { nope: true }],
      links: [{ id: "l", from: "a", to: "missing" }],
      startRoomId: "missing",
    });
    expect(tour).toEqual({
      version: 1,
      grid: { cols: 60, rows: 8 },
      rooms: [{ id: "a", x: 0, y: 0, w: 2, h: 2, name: { en: "Hall" }, heading: 0 }],
      links: [],
    });
  });
});

describe("tourToNodes", () => {
  it("tourToNodes_RoomsWithPanoramas_NodesWithCorrectionAndArrows", () => {
    let tour = twoRooms();
    tour = addRoom(tour, { x: 0, y: 4, w: 2, h: 2 }, "c").tour; // no panorama
    tour = addLink(tour, "a", "b", "ab").tour;
    tour = addLink(tour, "a", "c", "ac").tour;
    tour = updateRoom(tour, "a", { panoramaId: "p1", heading: 90, name: { en: "Hall", ru: "Холл" } });
    tour = updateRoom(tour, "b", { panoramaId: "p2" });
    const nodes = tourToNodes(
      tour,
      [
        { id: "p1", url: "1.jpg", thumbnailUrl: "1s.jpg" },
        { id: "p2", url: "2.jpg" },
      ],
      "ru",
    );
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(nodes[0]).toMatchObject({ panorama: "1.jpg", name: "Холл", thumbnail: "1s.jpg" });
    expect(nodes[0]!.sphereCorrection!.pan).toBeCloseTo(Math.PI / 2);
    expect(nodes[0]!.links).toHaveLength(1);
    expect(nodes[0]!.links![0]!.nodeId).toBe("b");
    expect((nodes[0]!.links![0]!.position as { yaw: number }).yaw).toBeCloseTo(Math.PI / 2);
    expect(nodes[1]!.links![0]!.nodeId).toBe("a");
  });
});
