import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { mergeLabels, type Labels } from "../labels";
import {
  addLink,
  addRoom,
  displayName,
  exitsOf,
  findLink,
  findRoom,
  removeLink,
  removeRoom,
  resizeGrid,
  reverseLink,
  setExitBearing,
  setStartRoom,
  updateLink,
  updateRoom,
} from "../model/tour";
import type { PanoramaSource, Room, Tour } from "../model/types";
import { issueRooms, validateTour, type TourIssue } from "../model/validate";
import { TourViewer, type TourViewerHandle } from "../viewer/TourViewer";
import { GridCanvas, type Selection, type Tool } from "./GridCanvas";
import { useHistory } from "./useHistory";

export interface TourEditorProps {
  value: Tour;
  onChange: (tour: Tour) => void;
  /** The 360° photos that can be put into rooms. */
  panoramas: readonly PanoramaSource[];
  /** Languages of room names, first = the one shown on the plan. Default `["en"]`. */
  languages?: readonly string[];
  labels?: Partial<Labels>;
  className?: string;
}

/** Visual editor: draw rooms on a grid, put a 360° photo in each, link the rooms. */
export function TourEditor({
  value: tour,
  onChange,
  panoramas,
  languages = ["en"],
  labels: overrides,
  className,
}: TourEditorProps) {
  const labels = mergeLabels(overrides);
  const lang = languages[0];
  const { commit, undo, redo, canUndo, canRedo } = useHistory(tour, onChange);
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [linkSourceId, setLinkSourceId] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);

  const panoramaMap = useMemo(() => new Map(panoramas.map((p) => [p.id, p])), [panoramas]);
  const issues = useMemo(() => validateTour(tour, panoramas), [tour, panoramas]);
  const flagged = useMemo(() => new Set(issues.flatMap(issueRooms)), [issues]);

  // Drop a selection whose room or link is gone (after undo, for example).
  useEffect(() => {
    if (selection?.kind === "room" && !findRoom(tour, selection.id)) {
      setSelection(null);
    } else if (selection?.kind === "link" && !findLink(tour, selection.id)) {
      setSelection(null);
    }
    if (linkSourceId && !findRoom(tour, linkSourceId)) {
      setLinkSourceId(undefined);
    }
  }, [tour, selection, linkSourceId]);

  const name = (room: Room | undefined) => (room ? displayName(tour, room, lang, labels.unnamedRoom) : "");

  function chooseTool(next: Tool) {
    setTool(next);
    setLinkSourceId(undefined);
  }

  function onLinkTap(roomId: string | undefined) {
    if (!roomId) {
      setLinkSourceId(undefined);
      return;
    }
    if (!linkSourceId || linkSourceId === roomId) {
      setLinkSourceId(linkSourceId === roomId ? undefined : roomId);
      setSelection({ kind: "room", id: roomId });
      return;
    }
    const result = addLink(tour, linkSourceId, roomId);
    commit(result.tour);
    if (result.id) {
      setSelection({ kind: "link", id: result.id });
    }
    // Keep linking from the room just reached: rooms are usually linked in a chain.
    setLinkSourceId(roomId);
  }

  function deleteSelection() {
    if (selection?.kind === "room") {
      commit(removeRoom(tour, selection.id));
    } else if (selection?.kind === "link") {
      commit(removeLink(tour, selection.id));
    }
    setSelection(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) {
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
    } else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
      e.preventDefault();
      deleteSelection();
    } else if (e.key === "Escape") {
      setLinkSourceId(undefined);
      setSelection(null);
    }
  }

  const selectedRoom = selection?.kind === "room" ? findRoom(tour, selection.id) : undefined;
  const selectedLink = selection?.kind === "link" ? findLink(tour, selection.id) : undefined;
  const hint =
    tool === "room"
      ? labels.hintRoom
      : tool === "link"
        ? linkSourceId
          ? labels.hintLinkFrom(name(findRoom(tour, linkSourceId)))
          : labels.hintLink
        : labels.hintSelect;

  return (
    <div className={`pgt-editor${className ? ` ${className}` : ""}`} onKeyDown={onKeyDown}>
      <div className="pgt-toolbar" role="toolbar">
        <div className="pgt-segmented">
          {(["select", "room", "link"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="pgt-button"
              aria-pressed={tool === t}
              onClick={() => chooseTool(t)}
            >
              {t === "select" ? labels.toolSelect : t === "room" ? labels.toolRoom : labels.toolLink}
            </button>
          ))}
        </div>
        <div className="pgt-toolbar-end">
          <button
            type="button"
            className="pgt-button"
            onClick={undo}
            disabled={!canUndo}
            aria-label={labels.undo}
            title={labels.undo}
          >
            ↶
          </button>
          <button
            type="button"
            className="pgt-button"
            onClick={redo}
            disabled={!canRedo}
            aria-label={labels.redo}
            title={labels.redo}
          >
            ↷
          </button>
          <button type="button" className="pgt-button" onClick={() => setPreviewOpen(true)}>
            {labels.preview}
          </button>
        </div>
      </div>
      <p className="pgt-hint" aria-live="polite">
        {hint}
      </p>

      <div className="pgt-editor-body">
        <div className="pgt-canvas-wrap">
          <GridCanvas
            tour={tour}
            panoramas={panoramaMap}
            tool={tool}
            selection={selection}
            linkSourceId={linkSourceId}
            flagged={flagged}
            lang={lang}
            labels={labels}
            onCreateRoom={(rect) => {
              const result = addRoom(tour, rect);
              commit(result.tour);
              setSelection({ kind: "room", id: result.id });
              setTool("select");
            }}
            onSelect={setSelection}
            onRoomRect={(id, rect) => commit(updateRoom(tour, id, rect))}
            onLinkTap={onLinkTap}
          />
        </div>

        <div className="pgt-panels">
          {selectedRoom && (
            <RoomPanel
              tour={tour}
              room={selectedRoom}
              panoramas={panoramas}
              languages={languages}
              labels={labels}
              name={name}
              commit={commit}
              onSelectRoom={(id) => setSelection({ kind: "room", id })}
              onDelete={deleteSelection}
            />
          )}
          {selectedLink && (
            <section className="pgt-panel">
              <h3 className="pgt-panel-title">{labels.link}</h3>
              <p>
                {labels.linkBetween(name(findRoom(tour, selectedLink.from)), name(findRoom(tour, selectedLink.to)))}
              </p>
              <fieldset className="pgt-radios">
                <label>
                  <input
                    type="radio"
                    checked={selectedLink.twoWay}
                    onChange={() => commit(updateLink(tour, selectedLink.id, { twoWay: true }))}
                  />
                  {labels.twoWay}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={!selectedLink.twoWay}
                    onChange={() => commit(updateLink(tour, selectedLink.id, { twoWay: false }))}
                  />
                  {labels.oneWay(name(findRoom(tour, selectedLink.from)), name(findRoom(tour, selectedLink.to)))}
                </label>
              </fieldset>
              <div className="pgt-row">
                {!selectedLink.twoWay && (
                  <button
                    type="button"
                    className="pgt-button"
                    onClick={() => commit(reverseLink(tour, selectedLink.id))}
                  >
                    {labels.reverse}
                  </button>
                )}
                <button type="button" className="pgt-button is-danger" onClick={deleteSelection}>
                  {labels.deleteLink}
                </button>
              </div>
            </section>
          )}
          <TourPanel
            tour={tour}
            issues={issues}
            labels={labels}
            name={name}
            commit={commit}
            onSelectRoom={(id) => setSelection({ kind: "room", id })}
          />
        </div>
      </div>

      {previewOpen && (
        <PreviewDialog
          tour={tour}
          panoramas={panoramas}
          lang={lang}
          labels={overrides}
          closeLabel={labels.closePreview}
          roomId={selectedRoom?.panoramaId ? selectedRoom.id : undefined}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

interface RoomPanelProps {
  tour: Tour;
  room: Room;
  panoramas: readonly PanoramaSource[];
  languages: readonly string[];
  labels: Labels;
  name: (room: Room | undefined) => string;
  commit: (tour: Tour, mergeKey?: string) => void;
  onSelectRoom: (id: string) => void;
  onDelete: () => void;
}

function RoomPanel({ tour, room, panoramas, languages, labels, name, commit, onSelectRoom, onDelete }: RoomPanelProps) {
  const viewer = useRef<TourViewerHandle>(null);
  const exits = exitsOf(tour, room.id);
  const usedBy = new Map(tour.rooms.filter((r) => r.panoramaId).map((r) => [r.panoramaId!, r]));
  const hasPanorama = room.panoramaId !== undefined && panoramas.some((p) => p.id === room.panoramaId);

  return (
    <section className="pgt-panel">
      <h3 className="pgt-panel-title">
        {labels.room}: {name(room)}
      </h3>
      {languages.map((lang) => (
        <label key={lang} className="pgt-field">
          <span>{labels.roomName(lang)}</span>
          <input
            type="text"
            value={room.name[lang] ?? ""}
            onChange={(e) => {
              const nextName = { ...room.name };
              if (e.target.value.trim() === "") {
                delete nextName[lang];
              } else {
                nextName[lang] = e.target.value;
              }
              commit(updateRoom(tour, room.id, { name: nextName }), `name:${room.id}:${lang}`);
            }}
          />
        </label>
      ))}

      <div className="pgt-field">
        <span>{labels.panorama}</span>
        {panoramas.length === 0 ? (
          <p className="pgt-muted">{labels.noPanoramas}</p>
        ) : (
          <div className="pgt-picker" role="radiogroup" aria-label={labels.panorama}>
            <button
              type="button"
              role="radio"
              aria-checked={!room.panoramaId}
              className="pgt-picker-item is-none"
              onClick={() => commit(updateRoom(tour, room.id, { panoramaId: undefined }))}
            >
              {labels.noPanorama}
            </button>
            {panoramas.map((p) => {
              const other = usedBy.get(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={room.panoramaId === p.id}
                  className="pgt-picker-item"
                  onClick={() => commit(updateRoom(tour, room.id, { panoramaId: p.id }))}
                >
                  <img src={p.thumbnailUrl ?? p.url} alt="" loading="lazy" />
                  <span>{p.label ?? p.id}</span>
                  {other && other.id !== room.id && <small>{labels.panoramaUsedIn(name(other))}</small>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasPanorama && (
        <div className="pgt-field">
          <span>{labels.heading}</span>
          <p className="pgt-muted">{labels.headingHint}</p>
          <div className="pgt-room-preview">
            <TourViewer
              ref={viewer}
              tour={tour}
              panoramas={panoramas}
              lang={languages[0]}
              roomId={room.id}
              miniMap={false}
              onRoomChange={(id) => id !== room.id && onSelectRoom(id)}
            />
            <div className="pgt-crosshair" aria-hidden="true" />
          </div>
          <div className="pgt-row">
            <button
              type="button"
              className="pgt-button is-primary"
              onClick={() => {
                const look = viewer.current?.getBearing() ?? 0;
                commit(updateRoom(tour, room.id, { heading: room.heading + look }));
              }}
            >
              {labels.setHeadingHere}
            </button>
            <label className="pgt-inline-field">
              <input
                type="number"
                min={0}
                max={359}
                step={1}
                value={Math.round(room.heading)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    commit(updateRoom(tour, room.id, { heading: v }), `heading:${room.id}`);
                  }
                }}
                aria-label={labels.heading}
              />
              °
            </label>
          </div>
        </div>
      )}

      <div className="pgt-field">
        <span>{labels.exits}</span>
        {exits.length === 0 ? (
          <p className="pgt-muted">{labels.noExits}</p>
        ) : (
          <ul className="pgt-exits">
            {exits.map((exit) => (
              <li key={exit.link.id}>
                <button type="button" className="pgt-link-button" onClick={() => viewer.current?.lookAt(exit.bearing)}>
                  → {name(exit.to)}
                </button>
                <span className="pgt-muted">
                  {labels.degrees(exit.bearing)} · {exit.custom ? labels.exitCustom : labels.exitAuto}
                </span>
                {hasPanorama && (
                  <span className="pgt-row">
                    <button
                      type="button"
                      className="pgt-button"
                      onClick={() =>
                        commit(
                          setExitBearing(tour, room.id, exit.link.id, viewer.current?.getBearing() ?? exit.bearing),
                        )
                      }
                    >
                      {labels.setExitHere(name(exit.to))}
                    </button>
                    {exit.custom && (
                      <button
                        type="button"
                        className="pgt-button"
                        onClick={() => commit(setExitBearing(tour, room.id, exit.link.id, undefined))}
                      >
                        {labels.resetExit}
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pgt-row">
        {tour.startRoomId === room.id ? (
          <span className="pgt-muted">★ {labels.isStartRoom}</span>
        ) : (
          <button type="button" className="pgt-button" onClick={() => commit(setStartRoom(tour, room.id))}>
            ★ {labels.startRoom}
          </button>
        )}
        <button type="button" className="pgt-button is-danger" onClick={onDelete}>
          {labels.deleteRoom}
        </button>
      </div>
    </section>
  );
}

interface TourPanelProps {
  tour: Tour;
  issues: TourIssue[];
  labels: Labels;
  name: (room: Room | undefined) => string;
  commit: (tour: Tour) => void;
  onSelectRoom: (id: string) => void;
}

function TourPanel({ tour, issues, labels, name, commit, onSelectRoom }: TourPanelProps) {
  const n = (id: string) => name(findRoom(tour, id));
  const text = (issue: TourIssue): string => {
    switch (issue.kind) {
      case "noRooms":
        return labels.issueNoRooms;
      case "noPanorama":
        return labels.issueNoPanorama(n(issue.roomId));
      case "missingPanorama":
        return labels.issueMissingPanorama(n(issue.roomId));
      case "overlap":
        return labels.issueOverlap(n(issue.roomId), n(issue.otherRoomId));
      case "noLinks":
        return labels.issueNoLinks(n(issue.roomId));
      case "unreachable":
        return labels.issueUnreachable(n(issue.roomId));
      case "deadEnd":
        return labels.issueDeadEnd(n(issue.roomId));
      case "brokenLink":
        return labels.issueBrokenLink;
    }
  };

  return (
    <section className="pgt-panel">
      <h3 className="pgt-panel-title">{labels.tour}</h3>
      <div className="pgt-row">
        <span>{labels.gridSize}</span>
        <label className="pgt-inline-field">
          <span>{labels.columns}</span>
          <input
            type="number"
            min={2}
            max={60}
            value={tour.grid.cols}
            onChange={(e) => commit(resizeGrid(tour, { ...tour.grid, cols: Number(e.target.value) || tour.grid.cols }))}
          />
        </label>
        <label className="pgt-inline-field">
          <span>{labels.rows}</span>
          <input
            type="number"
            min={2}
            max={60}
            value={tour.grid.rows}
            onChange={(e) => commit(resizeGrid(tour, { ...tour.grid, rows: Number(e.target.value) || tour.grid.rows }))}
          />
        </label>
      </div>
      <h4 className="pgt-panel-subtitle">{labels.issues}</h4>
      {issues.length === 0 ? (
        <p className="pgt-ok">✓ {labels.noIssues}</p>
      ) : (
        <ul className="pgt-issues">
          {issues.map((issue, i) => {
            const rooms = issueRooms(issue);
            return (
              <li key={i}>
                {rooms[0] ? (
                  <button type="button" className="pgt-link-button" onClick={() => onSelectRoom(rooms[0]!)}>
                    {text(issue)}
                  </button>
                ) : (
                  text(issue)
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface PreviewDialogProps {
  tour: Tour;
  panoramas: readonly PanoramaSource[];
  lang: string | undefined;
  labels: Partial<Labels> | undefined;
  closeLabel: string;
  roomId: string | undefined;
  onClose: () => void;
}

function PreviewDialog({ tour, panoramas, lang, labels, closeLabel, roomId, onClose }: PreviewDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pgt-dialog" role="dialog" aria-modal="true" aria-label={closeLabel}>
      <button ref={closeRef} type="button" className="pgt-button pgt-dialog-close" onClick={onClose}>
        ✕ {closeLabel}
      </button>
      <TourViewer tour={tour} panoramas={panoramas} lang={lang} labels={labels} {...(roomId ? { roomId } : {})} />
    </div>
  );
}
