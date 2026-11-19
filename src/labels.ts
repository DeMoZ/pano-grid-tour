/**
 * Every text the components show. English defaults; hosts pass their own translations.
 * Functions take the values they mention.
 */
export interface Labels {
  // Viewer
  emptyTour: string;
  loading: string;
  showMap: string;
  hideMap: string;
  goToRoom: (name: string) => string;
  /** Name for a room without one; `n` = its place in the list, from 1. */
  unnamedRoom: (n: number) => string;

  // Editor tools
  toolSelect: string;
  toolRoom: string;
  toolLink: string;
  undo: string;
  redo: string;
  preview: string;
  closePreview: string;
  hintSelect: string;
  hintRoom: string;
  hintLink: string;
  hintLinkFrom: (name: string) => string;
  canvasLabel: string;

  // Room panel
  room: string;
  roomName: (lang: string) => string;
  panorama: string;
  noPanorama: string;
  panoramaUsedIn: (room: string) => string;
  noPanoramas: string;
  heading: string;
  headingHint: string;
  setHeadingHere: string;
  exits: string;
  noExits: string;
  setExitHere: (room: string) => string;
  resetExit: string;
  exitCustom: string;
  exitAuto: string;
  startRoom: string;
  isStartRoom: string;
  deleteRoom: string;
  degrees: (value: number) => string;

  // Link panel
  link: string;
  linkBetween: (from: string, to: string) => string;
  twoWay: string;
  oneWay: (from: string, to: string) => string;
  reverse: string;
  deleteLink: string;

  // Tour panel
  tour: string;
  gridSize: string;
  columns: string;
  rows: string;
  issues: string;
  noIssues: string;
  issueNoRooms: string;
  issueNoPanorama: (room: string) => string;
  issueMissingPanorama: (room: string) => string;
  issueOverlap: (room: string, other: string) => string;
  issueNoLinks: (room: string) => string;
  issueUnreachable: (room: string) => string;
  issueDeadEnd: (room: string) => string;
  issueBrokenLink: string;
}

export const defaultLabels: Labels = {
  emptyTour: "No panoramas in this tour yet.",
  loading: "Loading…",
  showMap: "Show map",
  hideMap: "Hide map",
  goToRoom: (name) => `Go to ${name}`,
  unnamedRoom: (n) => `Room ${n}`,

  toolSelect: "Select",
  toolRoom: "Add room",
  toolLink: "Link rooms",
  undo: "Undo",
  redo: "Redo",
  preview: "Preview",
  closePreview: "Close preview",
  hintSelect: "Tap a room to edit it. Drag to move, drag the dots to resize.",
  hintRoom: "Drag across the grid to draw a room, or tap for a 2 × 2 room.",
  hintLink: "Tap the room to start from.",
  hintLinkFrom: (name) => `Now tap the room to link with ${name}.`,
  canvasLabel: "Tour plan",

  room: "Room",
  roomName: (lang) => `Name (${lang.toUpperCase()})`,
  panorama: "360° photo",
  noPanorama: "None",
  panoramaUsedIn: (room) => `in ${room}`,
  noPanoramas: "No 360° photos uploaded yet.",
  heading: "Direction",
  headingHint: "Turn the photo to face the top of the plan, then press the button.",
  setHeadingHere: "This way is the top of the plan",
  exits: "Arrows",
  noExits: "No links yet. Use “Link rooms”.",
  setExitHere: (room) => `Arrow to ${room} here`,
  resetExit: "Auto",
  exitCustom: "placed by hand",
  exitAuto: "automatic",
  startRoom: "Start here",
  isStartRoom: "The tour starts here",
  deleteRoom: "Delete room",
  degrees: (value) => `${Math.round(value)}°`,

  link: "Link",
  linkBetween: (from, to) => `${from} ↔ ${to}`,
  twoWay: "Both ways",
  oneWay: (from, to) => `Only ${from} → ${to}`,
  reverse: "Reverse",
  deleteLink: "Delete link",

  tour: "Tour",
  gridSize: "Grid",
  columns: "Columns",
  rows: "Rows",
  issues: "Check",
  noIssues: "All rooms have a photo and can be reached.",
  issueNoRooms: "Add a room to start.",
  issueNoPanorama: (room) => `${room} has no 360° photo.`,
  issueMissingPanorama: (room) => `${room}: its 360° photo was deleted.`,
  issueOverlap: (room, other) => `${room} overlaps ${other}.`,
  issueNoLinks: (room) => `${room} isn't linked to any room.`,
  issueUnreachable: (room) => `${room} can't be reached from the start room.`,
  issueDeadEnd: (room) => `${room} has no way out.`,
  issueBrokenLink: "A link points to a deleted room.",
};

export function mergeLabels(labels?: Partial<Labels>): Labels {
  return labels ? { ...defaultLabels, ...labels } : defaultLabels;
}
