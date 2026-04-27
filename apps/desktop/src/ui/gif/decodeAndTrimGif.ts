import { decompressFrames, parseGIF } from "gifuct-js";
import type { LoadedGif, GifFrame } from "../BouncyGifCanvas";

type DecompressedFrame = {
  dims: { width: number; height: number; left: number; top: number };
  delay: number;
  patch: Uint8ClampedArray;
};

type Box = { x0: number; y0: number; x1: number; y1: number };

function boxEmpty(): Box {
  return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}

function expandBox(b: Box, x: number, y: number) {
  b.x0 = Math.min(b.x0, x);
  b.y0 = Math.min(b.y0, y);
  b.x1 = Math.max(b.x1, x);
  b.y1 = Math.max(b.y1, y);
}

function normalizeBox(b: Box, fallbackW: number, fallbackH: number): Box {
  if (!Number.isFinite(b.x0) || b.x1 < b.x0 || b.y1 < b.y0) return { x0: 0, y0: 0, x1: fallbackW - 1, y1: fallbackH - 1 };
  return b;
}

function union(a: Box, b: Box): Box {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function findOpaqueBoundsRGBA(patch: Uint8ClampedArray, w: number, h: number, alphaThreshold = 1): Box {
  const b = boxEmpty();
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = patch[row + x * 4 + 3]!;
      if (a >= alphaThreshold) expandBox(b, x, y);
    }
  }
  return normalizeBox(b, w, h);
}

function colorDistanceSq(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function pickEdgeBackgroundColor(patch: Uint8ClampedArray, w: number, h: number) {
  // sample 4 corners + a few edge midpoints
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)],
    [w - 1, Math.floor(h / 2)],
  ];
  const colors: Array<[number, number, number]> = [];
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    colors.push([patch[i]!, patch[i + 1]!, patch[i + 2]!]);
  }
  // choose the most frequent (roughly) by clustering exact matches
  const map = new Map<string, { c: [number, number, number]; n: number }>();
  for (const c of colors) {
    const key = c.join(",");
    const cur = map.get(key);
    if (cur) cur.n++;
    else map.set(key, { c, n: 1 });
  }
  let best: [number, number, number] = colors[0]!;
  let bestN = -1;
  for (const v of map.values()) {
    if (v.n > bestN) {
      bestN = v.n;
      best = v.c;
    }
  }
  return best;
}

function findNonBgBoundsRGBA(patch: Uint8ClampedArray, w: number, h: number, bg: [number, number, number], tol = 10): Box {
  const b = boxEmpty();
  const tolSq = tol * tol;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const a = patch[i + 3]!;
      if (a === 0) continue; // treat transparent as bg
      const r = patch[i]!;
      const g = patch[i + 1]!;
      const bb = patch[i + 2]!;
      if (colorDistanceSq(r, g, bb, bg[0], bg[1], bg[2]) > tolSq) expandBox(b, x, y);
    }
  }
  return normalizeBox(b, w, h);
}

async function imageBitmapFromRgba(pixels: Uint8ClampedArray, w: number, h: number): Promise<ImageBitmap> {
  const cnv = document.createElement("canvas");
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D nicht verfügbar");
  const img = new ImageData(pixels, w, h);
  ctx.putImageData(img, 0, 0);
  return await createImageBitmap(cnv);
}

function cropRgba(src: Uint8ClampedArray, srcW: number, srcH: number, crop: Box): { pixels: Uint8ClampedArray; w: number; h: number } {
  const w = crop.x1 - crop.x0 + 1;
  const h = crop.y1 - crop.y0 + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = crop.x0 + x;
      const sy = crop.y0 + y;
      const si = (sy * srcW + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src[si]!;
      out[di + 1] = src[si + 1]!;
      out[di + 2] = src[si + 2]!;
      out[di + 3] = src[si + 3]!;
    }
  }
  return { pixels: out, w, h };
}

function detectContentBounds(pixels: Uint8ClampedArray, w: number, h: number): Box {
  const alphaBox = findOpaqueBoundsRGBA(pixels, w, h, 1);
  const alphaIsFull = alphaBox.x0 === 0 && alphaBox.y0 === 0 && alphaBox.x1 === w - 1 && alphaBox.y1 === h - 1;
  if (!alphaIsFull) return alphaBox;

  const bg = pickEdgeBackgroundColor(pixels, w, h);
  return findNonBgBoundsRGBA(pixels, w, h, bg, 10);
}

export async function decodeAndTrimGif(arrayBuffer: ArrayBuffer): Promise<LoadedGif> {
  const gif = parseGIF(arrayBuffer);
  const frames = decompressFrames(gif, true) as unknown as DecompressedFrame[];

  if (!frames.length) throw new Error("GIF enthält keine Frames");

  const fullW = frames[0]!.dims.width;
  const fullH = frames[0]!.dims.height;

  // global bounding box across frames
  let global = boxEmpty();
  for (const f of frames) {
    const b = findOpaqueBoundsRGBA(f.patch, f.dims.width, f.dims.height, 1);
    global = union(global, b);
  }
  global = normalizeBox(global, fullW, fullH);

  // If we couldn't trim anything by alpha (common for opaque GIFs with solid margins),
  // attempt a conservative "same-color border" trim using edge background color.
  const alphaTrimDidNothing = global.x0 === 0 && global.y0 === 0 && global.x1 === fullW - 1 && global.y1 === fullH - 1;
  if (alphaTrimDidNothing) {
    let global2 = boxEmpty();
    for (const f of frames) {
      const bg = pickEdgeBackgroundColor(f.patch, f.dims.width, f.dims.height);
      const b = findNonBgBoundsRGBA(f.patch, f.dims.width, f.dims.height, bg, 10);
      global2 = union(global2, b);
    }
    global2 = normalizeBox(global2, fullW, fullH);
    global = global2;
  }

  const outFrames: GifFrame[] = [];
  const width = global.x1 - global.x0 + 1;
  const height = global.y1 - global.y0 + 1;
  const targetCx = (width - 1) / 2;
  const targetCy = (height - 1) / 2;

  for (const f of frames) {
    const cropped = cropRgba(f.patch, f.dims.width, f.dims.height, global);
    const content = detectContentBounds(cropped.pixels, cropped.w, cropped.h);
    const frameCx = (content.x0 + content.x1) / 2;
    const frameCy = (content.y0 + content.y1) / 2;
    const bitmap = await imageBitmapFromRgba(cropped.pixels, cropped.w, cropped.h);
    // gifuct delay is in hundredths of a second
    const delayMs = Math.max(10, Math.round((f.delay || 10) * 10));
    outFrames.push({
      bitmap,
      delayMs,
      anchorOffsetX: targetCx - frameCx,
      anchorOffsetY: targetCy - frameCy,
    });
  }

  return { width, height, frames: outFrames };
}

