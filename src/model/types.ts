/**
 * A tour: rooms laid out as rectangles on a grid, each showing one 360° panorama,
 * plus explicit links (doorways) between rooms.
 *
 * Coordinates are grid cells: x grows to the right, y grows downwards, (0, 0) is the
 * top-left cell. The top of the grid is the tour's "up" direction: every panorama is
 * turned so that looking straight up the grid means the same direction in every room.
 */
export interface Tour {
  /** Format version, for migrations. */
  version: 1;
  /** Size of the drawing area, in cells. */
  grid: GridSize;
  rooms: Room[];
  links: Link[];
  /** Room the viewer opens in; the first room with a panorama when unset or missing. */
  startRoomId?: string;
}

export interface GridSize {
  cols: number;
  rows: number;
}

/** A rectangle in whole grid cells. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room extends Rect {
  id: string;
  /** Room name by language code, e.g. `{ en: "Kitchen", ru: "Кухня" }`. */
  name: Record<string, string>;
  /** The host's id of the panorama shown in this room. */
  panoramaId?: string;
  /**
   * The panorama's own yaw, in degrees, that faces the top of the grid.
   * 0 = the centre of the equirectangular image looks up the grid.
   */
  heading: number;
}

export interface Link {
  id: string;
  from: string;
  to: string;
  /** Walkable both ways (a doorway). One-way links only go from `from` to `to`. */
  twoWay: boolean;
  /**
   * Where the arrow to `to` sits in room `from`, as a direction in degrees clockwise
   * from the top of the grid. Unset = the direction from the centre of `from` to the
   * centre of `to`.
   */
  fromBearing?: number;
  /** Same for the arrow back to `from` in room `to` (two-way links only). */
  toBearing?: number;
}

/** A panorama the host can show: an equirectangular (2:1) image. */
export interface PanoramaSource {
  id: string;
  /** Full-size image URL for the 360° viewer. */
  url: string;
  /** Small preview (any aspect ratio) for the editor and link tooltips. */
  thumbnailUrl?: string;
  /** Shown in the editor's picker. */
  label?: string;
}
