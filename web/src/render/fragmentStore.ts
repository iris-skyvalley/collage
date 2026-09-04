/**
 * Resolves fragment references to pixels, and caches both the raw raster and
 * the verb-processed result.
 *
 * Two tiers on purpose (PRD §10, Performance: "Verb latency under 3s with an
 * optimistic placeholder"): the raw raster is available almost immediately and
 * is what the canvas shows while the verb pipeline runs, so applying an edge
 * never blanks the piece. Dragging does not change verbs, so the processed
 * raster survives a gesture untouched and interaction stays at 60fps.
 */
import type { AppliedVerb, FragmentRef } from '@collage/shared/version';
import { runVerbs, pipelineKey, type PipelineOptions } from '../verbs/pipeline.ts';
import type { Bitmap } from '../verbs/types.ts';
import { resolveUploadUrl } from '../tray/uploads.ts';
import { localFragmentUrl } from '../tray/local.ts';

export interface Processed {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  padLeft: number;
  padTop: number;
  /** Raster size the pipeline ran at, in fragment pixels. */
  size: number;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Raster sizes are bucketed so a pinch does not re-run the pipeline on every
 *  frame; the gesture scales the existing raster and re-buckets on release. */
export const sizeBucket = (px: number): number =>
  Math.max(128, Math.min(1536, Math.round(px / 128) * 128));

export class FragmentStore {
  private sources = new Map<string, HTMLImageElement>();
  private loading = new Map<string, Promise<HTMLImageElement>>();
  private processed = new Map<string, Processed>();
  private working = new Set<string>();
  private failed = new Set<string>();
  private order: string[] = [];
  /** Called whenever new pixels become available and the canvas should repaint. */
  onChange: () => void = () => {};

  private uri(ref: FragmentRef): string {
    if (ref.source === 'upload') return resolveUploadUrl(ref.id) ?? ref.uri ?? '';
    // A generated id is its own seed: the pixels come from the generator on
    // this device, identically to what the server would serve, and no request
    // is made. Archive refs still resolve by URL.
    if (ref.source === 'generated') return localFragmentUrl(ref.id) ?? ref.uri ?? '';
    return ref.uri ?? '';
  }

  source(ref: FragmentRef): HTMLImageElement | undefined {
    const hit = this.sources.get(ref.id);
    if (hit) return hit;
    if (!this.loading.has(ref.id)) {
      const url = this.uri(ref);
      const p = new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`fragment failed to load: ${ref.id}`));
        img.src = url;
      });
      this.loading.set(ref.id, p);
      p.then((img) => {
        this.sources.set(ref.id, img);
        this.onChange();
      }).catch((err) => {
        // A fragment that cannot load must not keep the export waiting; it is
        // left out and the rest of the piece still renders.
        this.failed.add(ref.id);
        console.warn(err);
        this.onChange();
      });
    }
    return undefined;
  }

  /** Rasterise the reference at `size` with no verbs applied. */
  private rasterise(ref: FragmentRef, w: number, h: number): AnyCanvas | undefined {
    const img = this.source(ref);
    if (!img) return undefined;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  }

  /**
   * The verb-processed raster, or undefined while it is being produced. The
   * caller draws `rawRaster` in the meantime.
   */
  get(ref: FragmentRef, sizePx: number, verbs: AppliedVerb[], opts: PipelineOptions): Processed | undefined {
    const size = sizeBucket(sizePx);
    const key = pipelineKey(ref.id, size, verbs, opts);
    const hit = this.processed.get(key);
    if (hit) return hit;
    if (verbs.length === 0 && !opts.paletteRamp?.length) {
      const aspect = (ref.h ?? 512) / (ref.w ?? 512);
      const c = this.rasterise(ref, size, Math.round(size * aspect));
      if (!c) return undefined;
      const out: Processed = { canvas: c, padLeft: 0, padTop: 0, size };
      this.remember(key, out);
      return out;
    }
    if (!this.working.has(key)) {
      this.working.add(key);
      // Yielding first keeps the gesture that triggered this from stuttering.
      queueMicrotask(() => {
        try {
          const aspect = (ref.h ?? 512) / (ref.w ?? 512);
          const h = Math.round(size * aspect);
          const raw = this.rasterise(ref, size, h);
          if (!raw) { this.working.delete(key); return; }
          const ctx = raw.getContext('2d') as CanvasRenderingContext2D;
          const img = ctx.getImageData(0, 0, size, h);
          const bmp: Bitmap = { data: img.data, width: size, height: h };
          const result = runVerbs(bmp, verbs, opts);
          const out = makeCanvas(result.bitmap.width, result.bitmap.height);
          const octx = out.getContext('2d') as CanvasRenderingContext2D;
          octx.putImageData(
            new ImageData(
              result.bitmap.data as Uint8ClampedArray<ArrayBuffer>,
              result.bitmap.width,
              result.bitmap.height,
            ),
            0, 0,
          );
          this.remember(key, { canvas: out, padLeft: result.padLeft, padTop: result.padTop, size });
          this.onChange();
        } catch (err) {
          console.warn('verb pipeline failed', err);
        } finally {
          this.working.delete(key);
        }
      });
    }
    return undefined;
  }

  /** The un-processed raster, for the optimistic placeholder. */
  raw(ref: FragmentRef, sizePx: number): AnyCanvas | undefined {
    const size = sizeBucket(sizePx);
    const aspect = (ref.h ?? 512) / (ref.w ?? 512);
    const key = `raw|${ref.id}|${size}`;
    const hit = this.processed.get(key);
    if (hit) return hit.canvas;
    const c = this.rasterise(ref, size, Math.round(size * aspect));
    if (!c) return undefined;
    this.remember(key, { canvas: c, padLeft: 0, padTop: 0, size });
    return c;
  }

  /** Whether every layer in a composition has final pixels — the export path
   *  waits on this so a share never captures a placeholder. */
  isSettled(): boolean {
    return this.working.size === 0 && this.loading.size === this.sources.size + this.failed.size;
  }

  private remember(key: string, p: Processed): void {
    this.processed.set(key, p);
    this.order.push(key);
    while (this.order.length > 120) {
      const evict = this.order.shift()!;
      if (evict !== key) this.processed.delete(evict);
    }
  }

  invalidateUpload(id: string): void {
    this.sources.delete(id);
    this.loading.delete(id);
    this.failed.delete(id);
    for (const key of [...this.processed.keys()]) {
      if (key.startsWith(`${id}|`) || key.startsWith(`raw|${id}|`)) this.processed.delete(key);
    }
  }
}

export const fragmentStore = new FragmentStore();
