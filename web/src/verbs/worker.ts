/**
 * The verb pipeline, off the main thread.
 *
 * An edge is a distance transform over the whole raster; run inline it stalls
 * the page for 50–200ms per step, which is what a slider feels as stutter.
 * The verbs are pure functions on RGBA buffers, so they run here unchanged,
 * and the buffers cross by transfer rather than copy.
 */
import { runVerbs } from './pipeline.ts';
import type { AppliedVerb } from '@collage/shared/version';
import type { PipelineOptions } from './pipeline.ts';

export interface VerbJob {
  key: string;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  verbs: AppliedVerb[];
  opts: PipelineOptions;
}

export interface VerbResult {
  key: string;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  padLeft: number;
  padTop: number;
}

self.onmessage = (e: MessageEvent<VerbJob>) => {
  const { key, data, width, height, verbs, opts } = e.data;
  const out = runVerbs({ data, width, height }, verbs, opts);
  const result: VerbResult = {
    key,
    data: out.bitmap.data,
    width: out.bitmap.width,
    height: out.bitmap.height,
    padLeft: out.padLeft,
    padTop: out.padTop,
  };
  (self as unknown as Worker).postMessage(result, [out.bitmap.data.buffer as ArrayBuffer]);
};
