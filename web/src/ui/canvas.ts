/**
 * The composing surface (PRD §8.1).
 *
 * Fixed 4:5, direct manipulation, no modal editing. Two input models share
 * one transform: on touch, a second finger scales and rotates; with a mouse,
 * the corner handles scale, the stem handle rotates, and the wheel scales.
 * Raw pointer events rather than a library, because the whole interaction is
 * a handful of cases and each needs to stay on the compositor's frame budget
 * on a mid-range phone (PRD §10).
 */
import { PIECE } from '@collage/shared/constants';
import { orderedLayers, type Layer } from '@collage/shared/version';
import { renderComposition } from '../render/renderer.ts';
import { fragmentStore } from '../render/fragmentStore.ts';
import { cornerCursor, hitHandle, type HandleHit } from '../render/selection.ts';
import { store, paletteRamp } from '../state/store.ts';
import { trackFirstChange } from '../lib/metrics.ts';

interface Pointer { id: number; x: number; y: number }

type GestureKind = 'move' | 'pinch' | 'scale' | 'rotate';

interface Gesture {
  kind: GestureKind;
  layerId: string;
  /** Where the gesture began, in CSS pixels (a pointer, or a pinch centre). */
  startX: number;
  startY: number;
  /** The layer's transform when the gesture began. */
  origin: Layer['transform'];
  /** Pinch: initial finger distance and angle. Handle: initial distance and
   *  angle from the layer's centre. */
  startDist: number;
  startAngle: number;
  moved: boolean;
}

export class CanvasSurface {
  readonly el: HTMLCanvasElement;
  /** When set, a tap is consumed by this handler instead of selecting a layer.
   *  Used by the cut verb, which needs a point rather than a selection. */
  tapHandler: ((x: number, y: number) => boolean) | null = null;

  private host: HTMLElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private frame = 0;
  private pointers = new Map<number, Pointer>();
  private gesture: Gesture | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.el = document.createElement('canvas');
    this.el.className = 'canvas';
    this.el.setAttribute('role', 'application');
    this.el.setAttribute('aria-label', 'Collage canvas. Drag to move a piece; drag a corner to resize, the stem to rotate.');
    this.el.tabIndex = 0;
    this.host.appendChild(this.el);
    this.ctx = this.el.getContext('2d')!;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.resize();

    fragmentStore.onChange = () => this.requestPaint();
    store.subscribe(() => this.requestPaint());

