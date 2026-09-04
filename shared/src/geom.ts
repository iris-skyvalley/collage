export type Pt = [number, number];

/** Closed smooth path through points (Catmull-Rom converted to cubic Bezier). */
export function closedSpline(pts: Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 3) return '';
  const at = (i: number): Pt => pts[((i % n) + n) % n]!;
  let d = `M ${fmt(at(0)[0])} ${fmt(at(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C ${fmt(c1[0])} ${fmt(c1[1])}, ${fmt(c2[0])} ${fmt(c2[1])}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d + ' Z';
}

/** Open smooth path (same basis, endpoints held). */
export function openSpline(pts: Pt[]): string {
  const n = pts.length;
  if (n < 2) return '';
  const at = (i: number): Pt => pts[Math.min(n - 1, Math.max(0, i))]!;
  let d = `M ${fmt(at(0)[0])} ${fmt(at(0)[1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${fmt(c1[0])} ${fmt(c1[1])}, ${fmt(c2[0])} ${fmt(c2[1])}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d;
}

/** Closed blob from a radius function of angle — the workhorse for organic silhouettes. */
export function radialBlob(cx: number, cy: number, steps: number, radius: (t: number, i: number) => number): string {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius(t, i);
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return closedSpline(pts);
}

export function polygon(pts: Pt[]): string {
  return `M ${pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L ')} Z`;
}

export const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

export function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
