/** The verbs operate on plain RGBA buffers so they run identically in a
 *  worker, on the main thread, and under `node --test`. */
export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const makeBitmap = (width: number, height: number): Bitmap => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
});

export const cloneBitmap = (b: Bitmap): Bitmap => ({
  data: new Uint8ClampedArray(b.data),
  width: b.width,
  height: b.height,
});

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function hexToRgbTriple(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16) || 0, parseInt(f.slice(2, 4), 16) || 0, parseInt(f.slice(4, 6), 16) || 0];
}

export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
