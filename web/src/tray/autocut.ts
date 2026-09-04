/**
 * PRD §8.2 — "User upload allowed (photo picker), auto-cut on import."
 *
 * Corner-seeded background removal: flood from the four corners through
 * colours close to what is already there, then soften the resulting boundary.
 * It is not segmentation and does not pretend to be — it handles the case an
 * uploaded photo usually is (a subject against a wall, a table, the sky) and
 * hands a cut-out to the edge verb, which is what gives it its character.
 *
 * A configured segmentation provider supersedes this; the import path is the
 * same either way, because the result is a fragment either way.
 */
import type { Bitmap } from '../verbs/types.ts';

export interface AutoCutOptions {
  /** 0..1 — how far from the corner colours still counts as background. */
  tolerance?: number;
  /** Soften the cut boundary by this many pixels. */
  feather?: number;
}

export function autoCut(bmp: Bitmap, opts: AutoCutOptions = {}): Bitmap {
  const { data, width: w, height: h } = bmp;
  const tol = (opts.tolerance ?? 0.14) * 255 * 3;
  const seeds = [0, w - 1, (h - 1) * w, h * w - 1];

  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const s of seeds) {
    if (!bg[s]) { bg[s] = 1; stack.push(s); }
  }
  const refs = seeds.map((s) => [data[s * 4]!, data[s * 4 + 1]!, data[s * 4 + 2]!] as const);
  const near = (i: number): boolean => {
    const o = i * 4;
    for (const [r, g, b] of refs) {
      if (Math.abs(data[o]! - r) + Math.abs(data[o + 1]! - g) + Math.abs(data[o + 2]! - b) <= tol) return true;
    }
    return false;
  };

  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (bg[j] || !near(j)) continue;
      bg[j] = 1;
      stack.push(j);
    }
  }

  // If the flood swallowed nearly everything the photo had no separable
  // background; leave it whole rather than hand back an empty fragment.
  let removed = 0;
  for (let i = 0; i < w * h; i++) removed += bg[i]!;
  if (removed > w * h * 0.92) return bmp;

  const feather = Math.max(0, Math.round(opts.feather ?? 1.5));
  for (let i = 0; i < w * h; i++) if (bg[i]) data[i * 4 + 3] = 0;

  if (feather > 0) {
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!;
    const r = feather;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] === 0) continue;
        let sum = 0, n = 0;
        for (let oy = -r; oy <= r; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= h) continue;
          for (let ox = -r; ox <= r; ox++) {
            const nx = x + ox;
            if (nx < 0 || nx >= w) continue;
            sum += alpha[ny * w + nx]!;
            n++;
          }
        }
        data[i * 4 + 3] = sum / n;
      }
    }
  }
  return bmp;
}

/** A tight box around what survived the cut, so the fragment has no dead margin. */
export function contentBounds(bmp: Bitmap, threshold = 6): { x: number; y: number; w: number; h: number } {
  const { data, width: w, height: h } = bmp;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h };
  const pad = 2;
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(w - x, maxX - minX + pad * 2), h: Math.min(h - y, maxY - minY + pad * 2) };
}

export const isMostlyOpaque = (bmp: Bitmap): boolean => {
  let opaque = 0;
  for (let i = 3; i < bmp.data.length; i += 4) if (bmp.data[i]! > 200) opaque++;
  return opaque > (bmp.data.length / 4) * 0.985;
};
