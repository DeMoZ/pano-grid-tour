import { cubeLookup, cubeOrder } from "../model/cubemap";
import type { CubeFace, PanoramaSource } from "../model/types";

/** Browser helpers for cubestrip panoramas (they need a DOM and a canvas). */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Can't load ${url}`));
    image.src = url;
  });
}

function canvasUrl(canvas: HTMLCanvasElement, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("canvas"))),
      "image/jpeg",
      quality,
    ),
  );
}

/** One face of a cubestrip as a square JPEG (blob URL), e.g. the front face as a thumbnail. */
export async function cubestripFace(
  source: Pick<PanoramaSource, "url" | "cubeOrder">,
  face: CubeFace = "front",
  size = 512,
): Promise<string> {
  const image = await loadImage(source.url);
  const index = cubeOrder(source as PanoramaSource).indexOf(face);
  const faceSize = image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(image, index * faceSize, 0, faceSize, faceSize, 0, 0, size, size);
  return canvasUrl(canvas, 0.85);
}

/**
 * Redraws a cubestrip as an equirectangular image (blob URL), for tours that mix both kinds:
 * one viewer shows one projection. `width` defaults to four faces, at most 4096 px.
 */
export async function cubestripToEquirectangular(
  source: Pick<PanoramaSource, "url" | "cubeOrder">,
  width?: number,
): Promise<string> {
  const image = await loadImage(source.url);
  // Phones cap a canvas at about 16.7 million pixels: read big strips scaled down.
  const faceSize = Math.min(image.naturalHeight, Math.floor(Math.sqrt(16_000_000 / 6)));
  const order = cubeOrder(source as PanoramaSource);
  const input = document.createElement("canvas");
  input.width = faceSize * 6;
  input.height = faceSize;
  const inputContext = input.getContext("2d", { willReadFrequently: true })!;
  inputContext.drawImage(image, 0, 0, input.width, input.height);
  const pixels = inputContext.getImageData(0, 0, input.width, input.height).data;

  const w = Math.round(width ?? Math.min(4096, faceSize * 4));
  const h = Math.round(w / 2);
  const output = document.createElement("canvas");
  output.width = w;
  output.height = h;
  const outputContext = output.getContext("2d")!;
  const result = outputContext.createImageData(w, h);
  const out = result.data;
  const offset = new Map(order.map((face, i) => [face, i * faceSize]));
  const last = faceSize - 1;

  for (let y = 0; y < h; y++) {
    const pitch = (0.5 - (y + 0.5) / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const yaw = ((x + 0.5) / w - 0.5) * 2 * Math.PI;
      const { face, s, t } = cubeLookup(yaw, pitch);
      const px = (offset.get(face) ?? 0) + Math.min(last, Math.floor(s * faceSize));
      const py = Math.min(last, Math.floor(t * faceSize));
      const from = (py * input.width + px) * 4;
      const to = (y * w + x) * 4;
      out[to] = pixels[from]!;
      out[to + 1] = pixels[from + 1]!;
      out[to + 2] = pixels[from + 2]!;
      out[to + 3] = 255;
    }
  }
  outputContext.putImageData(result, 0, 0);
  return canvasUrl(output);
}
