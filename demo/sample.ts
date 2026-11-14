import { bearing, center, type PanoramaSource, type Room, type Tour } from "../src";

/**
 * A sample flat. Each room's panorama is drawn in code with a deliberately "wrong"
 * heading, so the tour only lines up because of the headings stored below: the label
 * "▲ TOP OF PLAN" must face up the grid and each "DOOR →" label must sit under its arrow.
 */
export const sampleTour: Tour = {
  version: 1,
  grid: { cols: 12, rows: 8 },
  startRoomId: "living",
  rooms: [
    {
      id: "living",
      name: { en: "Living room", ru: "Гостиная" },
      x: 1,
      y: 2,
      w: 5,
      h: 4,
      heading: 40,
      panoramaId: "demo-living",
    },
    {
      id: "kitchen",
      name: { en: "Kitchen", ru: "Кухня" },
      x: 1,
      y: 0,
      w: 3,
      h: 2,
      heading: 200,
      panoramaId: "demo-kitchen",
    },
    { id: "hall", name: { en: "Hall", ru: "Прихожая" }, x: 6, y: 3, w: 2, h: 2, heading: 300, panoramaId: "demo-hall" },
    {
      id: "bedroom",
      name: { en: "Bedroom", ru: "Спальня" },
      x: 8,
      y: 1,
      w: 3,
      h: 4,
      heading: 120,
      panoramaId: "demo-bedroom",
    },
    { id: "bath", name: { en: "Bathroom", ru: "Ванная" }, x: 6, y: 5, w: 2, h: 2, heading: 0, panoramaId: "demo-bath" },
  ],
  links: [
    { id: "l1", from: "living", to: "kitchen", twoWay: true },
    { id: "l2", from: "living", to: "hall", twoWay: true },
    { id: "l3", from: "hall", to: "bedroom", twoWay: true },
    { id: "l4", from: "hall", to: "bath", twoWay: true },
  ],
};

const colors: Record<string, [string, string]> = {
  living: ["#7dd3fc", "#a16207"],
  kitchen: ["#fde68a", "#57534e"],
  hall: ["#c4b5fd", "#44403c"],
  bedroom: ["#fbcfe8", "#7c2d12"],
  bath: ["#a7f3d0", "#334155"],
};

/** Draws the sample panoramas (equirectangular 4096 × 2048) and returns them as blob URLs. */
export async function samplePanoramas(): Promise<PanoramaSource[]> {
  const result: PanoramaSource[] = [];
  for (const room of sampleTour.rooms) {
    const doors = sampleTour.links
      .filter((l) => l.from === room.id || l.to === room.id)
      .map((l) => sampleTour.rooms.find((r) => r.id === (l.from === room.id ? l.to : l.from))!)
      .map((to) => ({ name: to.name.en!, bearing: bearing(center(room), center(to)) }));
    const full = draw(room, doors, 4096);
    const thumb = draw(room, doors, 512);
    result.push({
      id: room.panoramaId!,
      label: `Sample: ${room.name.en}`,
      url: URL.createObjectURL(await toBlob(full)),
      thumbnailUrl: URL.createObjectURL(await toBlob(thumb)),
    });
  }
  return result;
}

function draw(room: Room, doors: { name: string; bearing: number }[], width: number): HTMLCanvasElement {
  const height = width / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const [sky, floor] = colors[room.id] ?? ["#ddd", "#555"];
  const k = width / 4096;

  const gradient = ctx.createLinearGradient(0, 0, 0, height / 2);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, sky);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height / 2);
  ctx.fillStyle = floor;
  ctx.fillRect(0, height / 2, width, height / 2);

  // Raw yaw (degrees, 0 = image centre) → x.
  const xOf = (yaw: number) => ((((yaw / 360 + 0.5) % 1) + 1) % 1) * width;

  // Ruler of the photo's own yaw, so a wrong heading is easy to see.
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 2 * k;
  ctx.font = `${28 * k}px sans-serif`;
  ctx.textAlign = "center";
  for (let yaw = -180; yaw < 180; yaw += 15) {
    const x = xOf(yaw);
    const long = yaw % 45 === 0;
    ctx.beginPath();
    ctx.moveTo(x, height / 2 - (long ? 40 : 18) * k);
    ctx.lineTo(x, height / 2);
    ctx.stroke();
    if (long) {
      ctx.fillText(`${yaw}°`, x, height / 2 - 52 * k);
    }
  }

  // Room name all around, above the horizon.
  ctx.font = `bold ${120 * k}px sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.8)";
  for (let yaw = -135; yaw < 180; yaw += 90) {
    ctx.fillText(room.name.en!.toUpperCase(), xOf(yaw), height * 0.3);
  }

  // Up the grid = this photo's heading.
  label(ctx, xOf(room.heading), height * 0.42, "▲ TOP OF PLAN", "#1d4ed8", k);

  // Doors where the automatic arrows point.
  for (const door of doors) {
    const x = xOf(room.heading + door.bearing);
    ctx.fillStyle = "#78350f";
    ctx.fillRect(x - 150 * k, height * 0.5 - 420 * k, 300 * k, 420 * k);
    label(ctx, x, height * 0.6, `DOOR → ${door.name.toUpperCase()}`, "#b45309", k);
  }
  return canvas;
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, k: number) {
  ctx.font = `bold ${64 * k}px sans-serif`;
  const w = ctx.measureText(text).width + 40 * k;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - 50 * k, w, 90 * k);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.textBaseline = "alphabetic";
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas"))), "image/jpeg", 0.85),
  );
}
