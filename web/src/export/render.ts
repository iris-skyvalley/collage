/** Offscreen rendering at export resolution, using the same renderer the
 *  editor draws with. Waits for final pixels so a share never captures a
 *  placeholder. */
import { renderComposition, type RenderOptions } from '../render/renderer.ts';
import { fragmentStore } from '../render/fragmentStore.ts';
import { paletteRamp } from '../state/store.ts';
import type { Composition } from '@collage/shared/version';

export function exportCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Render at full size once every fragment has its final, verb-processed
 * pixels. The pipeline is kicked by rendering, so this alternates drawing and
 * waiting rather than pre-declaring what it needs.
 */
export async function renderFinal(
  comp: Composition,
  w: number,
  h: number,
  extra: Partial<RenderOptions> = {},
  timeoutMs = 12000,
): Promise<HTMLCanvasElement> {
  const canvas = exportCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const opts: RenderOptions = { width: w, height: h, paletteRamp: paletteRamp(comp.palette), ...extra };

  const deadline = Date.now() + timeoutMs;
  // First pass requests the rasters; subsequent passes pick them up.
  renderComposition(ctx, comp, opts);
  while (!fragmentStore.isSettled() && Date.now() < deadline) {
    await sleep(40);
    renderComposition(ctx, comp, opts);
  }
  // A final pass with placeholders disabled: anything still missing is left
  // out rather than exported at the wrong fidelity.
  renderComposition(ctx, comp, { ...opts, finalOnly: true });
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas encode failed'))), type, quality);
  });
}
