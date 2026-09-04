/**
 * One renderer, three outputs.
 *
 * The screen canvas, the 1080 × 1350 piece and every replay frame all go
 * through this function, so what someone composes is exactly what they export.
 * A second "export-quality" renderer would drift from the editor within a
 * week, and the drift would land in the thing people share.
 */
import { PIECE } from '@collage/shared/constants';
import { orderedLayers, type Composition, type Layer } from '@collage/shared/version';
import { renderSubstrate } from './substrate.ts';
import { fragmentStore } from './fragmentStore.ts';
import type { PipelineOptions } from '../verbs/pipeline.ts';

export interface RenderOptions {
  width: number;
  height: number;
  /** Palette ramp resolved from the composition's palette id. */
  paletteRamp?: string[];
  /** Replay: how many layers have landed, and how far the next one has come. */
  reveal?: { count: number; progress: number };
  /** Editor chrome — never drawn into an export. */
  selectedId?: string | null;
  /** Skip the placeholder tier; used by exports, which wait for final pixels. */
  finalOnly?: boolean;
}

const shadowFor = (scale: number): { blur: number; offset: number } => ({
  blur: 9 * scale,
  offset: 3 * scale,
});

export function renderComposition(
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  opts: RenderOptions,
): void {
  const { width: W, height: H } = opts;
  const scale = W / PIECE.w;

  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(renderSubstrate(comp.substrate, Math.round(W), Math.round(H)) as CanvasImageSource, 0, 0, W, H);

  const pipelineOpts: PipelineOptions = {
    paletteRamp: opts.paletteRamp,
    paper: comp.substrate.colour,
  };

  const layers = orderedLayers(comp);
  const revealCount = opts.reveal ? opts.reveal.count : layers.length;
  const revealProgress = opts.reveal ? opts.reveal.progress : 1;

  for (let i = 0; i < layers.length; i++) {
    if (i > revealCount) break;
    const landing = opts.reveal && i === revealCount;
    const t = landing ? revealProgress : 1;
    if (landing && t <= 0) break;
    drawLayer(ctx, layers[i]!, scale, pipelineOpts, opts, t);
  }

  if (opts.selectedId) {
    const sel = layers.find((l) => l.id === opts.selectedId);
    if (sel) drawSelection(ctx, sel, scale);
  }
  ctx.restore();
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  scale: number,
  pipelineOpts: PipelineOptions,
  opts: RenderOptions,
  landing: number,
): void {
  const { transform: tr, fragment_ref: ref } = layer;
  const natW = ref.w ?? 512;
  const natH = ref.h ?? 512;
  // The fragment's own box, in canvas units, before any verb padding.
  const contentW = natW * tr.scale * scale;
  const contentH = natH * tr.scale * scale;
  if (contentW < 0.5) return;

  const seedOpts: PipelineOptions = { ...pipelineOpts, seed: hashLayerSeed(layer.id) };
  const processed = fragmentStore.get(ref, contentW, layer.verbs, seedOpts);
  const image = processed?.canvas ?? (opts.finalOnly ? undefined : fragmentStore.raw(ref, contentW));
  if (!image) return;

  // The extend verb grows the raster around the fragment's box. `size` is the
  // unpadded width, so it is what maps raster pixels onto canvas units; the
  // padding then shifts the draw origin outward by however much was added.
  const unpaddedW = processed ? processed.size : image.width;
  const unit = contentW / unpaddedW;
  const padL = (processed?.padLeft ?? 0) * unit;
  const padT = (processed?.padTop ?? 0) * unit;

  ctx.save();
  ctx.translate(tr.x * scale, tr.y * scale);
  ctx.rotate(tr.rotation);
  if (tr.flipX) ctx.scale(-1, 1);

  if (landing < 1) {
    // The replay's landing gesture: a fragment is placed, not faded in.
    const ease = 1 - Math.pow(1 - landing, 3);
    ctx.globalAlpha = Math.min(1, landing * 1.6);
    ctx.translate(0, (1 - ease) * -28 * scale);
    ctx.rotate((1 - ease) * 0.06);
    ctx.scale(1 + (1 - ease) * 0.06, 1 + (1 - ease) * 0.06);
  }
  ctx.globalAlpha *= layer.opacity ?? 1;

  const sh = shadowFor(scale * tr.scale);
  ctx.shadowColor = 'rgba(38,32,24,0.30)';
  ctx.shadowBlur = sh.blur;
  ctx.shadowOffsetY = sh.offset;

  ctx.drawImage(
    image as CanvasImageSource,
    -contentW / 2 - padL,
    -contentH / 2 - padT,
    image.width * unit,
    image.height * unit,
  );
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, layer: Layer, scale: number): void {
  const tr = layer.transform;
  const natW = (layer.fragment_ref.w ?? 512) * tr.scale * scale;
  const natH = (layer.fragment_ref.h ?? 512) * tr.scale * scale;
  ctx.save();
  ctx.translate(tr.x * scale, tr.y * scale);
  ctx.rotate(tr.rotation);
  ctx.strokeStyle = 'rgba(30,28,24,0.85)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(-natW / 2, -natH / 2, natW, natH);
  ctx.restore();
}

function hashLayerSeed(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
