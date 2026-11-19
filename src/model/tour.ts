import { bearing, center, clampRect, normalizeDegrees } from "./geometry";
import type { GridSize, Link, Rect, Room, Tour } from "./types";

/** Pure operations on a tour. Every function returns a new tour and never mutates its input. */

export const DEFAULT_GRID: GridSize = { cols: 12, rows: 8 };
export const MIN_GRID = 2;
export const MAX_GRID = 60;

export function createTour(grid: GridSize = DEFAULT_GRID): Tour {
  return { version: 1, grid: { ...grid }, rooms: [], links: [] };
}

let counter = 0;

/** Short random id with a prefix: `r_k3x9q2`. */
export function newId(prefix: string): string {
  counter = (counter + 1) % 1296;
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${random}${counter.toString(36).padStart(2, "0")}`;
}

export function findRoom(tour: Tour, id: string | undefined): Room | undefined {
  return id === undefined ? undefined : tour.rooms.find((room) => room.id === id);
}

export function findLink(tour: Tour, id: string | undefined): Link | undefined {
  return id === undefined ? undefined : tour.links.find((link) => link.id === id);
}

export function addRoom(tour: Tour, rect: Rect, id: string = newId("r")): { tour: Tour; id: string } {
  const room: Room = { id, name: {}, heading: 0, ...clampRect(rect, tour.grid) };
  const next = { ...tour, rooms: [...tour.rooms, room] };
  return { tour: next.startRoomId ? next : { ...next, startRoomId: id }, id };
}

export type RoomPatch = Partial<Omit<Room, "id">>;

export function updateRoom(tour: Tour, id: string, patch: RoomPatch): Tour {
  return {
    ...tour,
    rooms: tour.rooms.map((room) => {
      if (room.id !== id) {
        return room;
      }
      const merged = { ...room, ...patch };
      return {
        ...merged,
        ...clampRect(merged, tour.grid),
        heading: normalizeDegrees(merged.heading),
      };
    }),
  };
}

/** Removes a room and every link to or from it. */
export function removeRoom(tour: Tour, id: string): Tour {
  const rooms = tour.rooms.filter((room) => room.id !== id);
  const links = tour.links.filter((link) => link.from !== id && link.to !== id);
  const startRoomId = tour.startRoomId === id ? rooms[0]?.id : tour.startRoomId;
  return withStart({ ...tour, rooms, links }, startRoomId);
}

function withStart(tour: Tour, startRoomId: string | undefined): Tour {
  const { startRoomId: _drop, ...rest } = tour;
  return startRoomId ? { ...rest, startRoomId } : rest;
}

export function setStartRoom(tour: Tour, id: string): Tour {
  return findRoom(tour, id) ? { ...tour, startRoomId: id } : tour;
}

/** Link between two rooms in either direction, if any. */
export function linkBetween(tour: Tour, a: string, b: string): Link | undefined {
  return tour.links.find((link) => (link.from === a && link.to === b) || (link.from === b && link.to === a));
}

/**
 * Links two rooms (two-way). Returns the existing link when the rooms are already
 * linked, and nothing for a room linked to itself or an unknown room.
 */
export function addLink(
  tour: Tour,
  from: string,
  to: string,
  id: string = newId("l"),
): { tour: Tour; id: string | undefined } {
  if (from === to || !findRoom(tour, from) || !findRoom(tour, to)) {
    return { tour, id: undefined };
  }
  const existing = linkBetween(tour, from, to);
  if (existing) {
    return { tour, id: existing.id };
  }
  return { tour: { ...tour, links: [...tour.links, { id, from, to, twoWay: true }] }, id };
}

export type LinkPatch = Partial<Pick<Link, "twoWay" | "fromBearing" | "toBearing">>;

export function updateLink(tour: Tour, id: string, patch: LinkPatch): Tour {
  return {
    ...tour,
    links: tour.links.map((link) => {
      if (link.id !== id) {
        return link;
      }
      const merged: Link = { ...link, ...patch };
      for (const key of ["fromBearing", "toBearing"] as const) {
        const value = merged[key];
        if (value === undefined || Number.isNaN(value)) {
          delete merged[key];
        } else {
          merged[key] = normalizeDegrees(value);
        }
      }
      if (!merged.twoWay) {
        delete merged.toBearing;
      }
      return merged;
    }),
  };
}

/** Swaps the direction of a link (useful for one-way links). */
export function reverseLink(tour: Tour, id: string): Tour {
  return {
    ...tour,
    links: tour.links.map((link) => {
      if (link.id !== id) {
        return link;
      }
      const reversed: Link = { id: link.id, from: link.to, to: link.from, twoWay: link.twoWay };
      if (link.toBearing !== undefined) {
        reversed.fromBearing = link.toBearing;
      }
      if (link.fromBearing !== undefined && link.twoWay) {
        reversed.toBearing = link.fromBearing;
      }
      return reversed;
    }),
  };
}

export function removeLink(tour: Tour, id: string): Tour {
  return { ...tour, links: tour.links.filter((link) => link.id !== id) };
}

/** Resizes the grid; never smaller than the rooms need. */
export function resizeGrid(tour: Tour, grid: GridSize): Tour {
  const needCols = Math.max(MIN_GRID, ...tour.rooms.map((room) => room.x + room.w));
  const needRows = Math.max(MIN_GRID, ...tour.rooms.map((room) => room.y + room.h));
  const cols = Math.min(MAX_GRID, Math.max(needCols, Math.round(grid.cols)));
  const rows = Math.min(MAX_GRID, Math.max(needRows, Math.round(grid.rows)));
  return { ...tour, grid: { cols, rows } };
}

/** An arrow leading out of a room. */
export interface Exit {
  link: Link;
  /** Room the arrow leads to. */
  to: Room;
  /** Direction of the arrow, degrees clockwise from the top of the grid. */
  bearing: number;
  /** True when the bearing was set by hand rather than computed from the room centres. */
  custom: boolean;
}

/** The arrows shown in a room: links from it, and two-way links to it. */
export function exitsOf(tour: Tour, roomId: string): Exit[] {
  const room = findRoom(tour, roomId);
  if (!room) {
    return [];
  }
  const exits: Exit[] = [];
  for (const link of tour.links) {
    const outgoing = link.from === roomId;
    const incoming = link.to === roomId && link.twoWay;
    if (!outgoing && !incoming) {
      continue;
    }
    const to = findRoom(tour, outgoing ? link.to : link.from);
    if (!to) {
      continue;
    }
    const manual = outgoing ? link.fromBearing : link.toBearing;
    exits.push({
      link,
      to,
      bearing: manual ?? bearing(center(room), center(to)),
      custom: manual !== undefined,
    });
  }
  return exits;
}

/** Sets the hand-placed bearing of the arrow from `roomId` along `linkId`; `undefined` resets it. */
export function setExitBearing(tour: Tour, roomId: string, linkId: string, value: number | undefined): Tour {
  const link = findLink(tour, linkId);
  if (!link) {
    return tour;
  }
  if (link.from === roomId) {
    return updateLink(tour, linkId, { fromBearing: value });
  }
  if (link.to === roomId && link.twoWay) {
    return updateLink(tour, linkId, { toBearing: value });
  }
  return tour;
}

/** The room name in a language, falling back to English, then any name. */
export function roomName(room: Room, lang?: string): string {
  return (lang ? room.name[lang] : undefined) || room.name.en || Object.values(room.name).find(Boolean) || "";
}

/** The room name, or a numbered fallback ("Room 3") for a room without one. */
export function displayName(tour: Tour, room: Room, lang: string | undefined, unnamed: (n: number) => string): string {
  return roomName(room, lang) || unnamed(tour.rooms.indexOf(room) + 1);
}

/** The room the viewer opens in. */
export function startRoom(tour: Tour): Room | undefined {
  const start = findRoom(tour, tour.startRoomId);
  if (start?.panoramaId) {
    return start;
  }
  return tour.rooms.find((room) => room.panoramaId);
}
