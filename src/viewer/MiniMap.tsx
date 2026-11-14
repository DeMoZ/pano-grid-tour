import { useMemo } from "react";
import { center } from "../model/geometry";
import { displayName } from "../model/tour";
import type { Tour } from "../model/types";
import type { Labels } from "../labels";

export interface MiniMapProps {
  tour: Tour;
  /** Rooms that can be opened (have a panorama). */
  available: ReadonlySet<string>;
  currentRoomId: string | undefined;
  /** Viewing direction, degrees clockwise from the top of the grid. */
  yaw: number;
  /** Horizontal field of view in degrees. */
  fov: number;
  lang: string | undefined;
  labels: Labels;
  onSelect: (roomId: string) => void;
}

const PAD = 0.4;

/** The rooms as rectangles, the current one with a view cone. Tap a room to go there. */
export function MiniMap({ tour, available, currentRoomId, yaw, fov, lang, labels, onSelect }: MiniMapProps) {
  const box = useMemo(() => {
    if (tour.rooms.length === 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    const x0 = Math.min(...tour.rooms.map((r) => r.x));
    const y0 = Math.min(...tour.rooms.map((r) => r.y));
    const x1 = Math.max(...tour.rooms.map((r) => r.x + r.w));
    const y1 = Math.max(...tour.rooms.map((r) => r.y + r.h));
    return { x: x0 - PAD, y: y0 - PAD, w: x1 - x0 + 2 * PAD, h: y1 - y0 + 2 * PAD };
  }, [tour.rooms]);

  const current = tour.rooms.find((r) => r.id === currentRoomId);
  const cone = current ? conePath(center(current), yaw, fov, Math.min(current.w, current.h) * 0.45 + 0.4) : null;

  return (
    <svg
      className="pgt-minimap-svg"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={labels.canvasLabel}
    >
      {tour.links.map((link) => {
        const a = tour.rooms.find((r) => r.id === link.from);
        const b = tour.rooms.find((r) => r.id === link.to);
        if (!a || !b) {
          return null;
        }
        const pa = center(a);
        const pb = center(b);
        return <line key={link.id} className="pgt-minimap-link" x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} />;
      })}
      {tour.rooms.map((room) => {
        const name = displayName(tour, room, lang, labels.unnamedRoom);
        const enabled = available.has(room.id);
        const isCurrent = room.id === currentRoomId;
        return (
          <g
            key={room.id}
            className={`pgt-minimap-room${isCurrent ? " is-current" : ""}${enabled ? "" : " is-disabled"}`}
            role={enabled && !isCurrent ? "button" : undefined}
            tabIndex={enabled && !isCurrent ? 0 : undefined}
            aria-label={enabled && !isCurrent ? labels.goToRoom(name) : name}
            onClick={enabled && !isCurrent ? () => onSelect(room.id) : undefined}
            onKeyDown={
              enabled && !isCurrent
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(room.id);
                    }
                  }
                : undefined
            }
          >
            <rect x={room.x + 0.06} y={room.y + 0.06} width={room.w - 0.12} height={room.h - 0.12} rx={0.12} />
            <title>{name}</title>
          </g>
        );
      })}
      {cone && <path className="pgt-minimap-cone" d={cone} />}
      {current && <circle className="pgt-minimap-dot" cx={center(current).x} cy={center(current).y} r={0.16} />}
    </svg>
  );
}

/** A circle sector from `origin`, centred on `yaw` (degrees clockwise from up). */
export function conePath(origin: { x: number; y: number }, yaw: number, fov: number, radius: number): string {
  const half = Math.min(fov, 170) / 2;
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: origin.x + Math.sin(rad) * radius, y: origin.y - Math.cos(rad) * radius };
  };
  const a = point(yaw - half);
  const b = point(yaw + half);
  return `M ${origin.x} ${origin.y} L ${a.x} ${a.y} A ${radius} ${radius} 0 0 1 ${b.x} ${b.y} Z`;
}
