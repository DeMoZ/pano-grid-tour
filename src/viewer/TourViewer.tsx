import { Viewer } from "@photo-sphere-viewer/core";
import { VirtualTourPlugin, type VirtualTourNode } from "@photo-sphere-viewer/virtual-tour-plugin";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { mergeLabels, type Labels } from "../labels";
import { normalizeDegrees } from "../model/geometry";
import { startRoom } from "../model/tour";
import type { PanoramaSource, Tour } from "../model/types";
import { MiniMap } from "./MiniMap";
import { toDegrees, toRadians, tourToNodes } from "./nodes";

export interface TourViewerProps {
  tour: Tour;
  panoramas: readonly PanoramaSource[];
  /** Language of room names. */
  lang?: string;
  /** Room to show. When it changes, the viewer moves there. Defaults to the tour's start room. */
  roomId?: string;
  /** Called when the visitor moves to another room (arrow or map). */
  onRoomChange?: (roomId: string) => void;
  /** Show the rooms map in a corner. */
  miniMap?: boolean;
  labels?: Partial<Labels>;
  className?: string;
}

export interface TourViewerHandle {
  /** Current viewing direction in degrees clockwise from the top of the grid. */
  getBearing(): number;
  /** Turns the view to a direction (degrees clockwise from the top of the grid). */
  lookAt(bearing: number): void;
  goTo(roomId: string): void;
}

type Plugin = InstanceType<typeof VirtualTourPlugin>;

