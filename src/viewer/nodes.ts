import type { VirtualTourNode } from "@photo-sphere-viewer/virtual-tour-plugin";
import { cubeOrder, isCubestrip } from "../model/cubemap";
import { exitsOf, roomName } from "../model/tour";
import type { PanoramaSource, Room, Tour } from "../model/types";

export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Rotation that turns a room's panorama so that viewer yaw 0 looks up the grid.
 * With it, every room shares one set of directions: yaw = bearing on the grid.
 * (Photo Sphere Viewer shows the photo's own yaw `yaw + pan`, checked in a browser.)
 */
export function sphereCorrection(room: Room): { pan: number } {
  return { pan: toRadians(room.heading) };
}

/**
 * The tour as Photo Sphere Viewer nodes. Rooms without a known panorama are left out,
 * and so are the arrows leading to them. Cubestrips become cubemap panoramas: the viewer
 * then needs the cubemap adapter (see `viewerProjection`).
 */
export function tourToNodes(tour: Tour, panoramas: readonly PanoramaSource[], lang?: string): VirtualTourNode[] {
  const byId = new Map(panoramas.map((p) => [p.id, p]));
  const shown = (room: Room) => room.panoramaId !== undefined && byId.has(room.panoramaId);

  return tour.rooms.filter(shown).map((room) => {
    const source = byId.get(room.panoramaId!)!;
    const node: VirtualTourNode = {
      id: room.id,
      // flipTopBottom: our top/bottom faces touch the front with their lower/upper edge (as in a cross layout,
      // and as `cubeLookup` reads them); Photo Sphere Viewer expects them turned 180° otherwise.
      panorama: isCubestrip(source)
        ? { type: "stripe", path: source.url, order: [...cubeOrder(source)], flipTopBottom: true }
        : source.url,
      name: roomName(room, lang),
      sphereCorrection: sphereCorrection(room),
      links: exitsOf(tour, room.id)
        .filter((exit) => shown(exit.to))
        .map((exit) => ({ nodeId: exit.to.id, position: { yaw: toRadians(exit.bearing), pitch: 0 } })),
    };
    if (source.thumbnailUrl) {
      node.thumbnail = source.thumbnailUrl;
    }
    return node;
  });
}

/**
 * The projection one viewer uses for a tour: cubemap when every shown panorama is a
 * cubestrip, equirectangular otherwise (cubestrips are then redrawn as equirectangular).
 */
export function viewerProjection(tour: Tour, panoramas: readonly PanoramaSource[]): "cubemap" | "equirectangular" {
  const byId = new Map(panoramas.map((p) => [p.id, p]));
  const shown = tour.rooms.flatMap((room) => {
    const source = room.panoramaId ? byId.get(room.panoramaId) : undefined;
    return source ? [source] : [];
  });
  return shown.length > 0 && shown.every(isCubestrip) ? "cubemap" : "equirectangular";
}
