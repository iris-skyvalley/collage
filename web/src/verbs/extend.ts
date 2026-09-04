/**
 * PRD §8.3 — Extend. "Outpaint a fragment past its own edge."
 *
 * With a generation provider configured this hands off to it. Without one it
 * extrapolates the fragment's own content: every new pixel takes the nearest
 * existing pixel, sampled through a noise offset so the result reads as more
 * of the same material rather than as radial smearing. It is honest about
 * what it is — growth, not invention — and it is what makes the extend verb
 * usable at all before a provider exists.
 */
import { fbm } from '../render/noise.ts';
import { nearestSet } from '../render/jfa.ts';
import { signedDistanceField } from '../render/sdf.ts';
import { smoothstep, type Bitmap } from './types.ts';

export interface ExtendParams {
  /** How far past its own edge, in pixels at a 512px reference size. */
  amount: number;
  /** 0..1 — how much the new boundary wanders. */
  irregularity?: number;
  seed?: number;
}

export interface Padded {
  bitmap: Bitmap;
  padLeft: number;
  padTop: number;
}

export function applyExtend(bmp: Bitmap, params: ExtendParams): Padded {
  const s = Math.max(bmp.width, bmp.height) / 512;
  const grow = Math.max(0, (params.amount ?? 0) * s);
  if (grow < 1) return { bitmap: bmp, padLeft: 0, padTop: 0 };

  const pad = Math.ceil(grow) + 2;
  const w = bmp.width + pad * 2, h = bmp.height + pad * 2;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < bmp.height; y++) {
    const src = y * bmp.width * 4;
    out.set(bmp.data.subarray(src, src + bmp.width * 4), ((y + pad) * w + pad) * 4);
  }
  const padded: Bitmap = { data: out, width: w, height: h };

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = out[i * 4 + 3]! >= 128 ? 1 : 0;
  const nearest = nearestSet(mask, w, h);
  const sdf = signedDistanceField(out, w, h);

  const seed = params.seed ?? 11;
  const irr = Math.max(0, Math.min(1, params.irregularity ?? 0.5));
  const freq = 0.02 / s;
  const wobble = grow * 0.45 * irr;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = -sdf[i]!; // distance outside the original silhouette
      if (d <= 0) continue;
      const edgeWobble = fbm(x * freq, y * freq, seed + 41, 3) * wobble;
      const reach = grow + edgeWobble;
      if (d > reach) continue;

      const src = nearest[i]!;
      if (src < 0) continue;
      // Offset the sample so the extension picks up neighbouring texture
      // instead of smearing one pixel outward along a ray.
      const jx = Math.round(fbm(x * freq * 3.1, y * freq * 3.1, seed, 2) * 9 * s);
      const jy = Math.round(fbm(x * freq * 3.1, y * freq * 3.1, seed + 97, 2) * 9 * s);
      const sx = Math.min(w - 1, Math.max(0, (src % w) + jx));
      const sy = Math.min(h - 1, Math.max(0, ((src / w) | 0) + jy));
      const sIdx = mask[sy * w + sx] ? (sy * w + sx) * 4 : src * 4;

      const fade = smoothstep(reach, reach - Math.max(1.5, grow * 0.14), d);
      const o = i * 4;
      out[o] = out[sIdx]!;
      out[o + 1] = out[sIdx + 1]!;
      out[o + 2] = out[sIdx + 2]!;
      out[o + 3] = 255 * fade;
    }
  }
  return { bitmap: padded, padLeft: pad, padTop: pad };
}
