/**
 * PRD §8.3 — Relight. "Match one fragment's light to another's."
 *
 * The estimate is a first-moment fit: over the fragment's own pixels, where is
 * it brighter than its mean, and in which direction? That vector plus its
 * magnitude is the whole light model. It is not a physical relight — there is
 * no depth here to relight — but matching the direction and strength of the
 * luminance gradient is what makes two cut-outs from different sources stop
 * fighting each other, which is the actual job.
 */
import { luma, type Bitmap } from './types.ts';

export interface Light {
  /** Unit-ish direction the light comes from, in image space. */
  dx: number;
  dy: number;
  /** 0..1 — how strongly the fragment is modelled. */
  strength: number;
  /** Mean luminance, 0..1. */
  level: number;
}

export function estimateLight(bmp: Bitmap): Light {
  const { data, width: w, height: h } = bmp;
  let sum = 0, n = 0, cx = 0, cy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 128) continue;
      sum += luma(data[i]!, data[i + 1]!, data[i + 2]!) / 255;
      cx += x; cy += y; n++;
    }
  }
  if (n === 0) return { dx: 0, dy: 0, strength: 0, level: 0.5 };
  const mean = sum / n;
  cx /= n; cy /= n;
  const radius = Math.sqrt(n / Math.PI) || 1;

  let mx = 0, my = 0, varSum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 128) continue;
      const d = luma(data[i]!, data[i + 1]!, data[i + 2]!) / 255 - mean;
      mx += d * (x - cx);
      my += d * (y - cy);
      varSum += d * d;
    }
  }
  const len = Math.hypot(mx, my);
  const rms = Math.sqrt(varSum / n);
  return {
    dx: len ? mx / len : 0,
    dy: len ? my / len : 0,
    strength: Math.min(1, (len / (n * radius)) * 6 + rms * 0.5),
    level: mean,
  };
}

export interface RelightParams {
  dx: number;
  dy: number;
  strength: number;
  /** 0..1 — how much of the estimated light to impose. */
  amount?: number;
  /** Optional target mean luminance, to match exposure as well as direction. */
  level?: number;
}

export function applyRelight(bmp: Bitmap, params: RelightParams): Bitmap {
  const amount = Math.max(0, Math.min(1, params.amount ?? 0.7));
  if (amount === 0) return bmp;
  const { data, width: w, height: h } = bmp;

  const current = estimateLight(bmp);
  // Cancel the light the fragment already has, then impose the target's.
  const tx = params.dx * params.strength - current.dx * current.strength;
  const ty = params.dy * params.strength - current.dy * current.strength;
  const gain = 0.55 * amount;
  const exposure = params.level !== undefined ? (params.level - current.level) * amount * 0.6 : 0;

  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! >= 128) { cx += x; cy += y; n++; }
    }
  }
  if (!n) return bmp;
  cx /= n; cy /= n;
  const radius = Math.max(1, Math.sqrt(n / Math.PI));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      const ux = (x - cx) / radius, uy = (y - cy) / radius;
      const shade = (ux * tx + uy * ty) * gain + exposure;
      for (let c = 0; c < 3; c++) {
        data[i + c] = data[i + c]! + shade * 255 * 0.5 + data[i + c]! * shade * 0.35;
      }
    }
  }
  return bmp;
}
