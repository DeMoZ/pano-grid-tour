import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  center,
  HANDLES,
  handlePoint,
  linkAnchor,
  moveRect,
  rectFromCells,
  resizeRect,
  sameRect,
  type Handle,
  type Point,
} from "../model/geometry";
import { displayName, findRoom } from "../model/tour";
import type { PanoramaSource, Rect, Tour } from "../model/types";
import type { Labels } from "../labels";

export type Tool = "select" | "room" | "link";
export type Selection = { kind: "room"; id: string } | { kind: "link"; id: string } | null;

export interface GridCanvasProps {
  tour: Tour;
  panoramas: ReadonlyMap<string, PanoramaSource>;
  tool: Tool;
  selection: Selection;
  linkSourceId: string | undefined;
  /** Rooms with a problem, marked with "!". */
  flagged: ReadonlySet<string>;
  lang: string | undefined;
  labels: Labels;
  onCreateRoom: (rect: Rect) => void;
  onSelect: (selection: Selection) => void;
  onRoomRect: (id: string, rect: Rect) => void;
  onLinkTap: (roomId: string | undefined) => void;
}

type Drag =
  | { kind: "draw"; start: Point; moved: boolean }
  | { kind: "move"; id: string; origin: Rect; start: Point; moved: boolean }
  | { kind: "resize"; id: string; origin: Rect; handle: Handle };

/** Finger-sized hit area for handles and links, in CSS pixels. */
const HIT_PX = 22;
/** Pointer travel (px) after which a press counts as a drag, not a tap. */
const DRAG_PX = 6;

