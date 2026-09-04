/**
 * PRD §8.3 — Edge. "The highest-priority verb… in the reference collage the
 * torn white edges are where the entire craft signal lives, and no tool ships
 * edge treatment as a first-class parameter."
 *
 * Boundary displacement over a signed distance field, not an alpha threshold.
 * The distinction matters: perturbing alpha directly gives a speckled fringe,
 * while displacing an SDF moves the whole contour, so the silhouette stays a
 * single closed shape at any roughness.
 *
 * The boundary only ever *recedes* — tearing removes material, it does not
 * invent it. The one thing added is the pale fibre core a real torn edge
 * exposes, painted into a band of pixels the shape already owned.
 */
import { fbm, facetNoise } from '../render/noise.ts';
import { signedDistanceField } from '../render/sdf.ts';
import { hexToRgbTriple, smoothstep, type Bitmap } from './types.ts';
import type { EdgeStyle } from '@collage/shared/constants';

export interface EdgeParams {
  style: EdgeStyle;
  /** 0..1 — the slider. Scales amplitude and, for some styles, frequency. */
  roughness: number;
  /** Paper tint for the exposed fibre core. */
  paper?: string;
  seed?: number;
}

interface Profile {
  /** Peak inward displacement, in pixels at a 512px reference size. */
  amp: number;
  /** Noise frequency (cycles per pixel). */
  freq: number;
  /** Boundary softness in pixels. */
  feather: number;
  /** Width of the exposed fibre core. 0 for no rim. */
  rim: number;
  /** How far loose fibres reach past the new boundary. */
  fibre: number;
  octaves: number;
  /** Lattice size for faceted (straight-segment) noise; 0 uses fBm. */
  facet: number;
}

function profile(style: EdgeStyle, k: number): Profile {
  switch (style) {
    case 'clean':
      return { amp: 0, freq: 0, feather: 0.6, rim: 0, fibre: 0, octaves: 1, facet: 0 };
    case 'cut':
      // A blade: near-straight, a hair of wander.
      return { amp: 1.2 + k * 4, freq: 0.014, feather: 0.7, rim: 0, fibre: 0, octaves: 2, facet: 0 };
    case 'scissor':
      // Segments, because scissors cut in strokes.
      return { amp: 2 + k * 10, freq: 0.02, feather: 0.8, rim: 0.8 + k * 1.6, fibre: 0, octaves: 1, facet: 34 - k * 18 };
    case 'torn':
      return { amp: 4 + k * 20, freq: 0.035, feather: 1.1, rim: 2.5 + k * 7, fibre: 3 + k * 10, octaves: 3, facet: 0 };
    case 'deckle':
      // Mould-made paper: a slow, soft, shallow wave.
      return { amp: 2 + k * 8, freq: 0.011, feather: 3 + k * 3, rim: 1.5 + k * 3.5, fibre: 1 + k * 2, octaves: 2, facet: 0 };
    case 'burnt':
      return { amp: 3 + k * 18, freq: 0.04, feather: 1.3, rim: 0, fibre: 0, octaves: 3, facet: 0 };
  }
}

const SCORCH = [
  [26, 18, 12],   // char at the lip
  [78, 42, 20],
  [140, 92, 44],  // fading into the sheet
] as const;

export function applyEdge(bmp: Bitmap, params: EdgeParams): Bitmap {
  const style = params.style ?? 'clean';
  if (style === 'clean') return bmp;

  const { data, width: w, height: h } = bmp;
  const k = Math.max(0, Math.min(1, params.roughness ?? 0.5));
  const p = profile(style, k);
  const seed = params.seed ?? 1;

  // Amplitudes are authored against a 512px fragment so a torn edge looks the
  // same whether the raster is 256px or 1024px.
  const s = Math.max(w, h) / 512;
  const amp = p.amp * s;
  const feather = Math.max(0.6, p.feather * s);
  const rim = p.rim * s;
  const fibre = p.fibre * s;
  const freq = p.freq / s;

  const sdf = signedDistanceField(data, w, h);
  const [pr, pg, pb] = hexToRgbTriple(params.paper ?? '#f6f0e2');

  // freq is cycles per pixel: 0.035 puts one undulation every ~28px, which is
  // what a torn edge actually looks like. Anything an order of magnitude
  // higher reads as dust on the boundary rather than as tearing.
  const noiseAt = (x: number, y: number, off: number): number =>
    p.facet > 0
      ? facetNoise(x, y, seed + off, p.facet * s)
      : fbm(x * freq, y * freq, seed + off, p.octaves);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = data[i * 4 + 3]!;
      const d = sdf[i]!;
      // Only pixels near the boundary can change; the interior is untouched.
      if (a === 0 && d < -(fibre + feather)) continue;
      if (d > amp + rim + feather + 2) continue;

      const n = noiseAt(x, y, 0);
      // Map noise to 0..1 so displacement is inward-only.
      const bite = (0.5 + 0.5 * n) * amp;
      const nd = d - bite;

      const keep = smoothstep(-feather, feather, nd);
      let alpha = a * keep;

      if (style === 'burnt') {
        // Fire eats holes ahead of the front and chars what it leaves.
        const hole = noiseAt(x, y, 977);
        const nearFront = smoothstep(amp * 1.8, 0, nd);
        if (hole > 0.42 && nearFront > 0.35) alpha *= 1 - smoothstep(0.42, 0.72, hole) * nearFront;
        if (alpha > 0) {
          const t = smoothstep(0, amp * 1.5 + 6 * s, nd); // 0 at the lip, 1 into the sheet
          const band = t < 0.5 ? t * 2 : (t - 0.5) * 2;
          const from = SCORCH[t < 0.5 ? 0 : 1]!;
          const to = SCORCH[t < 0.5 ? 1 : 2]!;
          const mix = (1 - t) * (1 - t);
          for (let c = 0; c < 3; c++) {
            const scorch = from[c]! + (to[c]! - from[c]!) * band;
            data[i * 4 + c] = data[i * 4 + c]! * (1 - mix) + scorch * mix;
          }
        }
      } else if (rim > 0) {
        // The pale core a torn sheet exposes. Painted into pixels the shape
        // already owned, so nothing is invented outside the silhouette. Its
        // width wanders on a slower noise than the boundary itself, because a
        // tear exposes more fibre where it pulled and less where it snapped.
        const localRim = rim * (0.35 + 1.15 * (0.5 + 0.5 * noiseAt(x * 0.35, y * 0.35, 611)));
        const core = smoothstep(localRim, 0, nd) * smoothstep(-feather, feather * 0.5, nd);
        if (core > 0 && alpha > 0) {
          const t = core * 0.92;
          data[i * 4 + 0] = data[i * 4 + 0]! * (1 - t) + pr * t;
          data[i * 4 + 1] = data[i * 4 + 1]! * (1 - t) + pg * t;
          data[i * 4 + 2] = data[i * 4 + 2]! * (1 - t) + pb * t;
        }
        // Loose fibres reaching past the new boundary.
        if (fibre > 0 && nd < 0 && nd > -fibre) {
          const wisp = noiseAt(x, y, 313);
          const reach = 1 - -nd / fibre;
          const strength = smoothstep(0.15, 0.6, wisp) * reach * reach;
          if (strength > 0.02) {
            const fa = Math.max(alpha, 255 * strength * 0.85);
            if (fa > alpha) {
              data[i * 4 + 0] = pr;
              data[i * 4 + 1] = pg;
              data[i * 4 + 2] = pb;
              alpha = fa;
            }
          }
        }
      }

      data[i * 4 + 3] = alpha;
    }
  }
  return bmp;
}
