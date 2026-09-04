/**
 * PRD §8.3 — Material. "Re-render fragment as newsprint, riso, halftone,
 * photocopy, textile, satellite tile — shape preserved."
 *
 * Shape preserved is literal here: every routine writes RGB and never touches
 * alpha, so a material swap can never change what the fragment *is*. Edge
 * treatment is the edge verb's job and the two compose without interfering.
 */
import { fbm, valueNoise2D } from '../render/noise.ts';
import { hexToRgbTriple, luma, smoothstep, type Bitmap } from './types.ts';
import type { Material } from '@collage/shared/constants';

export interface MaterialParams {
  material: Material;
  /** 0..1 — how far to push it. 1 is a full re-render. */
  strength?: number;
  /** Spot inks for riso; falls back to a duotone if absent. */
  inks?: string[];
  seed?: number;
}

/** Coverage of a rotated dot screen at (x, y) for a given tone. 1 = ink. */
function screen(x: number, y: number, cell: number, angleRad: number, tone: number): number {
  const c = Math.cos(angleRad), s = Math.sin(angleRad);
  const u = (x * c - y * s) / cell, v = (x * s + y * c) / cell;
  const du = u - Math.floor(u) - 0.5, dv = v - Math.floor(v) - 0.5;
  const dist = Math.sqrt(du * du + dv * dv) * 2; // 0 at dot centre, ~1.41 at corner
  // Radius grows as tone darkens.
  const radius = Math.sqrt(Math.max(0, 1 - tone)) * 1.15;
  return smoothstep(radius + 0.12, radius - 0.12, dist);
}

export function applyMaterial(bmp: Bitmap, params: MaterialParams): Bitmap {
  const m = params.material ?? 'none';
  if (m === 'none') return bmp;
  const { data, width: w, height: h } = bmp;
  const k = Math.max(0, Math.min(1, params.strength ?? 1));
  const seed = params.seed ?? 7;
  const s = Math.max(w, h) / 512;

  const inks = (params.inks ?? ['#2b2f6b', '#e8437d']).map(hexToRgbTriple);
  const inkA = inks[0] ?? [43, 47, 107];
  const inkB = inks[1] ?? inks[0] ?? [232, 67, 125];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] === 0) continue;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      const L = luma(r, g, b) / 255;
      let nr = r, ng = g, nb = b;

      switch (m) {
        case 'newsprint': {
          // Grey ink on cheap warm stock, screened coarse enough to see.
          const tone = 1 - Math.min(1, Math.max(0, (L - 0.08) * 1.18));
          const dot = screen(x, y, 4.2 * s, Math.PI / 4, tone);
          const fibre = fbm(x / (3 * s), y / (3 * s), seed, 2) * 0.06;
          const ink = Math.min(1, dot * 0.94 + tone * 0.16) + fibre;
          nr = 246 - ink * 214; ng = 241 - ink * 214; nb = 226 - ink * 202;
          break;
        }
        case 'riso': {
          // Two spot inks, each on its own screen, deliberately out of
          // registration — the misprint is the look.
          const tone = 1 - L;
          const a = screen(x + 1.6 * s, y - 1.2 * s, 3.4 * s, 0.26, Math.min(1, tone * 1.35));
          const bb = screen(x - 1.9 * s, y + 1.5 * s, 3.4 * s, 1.31, Math.min(1, Math.max(0, tone - 0.28) * 1.6));
          const grain = valueNoise2D(x / 1.6, y / 1.6, seed) * 0.16 - 0.08;
          const cover = (ch: number) =>
            250 * (1 - a * (1 - inkA[ch]! / 255) - bb * (1 - inkB[ch]! / 255)) + grain * 90;
          nr = cover(0); ng = cover(1); nb = cover(2);
          break;
        }
        case 'halftone': {
          // Process screens at the classic angles.
          const cy = screen(x, y, 5 * s, (15 * Math.PI) / 180, 1 - r / 255);
          const mg = screen(x, y, 5 * s, (75 * Math.PI) / 180, 1 - g / 255);
          const yl = screen(x, y, 5 * s, 0, 1 - b / 255);
          nr = 255 * (1 - cy * 0.92); ng = 255 * (1 - mg * 0.92); nb = 255 * (1 - yl * 0.92);
          break;
        }
        case 'photocopy': {
          // Blown-out midtones, toner speckle, a dirty platen edge.
          const noise = fbm(x / (2.2 * s), y / (2.2 * s), seed, 3) * 0.13;
          const t = smoothstep(0.36, 0.62, L + noise);
          const speck = valueNoise2D(x / 1.1, y / 1.1, seed + 3) > 0.965 ? -0.55 : 0;
          const v = Math.max(0, Math.min(1, t + speck));
          nr = 28 + v * 216; ng = 26 + v * 214; nb = 24 + v * 208;
          break;
        }
        case 'textile': {
          // Warp and weft, with slubs in the yarn.
          const warp = Math.sin((x / (2.6 * s)) * Math.PI) * 0.5 + 0.5;
          const weft = Math.sin((y / (2.6 * s)) * Math.PI) * 0.5 + 0.5;
          const weave = ((Math.floor(x / (2.6 * s)) + Math.floor(y / (2.6 * s))) % 2 ? warp : weft);
          const slub = fbm(x / (9 * s), y / (2 * s), seed, 2) * 0.12;
          const f = 0.78 + weave * 0.34 + slub;
          nr = r * f; ng = g * f; nb = b * f;
          break;
        }
        case 'satellite': {
          // Read luminance as terrain and false-colour it, then lay a tile grid.
          const stops: [number, [number, number, number]][] = [
            [0.0, [18, 32, 58]], [0.32, [26, 74, 82]], [0.5, [64, 96, 54]],
            [0.68, [136, 122, 70]], [0.84, [176, 150, 108]], [1, [232, 232, 226]],
          ];
          let lo = stops[0]!, hi = stops[stops.length - 1]!;
          for (let si = 0; si < stops.length - 1; si++) {
            if (L >= stops[si]![0] && L <= stops[si + 1]![0]) { lo = stops[si]!; hi = stops[si + 1]!; break; }
          }
          const t = hi[0] === lo[0] ? 0 : (L - lo[0]) / (hi[0] - lo[0]);
          const detail = fbm(x / (7 * s), y / (7 * s), seed, 3) * 22;
          nr = lo[1][0] + (hi[1][0] - lo[1][0]) * t + detail;
          ng = lo[1][1] + (hi[1][1] - lo[1][1]) * t + detail;
          nb = lo[1][2] + (hi[1][2] - lo[1][2]) * t + detail;
          const grid = (x % Math.round(64 * s) < 1 || y % Math.round(64 * s) < 1) ? 26 : 0;
          nr += grid; ng += grid; nb += grid;
          break;
        }
      }

      data[i] = r + (nr - r) * k;
      data[i + 1] = g + (ng - g) * k;
      data[i + 2] = b + (nb - b) * k;
    }
  }
  return bmp;
}
