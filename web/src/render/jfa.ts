/** Jump flooding: for every pixel, the index of the nearest set pixel.
 *  Used to extrapolate a fragment's own content outward (the extend verb). */
export function nearestSet(mask: Uint8Array, w: number, h: number): Int32Array {
  const seed = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) if (mask[i]) seed[i] = i;
  let step = 1;
  while (step < Math.max(w, h)) step <<= 1;

  const dist2 = (a: number, b: number): number => {
    const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0;
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  let cur = seed;
  let next = new Int32Array(w * h);
  for (; step >= 1; step >>= 1) {
    next.set(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let best = next[i]!;
        let bestD = best >= 0 ? dist2(i, best) : Infinity;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (!ox && !oy) continue;
            const nx = x + ox * step, ny = y + oy * step;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const cand = cur[ny * w + nx]!;
            if (cand < 0) continue;
            const d = dist2(i, cand);
            if (d < bestD) { bestD = d; best = cand; }
          }
        }
        next[i] = best;
      }
    }
    const swap = cur; cur = next; next = swap;
  }
  return cur;
}
