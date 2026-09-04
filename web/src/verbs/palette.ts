/**
 * PRD §8.3 — Palette. "Apply a palette across all fragments at once."
 *
 * Document-level, so it lives on the composition rather than on a layer, and
 * is applied last: it is the thing that makes twenty fragments from five
 * sources look like one piece.
 */
import { hexToRgbTriple, luma, type Bitmap } from './types.ts';

export interface PaletteParams {
  /** Dark-to-light ramp. Empty means "as found" and is a no-op. */
  ramp: string[];
  /** 0..1 — how far each fragment is pulled onto the ramp. */
  strength?: number;
}

export function applyPalette(bmp: Bitmap, params: PaletteParams): Bitmap {
  const ramp = params.ramp ?? [];
  if (ramp.length < 2) return bmp;
  const k = Math.max(0, Math.min(1, params.strength ?? 0.85));
  if (k === 0) return bmp;

  const stops = ramp.map(hexToRgbTriple);
  const { data } = bmp;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const L = luma(r, g, b) / 255;
    const pos = L * (stops.length - 1);
    const lo = Math.min(stops.length - 1, Math.floor(pos));
    const hi = Math.min(stops.length - 1, lo + 1);
    const t = pos - lo;
    const a = stops[lo]!, c = stops[hi]!;
    for (let ch = 0; ch < 3; ch++) {
      const mapped = a[ch]! + (c[ch]! - a[ch]!) * t;
      data[i + ch] = data[i + ch]! + (mapped - data[i + ch]!) * k;
    }
  }
  return bmp;
}
