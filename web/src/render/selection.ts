/**
 * Selection geometry, shared by the renderer (which draws it) and the canvas
 * (which hit-tests it), so a handle is exactly where it looks like it is.
 * All values are in composition units (0..1080 × 0..1350).
 */
import type { Layer } from '@collage/shared/version';

/** Side of a square corner handle. */
export const HANDLE_SIZE = 22;
/** How far the rotate handle sits above the top edge. */
export const ROTATE_STEM = 64;
/** Hit radius around a handle's centre. */
export const HANDLE_HIT = 30;

export type Corner = 'tl' | 'tr' | 'br' | 'bl';
export type HandleHit = { kind: 'scale'; corner: Corner } | { kind: 'rotate' } | null;

export interface SelectionGeometry {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  corners: Record<Corner, [number, number]>;
  rotate: [number, number];
}

export function selectionGeometry(layer: Layer): SelectionGeometry {
  const tr = layer.transform;
  const w = (layer.fragment_ref.w ?? 512) * tr.scale;
  const h = (layer.fragment_ref.h ?? 512) * tr.scale;
  const cos = Math.cos(tr.rotation), sin = Math.sin(tr.rotation);
  const at = (lx: number, ly: number): [number, number] => [
    tr.x + lx * cos - ly * sin,
    tr.y + lx * sin + ly * cos,
  ];
  return {
    cx: tr.x, cy: tr.y, w, h, rotation: tr.rotation,
    corners: {
      tl: at(-w / 2, -h / 2), tr: at(w / 2, -h / 2),
      br: at(w / 2, h / 2), bl: at(-w / 2, h / 2),
    },
    rotate: at(0, -h / 2 - ROTATE_STEM),
  };
}

export function hitHandle(layer: Layer, x: number, y: number, tolerance = HANDLE_HIT): HandleHit {
  const g = selectionGeometry(layer);
  const near = (p: [number, number]): boolean => Math.hypot(p[0] - x, p[1] - y) <= tolerance;
  if (near(g.rotate)) return { kind: 'rotate' };
  for (const corner of ['tl', 'tr', 'br', 'bl'] as const) {
    if (near(g.corners[corner])) return { kind: 'scale', corner };
  }
  return null;
}

/** The resize cursor for a corner, allowing for the fragment's rotation so
 *  the arrow still points along the diagonal it drags. */
export function cornerCursor(corner: Corner, rotation: number): string {
  const base = corner === 'tl' || corner === 'br' ? 45 : 135; // degrees of the diagonal
  const deg = (((base + (rotation * 180) / Math.PI) % 180) + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}
