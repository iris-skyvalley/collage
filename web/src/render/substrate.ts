/**
 * PRD §8.1 — "Substrate layer: paper stock, colour, texture — a first-class
 * choice, not a background afterthought."
 *
 * Generated rather than shipped as bitmaps, so it is resolution-independent:
 * the same substrate renders at phone size and at 1080 × 1350 without
 * resampling a texture that was authored for one of them.
 */
import { fbm, valueNoise2D } from './noise.ts';
import { SUBSTRATE_STOCKS, type SubstrateTexture } from '@collage/shared/constants';
import type { Substrate } from '@collage/shared/version';
import { hexToRgbTriple } from '../verbs/types.ts';

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function key(sub: Substrate, w: number, h: number): string {
  return `${sub.stock}|${sub.colour}|${sub.texture}|${w}x${h}`;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function renderSubstrate(sub: Substrate, w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  const k = key(sub, w, h);
  const hit = cache.get(k);
  if (hit) return hit;

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const stock = SUBSTRATE_STOCKS.find((s) => s.id === sub.stock) ?? SUBSTRATE_STOCKS[0];
  const [br, bg, bb] = hexToRgbTriple(sub.colour);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const s = Math.max(w, h) / 1350;
  const tooth = stock.tooth, fibreAmt = stock.fibre;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let shade = 0;

      // Tooth: the fine tumble of the sheet's surface.
      shade += (valueNoise2D(x / (1.4 * s), y / (1.4 * s), 3) - 0.5) * 26 * tooth;
      // Fibre: longer strands lying in the pulp.
      shade += fbm(x / (28 * s), y / (5 * s), 17, 3) * 12 * fibreAmt;

      const [textureShade, warm] = texture(sub.texture, x, y, s);
      shade += textureShade;

      // A slow, uneven fall-off toward the corners — a sheet is never flat-lit.
      const vx = (x / w - 0.5) * 2, vy = (y / h - 0.5) * 2;
      shade -= (vx * vx + vy * vy) * 9;

      d[i] = br + shade + warm * 1.0;
      d[i + 1] = bg + shade * 0.97 + warm * 0.42;
      d[i + 2] = bb + shade * 0.9 - warm * 0.35;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(k, canvas);
  if (cache.size > 8) cache.delete(cache.keys().next().value as string);
  return canvas;
}

/** Returns [luminance shift, warm (rust-ward) shift]. */
function texture(t: SubstrateTexture, x: number, y: number, s: number): [number, number] {
  switch (t) {
    case 'smooth':
      return [0, 0];
    case 'laid':
      // Chain and laid lines of a mould-made sheet.
      return [Math.sin((y / (3.4 * s)) * Math.PI) * 5 + (x % Math.round(96 * s) < 2 * s ? -7 : 0), 0];
    case 'grain':
      return [fbm(x / (7 * s), y / (7 * s), 91, 3) * 14, 0];
    case 'speckle':
      return [valueNoise2D(x / 1.05, y / 1.05, 5) > 0.972 ? -34 : 0, 0];
    case 'foxed': {
      // Foxing is small rust-brown spots on an otherwise sound sheet, not
      // sheets of grey bloom: high frequency, high threshold, and the tone
      // shift is toward iron rather than toward shadow.
      const spot = fbm(x / (7 * s), y / (7 * s), 53, 3);
      const cluster = fbm(x / (52 * s), y / (52 * s), 29, 2);
      const strength = Math.max(0, spot - 0.34) * Math.max(0, 0.55 + cluster);
      const tooth = fbm(x / (9 * s), y / (9 * s), 7, 2) * 4;
      return [tooth - strength * 46, strength * 62];
    }
  }
}

export function clearSubstrateCache(): void {
  cache.clear();
}
