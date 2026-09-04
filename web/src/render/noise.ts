/** Value-noise fBm. Deterministic per seed so a verb's result is reproducible
 *  from its stored parameters alone (PRD §9). */

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2D(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = fade(x - xi), yf = fade(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

/** Returns roughly -1..1. */
export function fbm(x: number, y: number, seed: number, octaves = 4, lacunarity = 2.07, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(fx, fy, seed + i * 131) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / (norm || 1);
}

/** Value noise with *linear* interpolation. The lack of a smoothing curve is
 *  the point: it yields straight segments meeting at lattice corners. */
function valueNoiseLinear(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

/** Straight-ish segments on a coarse lattice, rather than an organic wobble.
 *  What a scissor cut looks like: strokes, with a corner between them. */
export function facetNoise(x: number, y: number, seed: number, facet = 1): number {
  const f = Math.max(1, facet);
  return valueNoiseLinear(x / f, y / f, seed) * 2 - 1;
}
