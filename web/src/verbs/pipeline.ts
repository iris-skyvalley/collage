/**
 * Runs a layer's verbs in a fixed order, regardless of the order the user
 * applied them in. The order is the physical one — you print the sheet, light
 * it, then tear it — so the pale fibre core an edge exposes is the last thing
 * to appear and does not get re-screened as newsprint afterwards.
 *
 * The stored record keeps the user's list as-is (PRD §9: verbs are stored as
 * parameters); this is purely how they are evaluated.
 */
import type { AppliedVerb } from '@collage/shared/version';
import { applyEdge, type EdgeParams } from './edge.ts';
import { applyMaterial, type MaterialParams } from './material.ts';
import { applyRelight, type RelightParams } from './relight.ts';
import { applyPalette } from './palette.ts';
import { applyRegionCut, applyMaskCut, type CutParams } from './cut.ts';
import { applyExtend, type ExtendParams, type Padded } from './extend.ts';
import type { Bitmap } from './types.ts';

const ORDER = ['cut', 'extend', 'material', 'relight', 'edge'] as const;

export interface PipelineOptions {
  /** Document palette ramp, applied last across every fragment. */
  paletteRamp?: string[];
  paletteStrength?: number;
  /** Substrate colour — what a torn edge's exposed fibre is tinted toward. */
  paper?: string;
  /** Masks resolved from `cut.mask_ref`, keyed by ref. */
  masks?: Map<string, Bitmap>;
  /** Stable per-layer seed, so a fragment's tear does not change on re-render. */
  seed?: number;
}

export function runVerbs(bitmap: Bitmap, verbs: AppliedVerb[], opts: PipelineOptions = {}): Padded {
  let current: Padded = { bitmap, padLeft: 0, padTop: 0 };
  const seed = opts.seed ?? 1;

  for (const name of ORDER) {
    for (const applied of verbs) {
      if (applied.verb !== name) continue;
      const p = applied.params as Record<string, unknown>;
      switch (name) {
        case 'cut': {
          const params = p as CutParams;
          const mask = params.mask_ref ? opts.masks?.get(params.mask_ref) : undefined;
          if (params.mode === 'semantic' && mask) applyMaskCut(current.bitmap, mask, params.keep ?? true);
          else if (params.mode !== 'semantic') applyRegionCut(current.bitmap, params);
          break;
        }
        case 'extend': {
          const grown = applyExtend(current.bitmap, { seed, ...(p as unknown as ExtendParams) });
          current = {
            bitmap: grown.bitmap,
            padLeft: current.padLeft + grown.padLeft,
            padTop: current.padTop + grown.padTop,
          };
          break;
        }
        case 'material':
          applyMaterial(current.bitmap, { seed, ...(p as unknown as MaterialParams) });
          break;
        case 'relight':
          applyRelight(current.bitmap, p as unknown as RelightParams);
          break;
        case 'edge':
          applyEdge(current.bitmap, { seed, paper: opts.paper, ...(p as unknown as EdgeParams) });
          break;
      }
    }
  }

  if (opts.paletteRamp && opts.paletteRamp.length > 1) {
    applyPalette(current.bitmap, { ramp: opts.paletteRamp, strength: opts.paletteStrength ?? 0.85 });
  }
  return current;
}

/** Cache key for a processed raster. Any change that alters pixels must
 *  change this string, or the canvas will show a stale fragment. */
export function pipelineKey(fragmentId: string, size: number, verbs: AppliedVerb[], opts: PipelineOptions): string {
  const v = verbs
    .map((x) => `${x.verb}:${Object.entries(x.params).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => `${k}=${val}`).join(',')}`)
    .join(';');
  return [fragmentId, size, v, (opts.paletteRamp ?? []).join(''), opts.paletteStrength ?? '', opts.paper ?? '', opts.seed ?? ''].join('|');
}