    this.el.addEventListener('pointerdown', this.onDown, { passive: false });
    this.el.addEventListener('pointermove', this.onMove, { passive: false });
    this.el.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('pointercancel', this.onUp);
    this.el.addEventListener('pointerleave', () => { if (!this.gesture) this.el.style.cursor = ''; });
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    // The canvas owns its gestures; the page must not pan underneath them.
    this.el.style.touchAction = 'none';
  }

  /** Composition units per CSS pixel. */
  private get unitScale(): number { return PIECE.w / this.cssW; }

  toComposition(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: (clientX - r.left) * this.unitScale, y: (clientY - r.top) * this.unitScale };
  }

  private resize(): void {
    // The content box, not the border box: the stage is padded, and fitting to
    // the padded width overflows it by exactly the padding.
    const cs = getComputedStyle(this.host);
    const availW = this.host.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = this.host.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (!(availW > 0) || !(availH > 0)) return;
    // 4:5, fitted. The frame never changes shape (PRD §6.1).
    const scale = Math.min(availW / PIECE.w, availH / PIECE.h);
    this.cssW = Math.floor(PIECE.w * scale);
    this.cssH = Math.floor(PIECE.h * scale);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.style.width = `${this.cssW}px`;
    this.el.style.height = `${this.cssH}px`;
    this.el.width = Math.round(this.cssW * dpr);
    this.el.height = Math.round(this.cssH * dpr);
    this.requestPaint();
  }

  requestPaint(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const { comp, selectedId } = store.get();
    renderComposition(this.ctx, comp, {
      width: this.el.width,
      height: this.el.height,
      paletteRamp: paletteRamp(comp.palette),
      selectedId,
    });
  }

  private selectedLayer(): Layer | undefined {
    const { comp, selectedId } = store.get();
    return comp.layers.find((l) => l.id === selectedId);
  }

  /** Topmost layer whose pixels are actually under the point. */
  hitTest(cx: number, cy: number): string | null {
    const { comp } = store.get();
    const layers = orderedLayers(comp);
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]!;
      const tr = l.transform;
      const dx = cx - tr.x, dy = cy - tr.y;
      const cos = Math.cos(-tr.rotation), sin = Math.sin(-tr.rotation);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      const w = (l.fragment_ref.w ?? 512) * tr.scale;
      const h = (l.fragment_ref.h ?? 512) * tr.scale;
      if (Math.abs(lx) > w / 2 || Math.abs(ly) > h / 2) continue;

      // Inside the box — now check the fragment actually has ink there, so a
      // leaf's empty corner does not steal a tap from the layer beneath it.
      const raster = fragmentStore.raw(l.fragment_ref, w * (this.cssW / PIECE.w));
      if (!raster) return l.id;
      const px = Math.floor(((lx + w / 2) / w) * raster.width);
      const py = Math.floor(((ly + h / 2) / h) * raster.height);
      try {
        const ctx = raster.getContext('2d') as CanvasRenderingContext2D;
        const alpha = ctx.getImageData(px, py, 1, 1).data[3]!;
        if (alpha > 14) return l.id;
      } catch {
        return l.id;
      }
    }
    return null;
  }

  /** A handle of the selected layer under the point, if any. Tolerance is in
   *  CSS pixels so it feels the same at every canvas size. */
  private handleAt(cx: number, cy: number): HandleHit {
    const layer = this.selectedLayer();
    if (!layer) return null;
    return hitHandle(layer, cx, cy, 14 * this.unitScale);
  }

  // --- pointers -------------------------------------------------------------

  private onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.el.focus({ preventScroll: true });
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    e.preventDefault();

    if (this.pointers.size === 2) {
      const selected = store.get().selectedId;
      if (selected) this.begin('pinch', selected, e);
      return;
    }
    if (this.pointers.size !== 1) return;

    const p = this.toComposition(e.clientX, e.clientY);
    if (this.tapHandler?.(p.x, p.y)) {
      this.pointers.delete(e.pointerId);
      return;
    }

    // Handles belong to the selection and win over whatever is under them.
    const handle = this.handleAt(p.x, p.y);
    if (handle) {
      this.begin(handle.kind, store.get().selectedId!, e);
      return;
    }

    const hit = this.hitTest(p.x, p.y);
    store.select(hit);
    if (hit) this.begin('move', hit, e);
  };

  private begin(kind: GestureKind, layerId: string, e: PointerEvent): void {
    const layer = store.comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const pts = [...this.pointers.values()];
    const a = pts[0]!, b = pts[1];
    let startX = e.clientX, startY = e.clientY, startDist = 0, startAngle = 0;

    if (kind === 'pinch' && b) {
      startX = (a.x + b.x) / 2; startY = (a.y + b.y) / 2;
      startDist = Math.hypot(b.x - a.x, b.y - a.y);
      startAngle = Math.atan2(b.y - a.y, b.x - a.x);
    } else if (kind === 'scale' || kind === 'rotate') {
      // Measured from the layer's centre, in composition space.
      const p = this.toComposition(e.clientX, e.clientY);
      startDist = Math.hypot(p.x - layer.transform.x, p.y - layer.transform.y);
      startAngle = Math.atan2(p.y - layer.transform.y, p.x - layer.transform.x);
    }

    this.gesture = {
      kind, layerId, startX, startY,
      origin: { ...layer.transform },
      startDist, startAngle, moved: false,
    };
    this.el.style.cursor = kind === 'move' ? 'grabbing' : this.el.style.cursor;
  }

  private onMove = (e: PointerEvent): void => {
    if (this.pointers.has(e.pointerId)) {
      this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    }
    const g = this.gesture;
    if (!g) {
      this.updateCursor(e);
      return;
    }
    e.preventDefault();

    const patch: Partial<Layer['transform']> = {};
    if (g.kind === 'move') {
      patch.x = g.origin.x + (e.clientX - g.startX) * this.unitScale;
      patch.y = g.origin.y + (e.clientY - g.startY) * this.unitScale;
    } else if (g.kind === 'pinch') {
      const pts = [...this.pointers.values()];
      const a = pts[0]!, b = pts[1];
      if (!b || g.startDist === 0) return;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      patch.x = g.origin.x + (cx - g.startX) * this.unitScale;
      patch.y = g.origin.y + (cy - g.startY) * this.unitScale;
      patch.scale = clampScale(g.origin.scale * (Math.hypot(b.x - a.x, b.y - a.y) / g.startDist));
      patch.rotation = g.origin.rotation + (Math.atan2(b.y - a.y, b.x - a.x) - g.startAngle);
    } else {
      const p = this.toComposition(e.clientX, e.clientY);
      const dist = Math.hypot(p.x - g.origin.x, p.y - g.origin.y);
      const angle = Math.atan2(p.y - g.origin.y, p.x - g.origin.x);
      if (g.kind === 'scale') {
        // A corner scales about the centre, so the opposite corner holds.
        if (g.startDist > 0) patch.scale = clampScale(g.origin.scale * (dist / g.startDist));
      } else {
        let rotation = g.origin.rotation + (angle - g.startAngle);
        // Shift snaps to 15°, which is how a mouse wants to rotate.
        if (e.shiftKey) rotation = Math.round(rotation / (Math.PI / 12)) * (Math.PI / 12);
        patch.rotation = rotation;
      }
    }

    if (!g.moved) {
      g.moved = true;
      trackFirstChange();
    }
    // Not a history step: the gesture as a whole is one undo.
    store.updateTransform(g.layerId, patch);
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.gesture) {
      const g = this.gesture;
      this.gesture = null;
      this.el.style.cursor = '';
      if (g.moved) this.commit(g);
    } else if (this.pointers.size === 1 && this.gesture?.kind === 'pinch') {
      // One finger lifted mid-pinch: carry on as a move from here.
      const remaining = [...this.pointers.values()][0]!;
      const layer = store.comp.layers.find((l) => l.id === this.gesture!.layerId);
      if (layer) {
        this.gesture = {
          ...this.gesture,
          kind: 'move',
          startX: remaining.x,
          startY: remaining.y,
          origin: { ...layer.transform },
        };
      }
    }
  };

  /** Commit a finished gesture as a single undoable change. */
  private commit(g: Gesture): void {
    const layer = store.comp.layers.find((l) => l.id === g.layerId);
    if (!layer) return;
    const now = { ...layer.transform };
    store.updateTransform(g.layerId, g.origin);
    store.updateTransform(g.layerId, now, { history: true });
  }

  private updateCursor(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    const p = this.toComposition(e.clientX, e.clientY);
    const handle = this.handleAt(p.x, p.y);
    if (handle?.kind === 'rotate') { this.el.style.cursor = 'grab'; return; }
    if (handle?.kind === 'scale') {
      this.el.style.cursor = cornerCursor(handle.corner, this.selectedLayer()!.transform.rotation);
      return;
    }
    this.el.style.cursor = this.hitTest(p.x, p.y) ? 'grab' : '';
  }

  // --- wheel and keys, for the desk -------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    const layer = this.selectedLayer();
    if (!layer) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0018);
    store.updateTransform(layer.id, { scale: clampScale(layer.transform.scale * factor) }, { history: true });
    trackFirstChange();
  };

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const layer = this.selectedLayer();
    if (!layer) return;
    const step = e.shiftKey ? 20 : 4;
    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        store.removeLayer(layer.id);
        break;
      case 'ArrowLeft': store.updateTransform(layer.id, { x: layer.transform.x - step }, { history: true }); break;
      case 'ArrowRight': store.updateTransform(layer.id, { x: layer.transform.x + step }, { history: true }); break;
      case 'ArrowUp': store.updateTransform(layer.id, { y: layer.transform.y - step }, { history: true }); break;
      case 'ArrowDown': store.updateTransform(layer.id, { y: layer.transform.y + step }, { history: true }); break;
      case 'Escape': store.select(null); break;
      default: return;
    }
    e.preventDefault();
  };
}

const clampScale = (s: number): number => Math.max(0.04, Math.min(4, s));
