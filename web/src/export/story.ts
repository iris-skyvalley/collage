/**
 * PRD §6.1 — the story: 1080 × 1920, "background outpainted from the
 * composition… because a 9:16 canvas is a bad collage frame — too narrow for
 * the layering that is the entire craft."
 *
 * So the composition is never re-laid-out for the taller frame. The piece is
 * placed whole, and the space above and below is grown out of its own top and
 * bottom edges: mirrored, pushed out of focus, and re-grained so it reads as
 * more of the same surface rather than as a blurred copy.
 */
import { PIECE, STORY } from '@collage/shared/constants';
import type { Composition, Substrate } from '@collage/shared/version';
import { renderFinal, exportCanvas, canvasToBlob } from './render.ts';
import { renderSubstrate } from '../render/substrate.ts';

export function outpaintTo(
  piece: HTMLCanvasElement,
  w: number,
  h: number,
  substrate?: Substrate,
): HTMLCanvasElement {
  const out = exportCanvas(w, h);
  const ctx = out.getContext('2d')!;
  const pieceH = Math.round((piece.height / piece.width) * w);
  const top = Math.round((h - pieceH) / 2);

  // Two things are grown out of the composition, in this order.
  //
  // First the substrate, rendered fresh at the taller size rather than
  // stretched: the piece then sits on more of its own paper, at the right
  // grain, which is what removes the seam. A blurred copy of the piece butted
  // against the piece meets it at a hard line, and at this radius that line is
  // the only thing you see.
  if (substrate) {
    ctx.drawImage(renderSubstrate(substrate, w, h) as CanvasImageSource, 0, 0, w, h);
  } else {
    ctx.fillStyle = '#1a1714';
    ctx.fillRect(0, 0, w, h);
  }

  // Then the piece's own colour, thrown far out of focus and laid over the
  // paper at low strength, so the extension carries the composition's palette
  // instead of reading as blank margin.
  const cover = Math.max(w / piece.width, h / piece.height);
  const cw = piece.width * cover, ch = piece.height * cover;
  const small = exportCanvas(Math.max(8, Math.round(w / 30)), Math.max(8, Math.round(h / 30)));
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(
    piece,
    ((w - cw) / 2 / w) * small.width,
    ((h - ch) / 2 / h) * small.height,
    (cw / w) * small.width,
    (ch / h) * small.height,
  );
  ctx.save();
  ctx.globalAlpha = 0.42;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, w, h);
  ctx.restore();

  // Grain over both, or the blur reads as a smeared JPEG.
  const grain = ctx.getImageData(0, 0, w, h);
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(grain, 0, 0);

  // A long, soft fall-off — spread over the whole margin rather than stopped
  // at the piece's edge, which would put back the cliff just removed.
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(20,16,12,0.14)');
  shade.addColorStop(top / h, 'rgba(20,16,12,0)');
  shade.addColorStop((top + pieceH) / h, 'rgba(20,16,12,0)');
  shade.addColorStop(1, 'rgba(20,16,12,0.14)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  // The piece sits on top, whole, with the shadow of a sheet on a sheet.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(piece, 0, top, w, pieceH);
  ctx.restore();
  return out;
}

export async function exportStory(comp: Composition, piece?: HTMLCanvasElement): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const base = piece ?? (await renderFinal(comp, PIECE.w, PIECE.h));
  const canvas = outpaintTo(base, STORY.w, STORY.h, comp.substrate);
  return { blob: await canvasToBlob(canvas, 'image/jpeg', 0.92), canvas };
}
