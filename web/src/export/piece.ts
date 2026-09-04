/** PRD §6.1 — the piece: 1080 × 1350, 4:5. Not user-selectable. */
import { PIECE } from '@collage/shared/constants';
import type { Composition } from '@collage/shared/version';
import { renderFinal, canvasToBlob } from './render.ts';

export async function exportPiece(comp: Composition): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const canvas = await renderFinal(comp, PIECE.w, PIECE.h);
  // No watermark on the still (PRD §6.3).
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.94);
  return { blob, canvas };
}
