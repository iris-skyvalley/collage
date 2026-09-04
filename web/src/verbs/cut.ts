/**
 * PRD §8.3 — Cut. "Semantic cut ('along the coastline', 'just the sleeve') —
 * no path drawing."
 *
 * Two modes, both parameterised and neither drawn by hand:
 *
 *  - `region`: tap a point, and the connected run of similar colour goes. No
 *    semantics, but no path drawing either, and it works with no provider and
 *    no latency. This is the v1 default.
 *  - `semantic`: the prompt goes to a segmentation provider, which returns a
 *    mask stored by *reference* (`mask_ref`), exactly as fragments are. The
 *    verb's record stays parameters and references; nothing is baked to
 *    pixels, so the contract in PRD §9 holds either way.
 */
import { luma, type Bitmap } from './types.ts';

export interface CutParams {
  mode?: 'region' | 'semantic';
  /** Seed point, normalised 0..1 so it survives any raster size. */
  x?: number;
  y?: number;
  /** 0..1 — colour distance that still counts as the same region. */
  tolerance?: number;
  /** Keep the selected region instead of removing it. */
  keep?: boolean;
  /** Semantic mode: the phrase, and the provider mask it resolved to. */
  prompt?: string;
  mask_ref?: string;
}

/** Flood-select from a seed point and clear (or keep) the run. */
export function applyRegionCut(bmp: Bitmap, params: CutParams): Bitmap {
  const { data, width: w, height: h } = bmp;
  const sx = Math.round(Math.max(0, Math.min(1, params.x ?? 0.5)) * (w - 1));
  const sy = Math.round(Math.max(0, Math.min(1, params.y ?? 0.5)) * (h - 1));
  const start = sy * w + sx;
  if (data[start * 4 + 3]! < 8) return bmp;

  const tol = Math.max(0, Math.min(1, params.tolerance ?? 0.16)) * 255;
  const sr = data[start * 4]!, sg = data[start * 4 + 1]!, sb = data[start * 4 + 2]!;
  const sl = luma(sr, sg, sb);

  const seen = new Uint8Array(w * h);
  const stack = [start];
  const region: number[] = [];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    region.push(i);
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j]) continue;
      const o = j * 4;
      if (data[o + 3]! < 8) { seen[j] = 1; continue; }
      const dl = Math.abs(luma(data[o]!, data[o + 1]!, data[o + 2]!) - sl);
      const dc = (Math.abs(data[o]! - sr) + Math.abs(data[o + 1]! - sg) + Math.abs(data[o + 2]! - sb)) / 3;
      if (dl * 0.6 + dc * 0.4 <= tol) { seen[j] = 1; stack.push(j); }
    }
  }

  if (params.keep) {
    const inRegion = new Uint8Array(w * h);
    for (const i of region) inRegion[i] = 1;
    for (let i = 0; i < w * h; i++) if (!inRegion[i]) data[i * 4 + 3] = 0;
  } else {
    for (const i of region) data[i * 4 + 3] = 0;
  }
  return bmp;
}

/** Apply a provider-returned mask, resolved by reference at render time. */
export function applyMaskCut(bmp: Bitmap, mask: Bitmap, keep = true): Bitmap {
  const { data, width: w, height: h } = bmp;
  for (let y = 0; y < h; y++) {
    const my = Math.min(mask.height - 1, Math.round((y / h) * mask.height));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(mask.width - 1, Math.round((x / w) * mask.width));
      const m = mask.data[(my * mask.width + mx) * 4]! / 255;
      const keepFactor = keep ? m : 1 - m;
      data[(y * w + x) * 4 + 3] = data[(y * w + x) * 4 + 3]! * keepFactor;
    }
  }
  return bmp;
}
