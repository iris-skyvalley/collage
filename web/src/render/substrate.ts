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

  // Smooth is flat. A clean sheet is the default, and flat means exactly
  // that — no tooth, no fibre, no fall-off — rather than a quieter noise.
  if (sub.texture === 'smooth') {
    ctx.fillStyle = sub.colour;
    ctx.fillRect(0, 0, w, h);
    cache.set(k, canvas);
    return canvas;
  }

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

      // Tooth: the fine tumble of the sheet's surface. Kept faint and a
      // little coarser than a pixel — at phone scale a per-pixel tumble reads
      // as static, and paper is nearly flat until you look for the texture.
      shade += (valueNoise2D(x / (2.6 * s), y / (2.6 * s), 3) - 0.5) * 7 * tooth;
      // Fibre: longer strands lying in the pulp.
      shade += fbm(x / (34 * s), y / (6 * s), 17, 2) * 5 * fibreAmt;

      const [textureShade, warm] = texture(sub.texture, x, y, s);
      shade += textureShade;

      // A slow, uneven fall-off toward the corners — a sheet is never flat-lit.
      const vx = (x / w - 0.5) * 2, vy = (y / h - 0.5) * 2;
      shade -= (vx * vx + vy * vy) * 5;

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
      return [Math.sin((y / (3.4 * s)) * Math.PI) * 3 + (x % Math.round(96 * s) < 2 * s ? -5 : 0), 0];
    case 'grain':
      // A slow mottle, not a speckle.
      return [fbm(x / (16 * s), y / (16 * s), 91, 2) * 5, 0];
    case 'speckle':
      return [valueNoise2D(x / 1.05, y / 1.05, 5) > 0.985 ? -22 : 0, 0];
    case 'foxed': {
      // Foxing is small rust-brown spots on an otherwise sound sheet, not
      // sheets of grey bloom: high frequency, high threshold, and the tone
      // shift is toward iron rather than toward shadow.
      const spot = fbm(x / (7 * s), y / (7 * s), 53, 3);
      const cluster = fbm(x / (52 * s), y / (52 * s), 29, 2);
      const strength = Math.max(0, spot - 0.34) * Math.max(0, 0.55 + cluster);
      const tooth = fbm(x / (14 * s), y / (14 * s), 7, 2) * 3;
      return [tooth - strength * 40, strength * 54];
    }
  }
}

export function clearSubstrateCache(): void {
  cache.clear();
}
