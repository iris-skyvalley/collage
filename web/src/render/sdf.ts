/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012),
 * used to turn a fragment's alpha channel into a signed distance field.
 *
 * The edge verb is boundary work, and boundary work on a bitmap mask needs to
 * know how far every pixel is from the silhouette. Thresholding
 * `sdf + noise * amplitude` then gives a displaced boundary that stays a
 * single closed contour, instead of the speckled fringe you get from
 * perturbing alpha directly.
 */

const INF = 1e20;

/** Squared EDT of a 1-D sample row, in place. */
function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dx = q - v[k]!;
    d[q] = dx * dx + f[v[k]!]!;
  }
}

/** Distance (in pixels) from every cell to the nearest cell where mask=1. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;

  const maxDim = Math.max(w, h);
  const f = new Float64Array(maxDim);
  const d = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }

  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]!);
  return out;
}

/** Signed distance to the silhouette: positive inside the shape, negative out. */
export function signedDistanceField(alpha: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 128): Float32Array {
  const inside = new Uint8Array(w * h);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (alpha[i * 4 + 3]! >= threshold) inside[i] = 1;
    else outside[i] = 1;
  }
  const dOut = distanceTransform(inside, w, h);   // distance to the shape
  const dIn = distanceTransform(outside, w, h);   // distance to the ground
  const sdf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) sdf[i] = inside[i] ? dIn[i]! : -dOut[i]!;
  return sdf;
}
