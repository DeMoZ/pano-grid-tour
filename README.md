# pano-grid-tour

React components for 360° panorama tours of a flat or a house, laid out as **rooms on a grid** — no floor plan
image needed. Draw a rectangle per room, put a 360° photo in it (equirectangular or cubestrip), link the rooms that have a doorway
between them, and visitors walk from room to room with arrows (like Street View) or by tapping a room on the mini-map.

Built on [Photo Sphere Viewer](https://photo-sphere-viewer.js.org) 5 and its Virtual Tour plugin.

**Demo:** https://demoz.github.io/pano-grid-tour/ — works on phones; photos you add stay in your browser.

- **`<TourEditor>`** — draw rooms over the grid (drag, or tap for a 2 × 2 room), move and stretch them, pick a 360°
  photo per room, link rooms, turn each photo to face the top of the plan, place arrows by hand when the automatic
  direction is off, undo/redo, preview, and a check list (rooms without a photo, overlaps, rooms you can't reach).
- **`<TourViewer>`** — the tour itself: arrows between rooms, and a mini-map of the rooms with a view cone.
- **Pure functions** for the tour data (`addRoom`, `addLink`, `validateTour`, `parseTour`, …) for servers and tests.

## Install

```bash
npm install pano-grid-tour @photo-sphere-viewer/core @photo-sphere-viewer/virtual-tour-plugin @photo-sphere-viewer/cubemap-adapter react react-dom
```

## Use

```tsx
import "@photo-sphere-viewer/core/index.css";
import "@photo-sphere-viewer/virtual-tour-plugin/index.css";
import "pano-grid-tour/style.css";
import { createTour, TourEditor, TourViewer, type PanoramaSource, type Tour } from "pano-grid-tour";

const panoramas: PanoramaSource[] = [
  { id: "p1", url: "/photos/living-8k.jpg", thumbnailUrl: "/photos/living-small.jpg", label: "Living room" },
  { id: "p2", url: "/photos/kitchen-8k.jpg", thumbnailUrl: "/photos/kitchen-small.jpg", label: "Kitchen" },
];

function Admin() {
  const [tour, setTour] = useState<Tour>(createTour());
  return <TourEditor value={tour} onChange={setTour} panoramas={panoramas} languages={["en", "ru"]} />;
}

function Page({ tour }: { tour: Tour }) {
  return (
    <div style={{ height: 600 }}>
      <TourViewer tour={tour} panoramas={panoramas} lang="en" />
    </div>
  );
}
```

- The tour is plain JSON: store it as is (a `jsonb` column, a file) and read it back with `parseTour(json)`, which
  drops anything it can't use instead of throwing.
- Panoramas belong to the host app: the tour only stores their `id`s, and you pass `url`s at render time (signed or
  resized URLs are fine). Rooms whose photo is missing are left out of the viewer.
- The build carries `"use client"`, so the components work in Next.js App Router pages.
- Every text can be replaced through `labels` (see `defaultLabels`), so the components can be fully translated.
- Theming: override the `--pgt-*` custom properties (see `src/styles.css`) on `.pgt-editor`, `.pgt-viewer` or
  `.pgt-theme`.

## Photo formats

- **Equirectangular** (2:1, the default).
- **Cubestrip** (6:1): six square faces in a row. Mark it with `projection: "cubestrip"`; the faces are read in
  `CUBESTRIP_ORDER` (right, left, top, bottom, front, back) unless `cubeOrder` says otherwise. The top face's lower
  edge and the bottom face's upper edge touch the front face. `detectProjection(width, height)` tells the two apart by
  size, and `cubestripFace(source)` cuts the front face out as a thumbnail.

```ts
{ id: "p3", url: "/photos/bedroom-strip.jpg", projection: "cubestrip", thumbnailUrl: "/photos/bedroom-front.jpg" }
```

A tour whose photos are all cubestrips is shown with Photo Sphere Viewer's cubemap adapter (no resampling). One
viewer shows one projection, so in a tour that mixes both kinds the cubestrips are redrawn as equirectangular images
in the browser (`cubestripToEquirectangular`, up to 4096 px wide) before the tour opens.

## How directions work

- Rooms live on a grid of whole cells: `x` to the right, `y` down. **The top of the grid is "up" for the whole
  tour.**
- `room.heading` is the photo's own yaw (degrees, 0 = the middle of the image, or of a cubestrip's front face) that faces the top of the grid. The
  viewer turns every photo by its heading, so looking "up" means the same direction in every room and walking through
  a door keeps the direction you were facing.
- An arrow's direction (a _bearing_, degrees clockwise from up) is computed from the centres of the two rooms. When a
  doorway isn't on that line, place the arrow by hand: `link.fromBearing` / `link.toBearing`.
- In the editor: turn the preview until you face the top wall, press **This way is the top of the plan**; to move an
  arrow, face the doorway and press **Arrow to … here**.

## Data format

```ts
interface Tour {
  version: 1;
  grid: { cols: number; rows: number };
  rooms: { id; name: Record<lang, string>; x; y; w; h; panoramaId?; heading }[];
  links: { id; from; to; twoWay: boolean; fromBearing?; toBearing? }[];
  startRoomId?: string;
}
```

## Develop

```bash
npm install
npm run dev        # demo at http://localhost:5173 (npm run dev:host to open it from a phone)
npm test           # model tests (vitest)
npm run typecheck
npm run build      # dist/ (library) — npm run build:demo for the demo site
```

## Status

Early: the API may change before 1.0. Planned next: pinch-zoom of the plan, several floors, info hotspots, gyroscope
on phones.

## License

[MIT](LICENSE)
