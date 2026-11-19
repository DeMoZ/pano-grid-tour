import { clampRect, normalizeDegrees } from "./geometry";
import { DEFAULT_GRID, MAX_GRID, MIN_GRID } from "./tour";
import type { Link, Room, Tour } from "./types";

/**
 * Reads a tour from untrusted JSON (a database column, a file, localStorage).
 * Drops rooms and links it can't use instead of failing; returns `undefined` only
 * when the value isn't a tour at all.
 */
export function parseTour(value: unknown): Tour | undefined {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.rooms) || !Array.isArray(value.links)) {
    return undefined;
  }
  const gridValue = isObject(value.grid) ? value.grid : {};
  const grid = {
    cols: gridSide(gridValue.cols, DEFAULT_GRID.cols),
    rows: gridSide(gridValue.rows, DEFAULT_GRID.rows),
  };

  const rooms: Room[] = [];
  const ids = new Set<string>();
  for (const item of value.rooms) {
    if (!isObject(item) || typeof item.id !== "string" || item.id === "" || ids.has(item.id)) {
      continue;
    }
    const rect = { x: num(item.x, 0), y: num(item.y, 0), w: num(item.w, 1), h: num(item.h, 1) };
    const room: Room = {
      id: item.id,
      name: names(item.name),
      heading: normalizeDegrees(num(item.heading, 0)),
      ...clampRect(rect, grid),
    };
    if (typeof item.panoramaId === "string" && item.panoramaId !== "") {
      room.panoramaId = item.panoramaId;
    }
    ids.add(room.id);
    rooms.push(room);
  }

  const links: Link[] = [];
  const linkIds = new Set<string>();
  for (const item of value.links) {
    if (
      !isObject(item) ||
      typeof item.id !== "string" ||
      linkIds.has(item.id) ||
      typeof item.from !== "string" ||
      typeof item.to !== "string" ||
      item.from === item.to ||
      !ids.has(item.from) ||
      !ids.has(item.to)
    ) {
      continue;
    }
    const link: Link = { id: item.id, from: item.from, to: item.to, twoWay: item.twoWay !== false };
    if (typeof item.fromBearing === "number" && Number.isFinite(item.fromBearing)) {
      link.fromBearing = normalizeDegrees(item.fromBearing);
    }
    if (link.twoWay && typeof item.toBearing === "number" && Number.isFinite(item.toBearing)) {
      link.toBearing = normalizeDegrees(item.toBearing);
    }
    linkIds.add(link.id);
    links.push(link);
  }

  const tour: Tour = { version: 1, grid, rooms, links };
  if (typeof value.startRoomId === "string" && ids.has(value.startRoomId)) {
    tour.startRoomId = value.startRoomId;
  }
  return tour;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function gridSide(value: unknown, fallback: number): number {
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(num(value, fallback))));
}

function names(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (isObject(value)) {
    for (const [lang, text] of Object.entries(value)) {
      if (typeof text === "string" && text.trim() !== "") {
        result[lang] = text.trim();
      }
    }
  }
  return result;
}
