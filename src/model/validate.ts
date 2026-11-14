import { overlaps } from "./geometry";
import { exitsOf, findRoom, startRoom } from "./tour";
import type { PanoramaSource, Tour } from "./types";

export type TourIssue =
  | { kind: "noRooms" }
  | { kind: "noPanorama"; roomId: string }
  | { kind: "missingPanorama"; roomId: string; panoramaId: string }
  | { kind: "overlap"; roomId: string; otherRoomId: string }
  | { kind: "noLinks"; roomId: string }
  | { kind: "unreachable"; roomId: string }
  | { kind: "deadEnd"; roomId: string }
  | { kind: "brokenLink"; linkId: string };

/**
 * Problems that keep the tour from working as expected. None of them blocks saving:
 * rooms without a panorama are simply left out of the viewer.
 *
 * @param panoramas when given, panorama ids that aren't in the list are reported.
 */
export function validateTour(tour: Tour, panoramas?: readonly PanoramaSource[]): TourIssue[] {
  const issues: TourIssue[] = [];
  if (tour.rooms.length === 0) {
    return [{ kind: "noRooms" }];
  }
  const known = panoramas ? new Set(panoramas.map((p) => p.id)) : undefined;

  for (const link of tour.links) {
    if (!findRoom(tour, link.from) || !findRoom(tour, link.to) || link.from === link.to) {
      issues.push({ kind: "brokenLink", linkId: link.id });
    }
  }

  for (const room of tour.rooms) {
    if (!room.panoramaId) {
      issues.push({ kind: "noPanorama", roomId: room.id });
    } else if (known && !known.has(room.panoramaId)) {
      issues.push({ kind: "missingPanorama", roomId: room.id, panoramaId: room.panoramaId });
    }
  }

  for (let i = 0; i < tour.rooms.length; i++) {
    for (let j = i + 1; j < tour.rooms.length; j++) {
      const a = tour.rooms[i]!;
      const b = tour.rooms[j]!;
      if (overlaps(a, b)) {
        issues.push({ kind: "overlap", roomId: a.id, otherRoomId: b.id });
      }
    }
  }

  if (tour.rooms.length > 1) {
    for (const room of tour.rooms) {
      const linked = tour.links.some((link) => link.from === room.id || link.to === room.id);
      if (!linked) {
        issues.push({ kind: "noLinks", roomId: room.id });
      } else if (exitsOf(tour, room.id).length === 0) {
        issues.push({ kind: "deadEnd", roomId: room.id });
      }
    }

    const start = startRoom(tour) ?? tour.rooms[0]!;
    const reached = new Set([start.id]);
    const queue = [start.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const exit of exitsOf(tour, current)) {
        if (!reached.has(exit.to.id)) {
          reached.add(exit.to.id);
          queue.push(exit.to.id);
        }
      }
    }
    for (const room of tour.rooms) {
      const linked = tour.links.some((link) => link.from === room.id || link.to === room.id);
      if (linked && !reached.has(room.id)) {
        issues.push({ kind: "unreachable", roomId: room.id });
      }
    }
  }
  return issues;
}

/** Room ids an issue is about, for highlighting. */
export function issueRooms(issue: TourIssue): string[] {
  switch (issue.kind) {
    case "noRooms":
    case "brokenLink":
      return [];
    case "overlap":
      return [issue.roomId, issue.otherRoomId];
    default:
      return [issue.roomId];
  }
}
