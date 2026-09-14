/**
 * Turning a product photo into an object.
 *
 * `cutoutFlatBackground` is pure pixel work: it samples the border, decides
 * whether the photo sits on a flat backdrop (white, grey, a studio sweep),
 * and if so flood-fills that backdrop away from the edges inward, leaving the
 * thing itself on transparent pixels. It deliberately refuses photos with a
 * busy background: a bad cutout is worse than none.
 *
 * `Cutter` is the seam for the model-based path ("clip the dress, not the
 * model"): a segmenter that can return a labelled mask plugs in there.
 */

export type Pixels = {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
};

export type Bounds = { x: number; y: number; w: number; h: number };

export type CutoutResult = {
  pixels: Pixels;
  /** Bounding box of what is left, in source coordinates. */
  bounds: Bounds;
  /** Share of pixels kept, 0..1. */
  coverage: number;
};

export type FlatBackgroundOptions = {
  /** Colour distance (0..441) treated as "the same as the background". */
  tolerance?: number;
  /** Max standard deviation of border colour for a backdrop to count as flat. */
  maxBorderSpread?: number;
  /** Feather the edge by one pixel. */
  feather?: boolean;
};

const DEFAULTS: Required<FlatBackgroundOptions> = {
  tolerance: 34,
  maxBorderSpread: 18,
  feather: true,
};

type Rgb = [number, number, number];

/** Median border colour and how much the border varies around it. */
export function sampleBorder(p: Pixels): { color: Rgb; spread: number } {
  const { width, height, data } = p;
  const rs: number[] = [],
    gs: number[] = [],
    bs: number[] = [];
  const push = (i: number) => {
    if (data[i + 3] < 8) return; // already-transparent border pixels say nothing
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };
  for (let x = 0; x < width; x++) {
    push(x * 4);
    push(((height - 1) * width + x) * 4);
  }
  for (let y = 1; y < height - 1; y++) {
    push(y * width * 4);
    push((y * width + width - 1) * 4);
  }
  if (!rs.length) return { color: [255, 255, 255], spread: 0 };
  const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
  const color: Rgb = [median(rs), median(gs), median(bs)];
  let sum = 0;
  for (let i = 0; i < rs.length; i++)
    sum += Math.hypot(rs[i] - color[0], gs[i] - color[1], bs[i] - color[2]);
  return { color, spread: sum / rs.length };
}

/** Is this a photo on a flat backdrop we can safely remove? */
export function hasFlatBackground(
  p: Pixels,
  options: FlatBackgroundOptions = {},
): boolean {
  const o = { ...DEFAULTS, ...options };
  return sampleBorder(p).spread <= o.maxBorderSpread;
}

/**
 * Remove a flat background. Returns null when the photo does not have one.
 * Never mutates the input.
 */
export function cutoutFlatBackground(
  p: Pixels,
  options: FlatBackgroundOptions = {},
): CutoutResult | null {
  const o = { ...DEFAULTS, ...options };
  const { width, height } = p;
  if (width < 2 || height < 2) return null;
  const { color, spread } = sampleBorder(p);
  if (spread > o.maxBorderSpread) return null;

  const data = new Uint8ClampedArray(p.data);
  const isBackground = (i: number) =>
    data[i * 4 + 3] < 8 ||
    Math.hypot(
      data[i * 4] - color[0],
      data[i * 4 + 1] - color[1],
      data[i * 4 + 2] - color[2],
    ) <= o.tolerance;

  // Flood fill from every border pixel, 4-connected.
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!seen[i] && isBackground(i)) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i + width < width * height) seed(i + width);
  }

  let kept = 0;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let i = 0; i < width * height; i++) {
    if (seen[i]) {
      data[i * 4 + 3] = 0;
    } else if (data[i * 4 + 3] >= 8) {
      kept++;
      const x = i % width,
        y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null; // everything was background

  if (o.feather) {
    // Object pixels touching removed background get a softened edge.
    const alpha = new Uint8ClampedArray(width * height);
    for (let i = 0; i < width * height; i++) alpha[i] = data[i * 4 + 3];
    for (let i = 0; i < width * height; i++) {
      if (!alpha[i]) continue;
      const x = i % width,
        y = (i / width) | 0;
      let bg = 0;
      if (x > 0 && !alpha[i - 1]) bg++;
      if (x < width - 1 && !alpha[i + 1]) bg++;
      if (y > 0 && !alpha[i - width]) bg++;
      if (y < height - 1 && !alpha[i + width]) bg++;
      if (bg) data[i * 4 + 3] = Math.round(alpha[i] * (1 - bg / 6));
    }
  }

  return {
    pixels: { width, height, data },
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    coverage: kept / (width * height),
  };
}

/** Crop pixels to a box, with optional padding, clamped to the image. */
export function crop(p: Pixels, b: Bounds, pad = 0): Pixels {
  const x0 = Math.max(0, b.x - pad),
    y0 = Math.max(0, b.y - pad);
  const x1 = Math.min(p.width, b.x + b.w + pad),
    y1 = Math.min(p.height, b.y + b.h + pad);
  const w = x1 - x0,
    h = y1 - y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    data.set(
      p.data.subarray(
        ((y0 + y) * p.width + x0) * 4,
        ((y0 + y) * p.width + x1) * 4,
      ),
      y * w * 4,
    );
  return { width: w, height: h, data };
}

/* ------------------------------------------------------------------------ */
/* Cutters: the seam between "flat background" and "a real segmenter".      */
/* ------------------------------------------------------------------------ */

export type Detection = { label: string; bounds: Bounds; score: number };

export type CutOutput = {
  blob: Blob;
  width: number;
  height: number;
  method: 'flat-background' | 'model';
  label?: string;
};

export interface Cutter {
  /** Things in the image a user could choose between ("dress", "shoes"). */
  detect(image: Blob): Promise<Detection[]>;
  /** Cut one thing out (or the whole subject when no detection is given). */
  cut(image: Blob, pick?: Detection): Promise<CutOutput | null>;
}

/** Browser-only: decode a blob into raw pixels. */
export async function decode(blob: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { width: img.width, height: img.height, data: img.data };
}

/** Browser-only: encode raw pixels as a PNG blob. */
export async function encodePng(p: Pixels): Promise<Blob> {
  const c = new OffscreenCanvas(p.width, p.height);
  c.getContext('2d')!.putImageData(
    new ImageData(p.data, p.width, p.height),
    0,
    0,
  );
  return c.convertToBlob({ type: 'image/png' });
}

/** The cutter that ships: studio photos on a flat backdrop, no model needed. */
export class FlatBackgroundCutter implements Cutter {
  private readonly options: FlatBackgroundOptions;
  constructor(options: FlatBackgroundOptions = {}) {
    this.options = options;
  }

  async detect(): Promise<Detection[]> {
    return []; // No labelled detections without a model.
  }

  async cut(image: Blob, pick?: Detection): Promise<CutOutput | null> {
    const pixels = await decode(image);
    const result = cutoutFlatBackground(pixels, this.options);
    if (!result || result.coverage < 0.01 || result.coverage > 0.97)
      return null;
    const box = pick?.bounds ?? result.bounds;
    const trimmed = crop(result.pixels, box, 4);
    return {
      blob: await encodePng(trimmed),
      width: trimmed.width,
      height: trimmed.height,
      method: 'flat-background',
      label: pick?.label,
    };
  }
}
