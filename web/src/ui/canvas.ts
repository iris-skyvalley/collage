/**
 * The composing surface (PRD §8.1).
 *
 * Fixed 4:5, direct manipulation, no modal editing. Gestures are handled with
 * raw pointer events rather than a library because the whole interaction is
 * four cases — drag, pinch, rotate, tap — and each needs to stay on the
 * compositor's frame budget on a mid-range phone (PRD §10).
 */
import { PIECE } from '@collage/shared/constants';
import { orderedLayers } from '@collage/shared/version';
import { renderComposition } from '../render/renderer.ts';
import { fragmentStore } from '../render/fragmentStore.ts';
import { store, paletteRamp } from '../state/store.ts';
import { trackFirstChange } from '../lib/metrics.ts';

interface Pointer { id: number; x: number; y: number }

export class CanvasSurface {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private frame = 0;
  private pointers = new Map<number, Pointer>();
  /** When set, a tap is consumed by this handler instead of selecting a layer.
   *  Used by the cut verb, which needs a point rather than a selection. */
  tapHandler: ((x: number, y: number) => boolean) | null = null;
  private gesture: {
    layerId: string;
    startX: number; startY: number;
    originX: number; originY: number;
    startScale: number; startRotation: number;
    startDist: number; startAngle: number;
    moved: boolean;
  } | null = null;

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    this.host = host;
    this.el = document.createElement('canvas');
    this.el.className = 'canvas';
    this.el.setAttribute('role', 'application');
    this.el.setAttribute('aria-label', 'Collage canvas. Drag to move a piece, pinch to scale and rotate.');
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

  private onDown = (e: PointerEvent): void => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      const p = this.toComposition(e.clientX, e.clientY);
      if (this.tapHandler?.(p.x, p.y)) {
        this.pointers.delete(e.pointerId);
        e.preventDefault();
        return;
      }
      const hit = this.hitTest(p.x, p.y);
      store.select(hit);
      if (hit) this.beginGesture(hit);
    } else if (this.pointers.size === 2 && store.get().selectedId) {
      this.beginGesture(store.get().selectedId!);
    }
    e.preventDefault();
  };

  private beginGesture(layerId: string): void {
    const layer = store.comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const pts = [...this.pointers.values()];
    const a = pts[0]!;
    const b = pts[1];
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    this.gesture = {
      layerId,
      startX: centre.x,
      startY: centre.y,
      originX: layer.transform.x,
      originY: layer.transform.y,
      startScale: layer.transform.scale,
      startRotation: layer.transform.rotation,
      startDist: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
      startAngle: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0,
      moved: false,
    };
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    const g = this.gesture;
    if (!g) return;

    const pts = [...this.pointers.values()];
    const a = pts[0]!;
    const b = pts[1];
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    const patch: Record<string, number> = {
      x: g.originX + (centre.x - g.startX) * this.unitScale,
      y: g.originY + (centre.y - g.startY) * this.unitScale,
    };

    if (b && g.startDist > 0) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      patch['scale'] = Math.max(0.04, Math.min(4, g.startScale * (dist / g.startDist)));
      patch['rotation'] = g.startRotation + (angle - g.startAngle);
    }

    if (!g.moved && (Math.abs(centre.x - g.startX) > 2 || Math.abs(centre.y - g.startY) > 2)) {
      g.moved = true;
      trackFirstChange();
    }
    // Not a history step: the gesture as a whole is one undo.
    store.updateTransform(g.layerId, patch);
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.gesture) {
      const g = this.gesture;
      this.gesture = null;
      if (g.moved) {
        // Commit the gesture as a single undoable change.
        const layer = store.comp.layers.find((l) => l.id === g.layerId);
        if (layer) {
          const now = { ...layer.transform };
          store.updateTransform(g.layerId, { x: g.originX, y: g.originY, scale: g.startScale, rotation: g.startRotation });
          store.updateTransform(g.layerId, now, { history: true });
        }
      }
    } else if (this.pointers.size === 1 && store.get().selectedId) {
      this.beginGesture(store.get().selectedId!);
    }
  };
}