/** 360° tour: arrows between rooms, plus an optional map of the rooms. */
export const TourViewer = forwardRef<TourViewerHandle, TourViewerProps>(function TourViewer(
  { tour, panoramas, lang, roomId, onRoomChange, miniMap = true, labels: labelOverrides, className },
  ref,
) {
  const labels = mergeLabels(labelOverrides);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pluginRef = useRef<Plugin | null>(null);
  const lastNodes = useRef<Map<string, string>>(new Map());
  /** The room last asked of the plugin (it may still be loading): never ask twice. */
  const requested = useRef<string | undefined>(undefined);
  const onRoomChangeRef = useRef(onRoomChange);
  onRoomChangeRef.current = onRoomChange;

  const nodes = useMemo(() => tourToNodes(tour, panoramas, lang), [tour, panoramas, lang]);
  const available = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const initialRoom = roomId && available.has(roomId) ? roomId : startRoom(tour)?.id;
  const [currentRoomId, setCurrentRoomId] = useState<string | undefined>(initialRoom);
  const [bearing, setBearing] = useState(0);
  const [fov, setFov] = useState(90);
  const [mapOpen, setMapOpen] = useState(true);
  const hasNodes = nodes.length > 0;

  // Create the viewer once there is something to show; destroy it when that's gone.
  useEffect(() => {
    if (!hasNodes || !containerRef.current) {
      return;
    }
    const start = initialRoom && available.has(initialRoom) ? initialRoom : nodes[0]!.id;
    const viewer = new Viewer({
      container: containerRef.current,
      navbar: ["zoom", "move", "caption", "fullscreen"],
      defaultYaw: 0,
      touchmoveTwoFingers: false,
      mousewheelCtrlKey: false,
      plugins: [
        VirtualTourPlugin.withConfig({
          positionMode: "manual",
          renderMode: "3d",
          nodes: withCaptions(nodes),
          startNodeId: start,
          preload: true,
          transitionOptions: { showLoader: true, effect: "fade", speed: "20rpm", rotation: true },
        }),
      ],
    });
    const plugin = viewer.getPlugin<Plugin>(VirtualTourPlugin);
    viewerRef.current = viewer;
    pluginRef.current = plugin;
    lastNodes.current = fingerprint(nodes);
    requested.current = start;

    viewer.addEventListener("position-updated", ({ position }) => {
      setBearing(normalizeDegrees(toDegrees(position.yaw)));
    });
    viewer.addEventListener("zoom-updated", () => setFov(viewer.state.hFov));
    viewer.addEventListener("ready", () => setFov(viewer.state.hFov), { once: true });
    plugin.addEventListener("node-changed", ({ node }) => {
      requested.current = node.id;
      setCurrentRoomId(node.id);
      onRoomChangeRef.current?.(node.id);
    });

    return () => {
      // A node still loading would finish against a destroyed plugin and throw; mark it aborted.
      (plugin as unknown as { state: { loadingNode: string | null } }).state.loadingNode = null;
      viewer.destroy();
      viewerRef.current = null;
      pluginRef.current = null;
      lastNodes.current = new Map();
    };
    // The viewer is created once; later changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNodes]);

  // Apply tour changes without recreating the viewer.
  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin || nodes.length === 0) {
      return;
    }
    const next = fingerprint(nodes);
    const previous = lastNodes.current;
    if (next.size === previous.size && [...next.keys()].every((id) => previous.has(id))) {
      const currentId = plugin.getCurrentNode()?.id;
      for (const node of withCaptions(nodes)) {
        const before = previous.get(node.id);
        if (before === next.get(node.id)) {
          continue;
        }
        const oldPan = (JSON.parse(before!) as VirtualTourNode).sphereCorrection?.pan ?? 0;
        const newPan = node.sphereCorrection?.pan ?? 0;
        const viewer = viewerRef.current;
        if (
          node.id === currentId &&
          viewer &&
          typeof oldPan === "number" &&
          typeof newPan === "number" &&
          oldPan !== newPan
        ) {
          // The room was turned: the panorama reloads, then keep looking at the same spot of the photo.
          const { yaw, pitch } = viewer.getPosition();
          const target = { yaw: yaw + oldPan - newPan, pitch };
          plugin.addEventListener("node-changed", () => viewer.rotate(target), { once: true });
        }
        plugin.updateNode(node);
      }
    } else {
      const current = requested.current;
      const target = current && next.has(current) ? current : (startRoom(tour)?.id ?? nodes[0]!.id);
      requested.current = target;
      plugin.setNodes(withCaptions(nodes), target);
    }
    lastNodes.current = next;
  }, [nodes, tour]);

  // Follow the controlled room.
  useEffect(() => {
    const plugin = pluginRef.current;
    if (plugin && roomId && available.has(roomId) && requested.current !== roomId) {
      requested.current = roomId;
      void plugin.setCurrentNode(roomId);
    }
  }, [roomId, available]);

  useImperativeHandle(
    ref,
    () => ({
      getBearing: () => normalizeDegrees(toDegrees(viewerRef.current?.getPosition().yaw ?? 0)),
      lookAt: (value: number) => viewerRef.current?.rotate({ yaw: toRadians(value), pitch: 0 }),
      goTo: (id: string) => {
        requested.current = id;
        void pluginRef.current?.setCurrentNode(id);
      },
    }),
    [],
  );

  return (
    <div className={`pgt-viewer${className ? ` ${className}` : ""}`}>
      {hasNodes ? (
        <div ref={containerRef} className="pgt-viewer-canvas" />
      ) : (
        <div className="pgt-viewer-empty">{labels.emptyTour}</div>
      )}
      {hasNodes && miniMap && tour.rooms.length > 1 && (
        <div className={`pgt-minimap${mapOpen ? "" : " is-closed"}`}>
          <button
            type="button"
            className="pgt-minimap-toggle"
            aria-expanded={mapOpen}
            onClick={() => setMapOpen((open) => !open)}
          >
            {mapOpen ? labels.hideMap : labels.showMap}
          </button>
          {mapOpen && (
            <MiniMap
              tour={tour}
              available={available}
              currentRoomId={currentRoomId}
              yaw={bearing}
              fov={fov}
              lang={lang}
              labels={labels}
              onSelect={(id) => {
                requested.current = id;
                void pluginRef.current?.setCurrentNode(id);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
});

function withCaptions(nodes: VirtualTourNode[]): VirtualTourNode[] {
  return nodes.map((node) => (node.name ? { ...node, caption: node.name } : node));
}

function fingerprint(nodes: VirtualTourNode[]): Map<string, string> {
  return new Map(nodes.map((node) => [node.id, JSON.stringify(node)]));
}
