/** Deterministic PRNG. Every fragment is reproducible from its id, which is
 *  what lets the tray be cached and pre-warmed rather than regenerated. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rand {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
}

export function rand(seed: number | string): Rand {
  const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  const r = (() => next()) as Rand;
  r.range = (a, b) => a + next() * (b - a);
  r.int = (a, b) => Math.floor(a + next() * (b - a + 1));
  r.pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  r.chance = (p) => next() < p;
  return r;
}