export function GridCanvas(props: GridCanvasProps) {
  const { tour, panoramas, tool, selection, linkSourceId, flagged, lang, labels } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const downAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draft, setDraft] = useState<{ id: string | null; rect: Rect } | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [pxPerCell, setPxPerCell] = useState(40);
  const { cols, rows } = tour.grid;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }
    const update = () => {
      const box = svg.getBoundingClientRect();
      if (box.width > 0) {
        setPxPerCell(Math.min(box.width / cols, box.height / rows));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [cols, rows]);

  useEffect(() => {
    if (!linkSourceId) {
      setHover(null);
    }
  }, [linkSourceId]);

  const hit = HIT_PX / pxPerCell;
  const dot = 7 / pxPerCell;

  function toGrid(e: { clientX: number; clientY: number }): Point {
    const svg = svgRef.current!;
    const matrix = svg.getScreenCTM()?.inverse();
    const point = new DOMPoint(e.clientX, e.clientY);
    const p = matrix ? point.matrixTransform(matrix) : point;
    return { x: p.x, y: p.y };
  }

  function travelled(e: PointerEvent): boolean {
    return Math.hypot(e.clientX - downAt.current.x, e.clientY - downAt.current.y) > DRAG_PX;
  }

  function begin(e: PointerEvent, drag: Drag) {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    downAt.current = { x: e.clientX, y: e.clientY };
    dragRef.current = drag;
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  function onBackgroundDown(e: PointerEvent<SVGSVGElement>) {
    // Keep keyboard shortcuts (undo, delete) working after a tap on the plan.
    svgRef.current?.focus({ preventScroll: true });
    if (tool === "room") {
      begin(e, { kind: "draw", start: toGrid(e), moved: false });
    } else if (tool === "link") {
      props.onLinkTap(undefined);
    } else {
      props.onSelect(null);
    }
  }

  function onRoomDown(e: PointerEvent, id: string) {
    const room = findRoom(tour, id);
    if (!room) {
      return;
    }
    (e.currentTarget as SVGGElement).focus({ preventScroll: true });
    if (tool === "link") {
      e.stopPropagation();
      props.onLinkTap(id);
      return;
    }
    if (tool === "room") {
      // Drawing over an existing room is allowed: start a new rectangle.
      begin(e, { kind: "draw", start: toGrid(e), moved: false });
      return;
    }
    props.onSelect({ kind: "room", id });
    begin(e, { kind: "move", id, origin: room, start: toGrid(e), moved: false });
  }

  function onHandleDown(e: PointerEvent, id: string, handle: Handle) {
    const room = findRoom(tour, id);
    if (room) {
      begin(e, { kind: "resize", id, origin: room, handle });
    }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) {
      if (linkSourceId) {
        setHover(toGrid(e));
      }
      return;
    }
    const p = toGrid(e);
    if (drag.kind === "draw") {
      if (!drag.moved && !travelled(e)) {
        return;
      }
      drag.moved = true;
      setDraft({ id: null, rect: rectFromCells(drag.start, p, tour.grid) });
    } else if (drag.kind === "move") {
      if (!drag.moved && !travelled(e)) {
        return;
      }
      drag.moved = true;
      setDraft({ id: drag.id, rect: moveRect(drag.origin, p.x - drag.start.x, p.y - drag.start.y, tour.grid) });
    } else {
      setDraft({ id: drag.id, rect: resizeRect(drag.origin, drag.handle, p, tour.grid) });
    }
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    const current = draft;
    setDraft(null);
    if (!drag) {
      return;
    }
    if (drag.kind === "draw") {
      const rect = drag.moved && current ? current.rect : tapRoom(drag.start);
      props.onCreateRoom(rect);
    } else if (current && current.id && !sameRect(current.rect, drag.origin)) {
      props.onRoomRect(current.id, current.rect);
    }
  }

  function onPointerCancel() {
    dragRef.current = null;
    setDraft(null);
  }

  /** A 2 × 2 room around a tapped cell. */
  function tapRoom(p: Point): Rect {
    return rectFromCells(
      { x: Math.floor(p.x), y: Math.floor(p.y) },
      { x: Math.floor(p.x) + 1, y: Math.floor(p.y) + 1 },
      tour.grid,
    );
  }

  function onRoomKey(e: KeyboardEvent, id: string) {
    const room = findRoom(tour, id);
    if (!room) {
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (tool === "link") {
        props.onLinkTap(id);
      } else {
        props.onSelect({ kind: "room", id });
      }
      return;
    }
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[e.key];
    if (!delta) {
      return;
    }
    e.preventDefault();
    const [dx, dy] = delta;
    const rect = e.shiftKey
      ? resizeRect(room, "se", { x: room.x + room.w + dx, y: room.y + room.h + dy }, tour.grid)
      : moveRect(room, dx, dy, tour.grid);
    props.onSelect({ kind: "room", id });
    if (!sameRect(rect, room)) {
      props.onRoomRect(id, rect);
    }
  }

  const rectOf = (id: string, rect: Rect): Rect => (draft && draft.id === id ? draft.rect : rect);
  const selectedRoomId = selection?.kind === "room" ? selection.id : undefined;
  const linkSource = findRoom(tour, linkSourceId);

  return (
    <svg
      ref={svgRef}
      className={`pgt-canvas tool-${tool}`}
      viewBox={`0 0 ${cols} ${rows}`}
      role="application"
      aria-label={labels.canvasLabel}
      tabIndex={-1}
      onPointerDown={onBackgroundDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => setHover(null)}
    >
      <rect className="pgt-grid-bg" x={0} y={0} width={cols} height={rows} />
      <g className="pgt-grid-lines">
        {Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`c${i}`} x1={i} y1={0} x2={i} y2={rows} />
        ))}
        {Array.from({ length: rows + 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i} x2={cols} y2={i} />
        ))}
      </g>
      <text className="pgt-grid-up" x={cols / 2} y={0.32} fontSize={Math.max(0.22, 9 / pxPerCell)}>
        ▲
      </text>

      {tour.rooms.map((room) => {
        const rect = rectOf(room.id, room);
        const source = room.panoramaId ? panoramas.get(room.panoramaId) : undefined;
        const image = source?.thumbnailUrl ?? source?.url;
        const name = displayName(tour, room, lang, labels.unnamedRoom);
        const selected = room.id === selectedRoomId;
        const fontSize = Math.max(0.18, Math.min(0.42, rect.w * 0.16, rect.h * 0.3, 15 / pxPerCell));
        return (
          <g
            key={room.id}
            className={`pgt-room${selected ? " is-selected" : ""}${room.id === linkSourceId ? " is-link-source" : ""}`}
            tabIndex={0}
            role="button"
            aria-label={name}
            aria-pressed={selected}
            onPointerDown={(e) => onRoomDown(e, room.id)}
            onKeyDown={(e) => onRoomKey(e, room.id)}
          >
            <rect className="pgt-room-fill" x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
            {image && (
              <image
                href={image}
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                preserveAspectRatio="xMidYMid slice"
                className="pgt-room-image"
              />
            )}
            <rect className="pgt-room-outline" x={rect.x} y={rect.y} width={rect.w} height={rect.h} />
            <text className="pgt-room-name" x={rect.x + rect.w / 2} y={rect.y + rect.h / 2} fontSize={fontSize}>
              {name}
            </text>
            {tour.startRoomId === room.id && (
              <text className="pgt-room-start" x={rect.x + 0.08} y={rect.y + 0.08} fontSize={fontSize}>
                ★
              </text>
            )}
            {flagged.has(room.id) && (
              <g className="pgt-room-flag">
                <circle cx={rect.x + rect.w - 0.25} cy={rect.y + 0.25} r={Math.min(0.2, rect.w / 4)} />
                <text x={rect.x + rect.w - 0.25} y={rect.y + 0.25} fontSize={Math.min(0.28, rect.w / 3)}>
                  !
                </text>
              </g>
            )}
          </g>
        );
      })}

      {tour.links.map((link) => {
        const a = findRoom(tour, link.from);
        const b = findRoom(tour, link.to);
        if (!a || !b) {
          return null;
        }
        const ra = rectOf(a.id, a);
        const rb = rectOf(b.id, b);
        const pa = center(ra);
        const pb = center(rb);
        const anchor = linkAnchor(ra, rb);
        const selected = selection?.kind === "link" && selection.id === link.id;
        const angle = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
        return (
          <g key={link.id} className={`pgt-link${selected ? " is-selected" : ""}${link.twoWay ? "" : " is-one-way"}`}>
            {/* Drawn between the walls (nothing for rooms that touch); only the badge takes taps. */}
            <line className="pgt-link-line" x1={anchor.from.x} y1={anchor.from.y} x2={anchor.to.x} y2={anchor.to.y} />
            <g
              className="pgt-link-badge"
              role="button"
              tabIndex={0}
              aria-label={labels.linkBetween(
                displayName(tour, a, lang, labels.unnamedRoom),
                displayName(tour, b, lang, labels.unnamedRoom),
              )}
              aria-pressed={selected}
              onPointerDown={(e) => {
                if (tool !== "room") {
                  e.stopPropagation();
                  props.onSelect({ kind: "link", id: link.id });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  props.onSelect({ kind: "link", id: link.id });
                }
              }}
            >
              <circle className="pgt-link-hit" cx={anchor.mid.x} cy={anchor.mid.y} r={hit} />
              <circle className="pgt-link-dot" cx={anchor.mid.x} cy={anchor.mid.y} r={dot * 1.7} />
              <path
                className="pgt-link-glyph"
                transform={`translate(${anchor.mid.x} ${anchor.mid.y}) rotate(${angle}) scale(${dot})`}
                d={
                  link.twoWay
                    ? "M -1.1 0 L -0.3 -0.7 L -0.3 0.7 Z M 1.1 0 L 0.3 -0.7 L 0.3 0.7 Z"
                    : "M 1.1 0 L -0.6 -0.9 L -0.6 0.9 Z"
                }
              />
            </g>
          </g>
        );
      })}

      {linkSource && hover && (
        <line
          className="pgt-link-pending"
          x1={center(linkSource).x}
          y1={center(linkSource).y}
          x2={hover.x}
          y2={hover.y}
        />
      )}

      {draft && draft.id === null && (
        <rect className="pgt-room-draft" x={draft.rect.x} y={draft.rect.y} width={draft.rect.w} height={draft.rect.h} />
      )}

      {tool === "select" &&
        selectedRoomId &&
        (() => {
          const room = findRoom(tour, selectedRoomId);
          if (!room) {
            return null;
          }
          const rect = rectOf(room.id, room);
          // Small rooms keep their middle free for moving.
          const handleHit = Math.min(hit, Math.min(rect.w, rect.h) / 3);
          return (
            <g className="pgt-handles">
              {HANDLES.map((handle) => {
                const p = handlePoint(rect, handle);
                return (
                  <g
                    key={handle}
                    className={`pgt-handle handle-${handle}`}
                    onPointerDown={(e) => onHandleDown(e, room.id, handle)}
                  >
                    <circle className="pgt-handle-hit" cx={p.x} cy={p.y} r={handleHit} />
                    <circle className="pgt-handle-dot" cx={p.x} cy={p.y} r={dot} />
                  </g>
                );
              })}
            </g>
          );
        })()}
    </svg>
  );
}
