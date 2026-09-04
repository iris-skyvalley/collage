/**
 * The controls. They live below the canvas and stay there — PRD §8.1: "tray
 * and controls persistent below, no modal editing". A verb is never a dialog
 * you have to dismiss to see what it did.
 */
import {
  EDGE_STYLES, MATERIALS, PALETTES, SUBSTRATE_STOCKS, SUBSTRATE_TEXTURES,
  type EdgeStyle, type Material, type PaletteId, type SubstrateStockId, type SubstrateTexture,
} from '@collage/shared/constants';
import { orderedLayers, type Layer } from '@collage/shared/version';
import { store } from '../state/store.ts';
import { fragmentStore } from '../render/fragmentStore.ts';
import { estimateLight } from '../verbs/relight.ts';
import { el, clear, chips, slider } from './dom.ts';
import { track, trackFirstChange } from '../lib/metrics.ts';
import type { CanvasSurface } from './canvas.ts';

const PAPER_COLOURS = ['#efe7d7', '#f7f4ec', '#e6dcc4', '#d9d2c2', '#2a2724', '#1d2733', '#f2e3d0', '#cbd6d2'];

type VerbTab = 'edge' | 'material' | 'cut' | 'extend' | 'relight';

export class FragmentPanel {
  readonly el: HTMLElement;
  private tab: VerbTab = 'edge';
  private body: HTMLElement;
  private cutting = false;

  private surface: CanvasSurface;

  constructor(surface: CanvasSurface) {
    this.surface = surface;
    this.body = el('div', { class: 'panel-body' });
    this.el = el('div', { class: 'panel' }, [this.body]);
    store.subscribe(() => this.render());
    this.render();
  }

  private get layer(): Layer | undefined {
    const { comp, selectedId } = store.get();
    return comp.layers.find((l) => l.id === selectedId);
  }

  render(): void {
    const layer = this.layer;
    clear(this.body);
    if (!layer) {
      this.stopCutting();
      this.body.append(el('p', { class: 'hint', text: 'Tap a piece on the canvas to cut, print, light or extend it.' }));
      return;
    }

    this.body.append(
      el('div', { class: 'verb-tabs' },
        (['edge', 'material', 'cut', 'extend', 'relight'] as VerbTab[]).map((t) =>
          el('button', {
            class: `verb-tab${t === this.tab ? ' is-active' : ''}`,
            type: 'button',
            text: t[0]!.toUpperCase() + t.slice(1),
            onclick: () => { this.tab = t; this.render(); },
          }))),
      this.controls(layer),
      this.layerActions(layer),
    );
  }

  private controls(layer: Layer): HTMLElement {
    switch (this.tab) {
      case 'edge': return this.edgeControls(layer);
      case 'material': return this.materialControls(layer);
      case 'cut': return this.cutControls(layer);
      case 'extend': return this.extendControls(layer);
      case 'relight': return this.relightControls(layer);
    }
  }

  // PRD §8.3 — the highest-priority verb gets the plainest control.
  private edgeControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'edge');
    const style = (current?.params['style'] as EdgeStyle) ?? 'clean';
    const roughness = (current?.params['roughness'] as number) ?? 0.5;
    return el('div', { class: 'controls' }, [
      chips(EDGE_STYLES.map((s) => ({ id: s, label: label(s) })), style, (id) => {
        this.apply(layer.id, 'edge', id === 'clean' ? null : { style: id, roughness });
      }),
      style === 'clean' ? null : slider('Roughness', roughness,
        (v) => this.apply(layer.id, 'edge', { style, roughness: v }, false),
        (v) => this.apply(layer.id, 'edge', { style, roughness: v })),
    ]);
  }

  private materialControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'material');
    const material = (current?.params['material'] as Material) ?? 'none';
    const strength = (current?.params['strength'] as number) ?? 1;
    return el('div', { class: 'controls' }, [
      chips(MATERIALS.map((m) => ({ id: m, label: label(m) })), material, (id) => {
        this.apply(layer.id, 'material', id === 'none' ? null : { material: id, strength });
      }),
      material === 'none' ? null : slider('Strength', strength,
        (v) => this.apply(layer.id, 'material', { material, strength: v }, false),
        (v) => this.apply(layer.id, 'material', { material, strength: v })),
    ]);
  }

  private cutControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'cut');
    const tolerance = (current?.params['tolerance'] as number) ?? 0.16;
    const keep = (current?.params['keep'] as boolean) ?? false;
    return el('div', { class: 'controls' }, [
      el('div', { class: 'row' }, [
        el('button', {
          class: `pill${this.cutting ? ' is-active' : ''}`,
          type: 'button',
          text: this.cutting ? 'Tap the part to remove…' : 'Cut a part away',
          onclick: () => (this.cutting ? this.stopCutting() : this.startCutting(layer, tolerance, keep)),
        }),
        current ? el('button', { class: 'pill', type: 'button', text: 'Undo cut', onclick: () => this.apply(layer.id, 'cut', null) }) : null,
      ]),
      current ? slider('Spread', tolerance,
        (v) => this.apply(layer.id, 'cut', { ...current.params, tolerance: v }, false),
        (v) => this.apply(layer.id, 'cut', { ...current.params, tolerance: v }),
        { min: 0.02, max: 0.6 }) : null,
      current ? el('label', { class: 'check' }, [
        (() => {
          const box = el('input', { type: 'checkbox', ...(keep ? { checked: 'checked' } : {}) });
          box.addEventListener('change', () => this.apply(layer.id, 'cut', { ...current.params, keep: box.checked }));
          return box;
        })(),
        el('span', { text: 'Keep that part instead' }),
      ]) : null,
      el('p', { class: 'hint', text: 'No path drawing — tap what should go.' }),
    ]);
  }

  private startCutting(layer: Layer, tolerance: number, keep: boolean): void {
    this.cutting = true;
    this.surface.tapHandler = (cx, cy) => {
      const tr = layer.transform;
      const dx = cx - tr.x, dy = cy - tr.y;
      const cos = Math.cos(-tr.rotation), sin = Math.sin(-tr.rotation);
      const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
      const w = (layer.fragment_ref.w ?? 512) * tr.scale;
      const h = (layer.fragment_ref.h ?? 512) * tr.scale;
      if (Math.abs(lx) > w / 2 || Math.abs(ly) > h / 2) return false;
      this.apply(layer.id, 'cut', {
        mode: 'region',
        x: (lx + w / 2) / w,
        y: (ly + h / 2) / h,
        tolerance,
        keep,
      });
      this.stopCutting();
      return true;
    };
    this.render();
  }

  private stopCutting(): void {
    if (this.surface) this.surface.tapHandler = null;
    if (this.cutting) {
      this.cutting = false;
      queueMicrotask(() => this.render());
    }
  }

  private extendControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'extend');
    const amount = (current?.params['amount'] as number) ?? 0;
    const irregularity = (current?.params['irregularity'] as number) ?? 0.5;
    return el('div', { class: 'controls' }, [
      slider('Past its edge', amount,
        (v) => this.apply(layer.id, 'extend', v < 1 ? null : { amount: v, irregularity }, false),
        (v) => this.apply(layer.id, 'extend', v < 1 ? null : { amount: v, irregularity }),
        { min: 0, max: 90, step: 1 }),
      amount >= 1 ? slider('Wander', irregularity,
        (v) => this.apply(layer.id, 'extend', { amount, irregularity: v }, false),
        (v) => this.apply(layer.id, 'extend', { amount, irregularity: v })) : null,
    ]);
  }

  private relightControls(layer: Layer): HTMLElement {
    const others = orderedLayers(store.comp).filter((l) => l.id !== layer.id);
    const current = store.getVerb(layer.id, 'relight');
    const amount = (current?.params['amount'] as number) ?? 0.7;
    if (!others.length) {
      return el('div', { class: 'controls' }, [el('p', { class: 'hint', text: 'Add another piece, then match this one to its light.' })]);
    }
    return el('div', { class: 'controls' }, [
      el('p', { class: 'hint', text: 'Match this piece to the light of…' }),
      el('div', { class: 'match-row' }, others.map((other) => {
        const thumb = el('img', {
          src: other.fragment_ref.uri ?? '',
          alt: '',
          class: 'match-thumb',
        });
        return el('button', {
          class: 'match', type: 'button',
          onclick: () => this.matchLight(layer, other, amount),
        }, [thumb]);
      })),
      current ? slider('Amount', amount,
        (v) => this.apply(layer.id, 'relight', { ...current.params, amount: v }, false),
        (v) => this.apply(layer.id, 'relight', { ...current.params, amount: v })) : null,
      current ? el('button', { class: 'pill', type: 'button', text: 'Clear', onclick: () => this.apply(layer.id, 'relight', null) }) : null,
    ]);
  }

  /** The light is measured once and stored as numbers, so the record stays
   *  parameters and re-renders identically anywhere (PRD §9). */
  private matchLight(target: Layer, source: Layer, amount: number): void {
    const raster = fragmentStore.raw(source.fragment_ref, 256);
    if (!raster) return;
    const ctx = raster.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.getImageData(0, 0, raster.width, raster.height);
    const light = estimateLight({ data: img.data, width: raster.width, height: raster.height });
    this.apply(target.id, 'relight', {
      dx: round(light.dx), dy: round(light.dy),
      strength: round(light.strength), level: round(light.level),
      amount,
    });
  }

  private layerActions(layer: Layer): HTMLElement {
    return el('div', { class: 'layer-actions' }, [
      el('button', { class: 'pill', type: 'button', text: 'Front', onclick: () => store.reorder(layer.id, 'front') }),
      el('button', { class: 'pill', type: 'button', text: 'Back', onclick: () => store.reorder(layer.id, 'back') }),
      el('button', { class: 'pill', type: 'button', text: 'Flip', onclick: () => store.updateTransform(layer.id, { flipX: !layer.transform.flipX }, { history: true }) }),
      el('button', { class: 'pill', type: 'button', text: 'Remove', onclick: () => store.removeLayer(layer.id) }),
    ]);
  }

  private apply(layerId: string, verb: 'edge' | 'material' | 'cut' | 'extend' | 'relight', params: Record<string, unknown> | null, history = true): void {
    store.setVerb(layerId, verb, params as never, { history });
    if (history) {
      trackFirstChange();
      track('verb_applied', { verb, ...(params ? { detail: String(params['style'] ?? params['material'] ?? params['mode'] ?? '') } : { cleared: true }) });
    }
  }
}

export class PaperPanel {
  readonly el: HTMLElement;

  constructor() {
    this.el = el('div', { class: 'panel' });
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const { substrate, palette } = store.comp;
    clear(this.el);
    this.el.append(el('div', { class: 'panel-body' }, [
      el('p', { class: 'panel-label', text: 'Stock' }),
      chips(SUBSTRATE_STOCKS.map((s) => ({ id: s.id, label: s.name })), substrate.stock,
        (id: SubstrateStockId) => store.setSubstrate({ stock: id })),
      el('p', { class: 'panel-label', text: 'Colour' }),
      el('div', { class: 'swatches' }, PAPER_COLOURS.map((c) =>
        el('button', {
          class: `swatch${c === substrate.colour ? ' is-active' : ''}`,
          type: 'button',
          style: `background:${c}`,
          'aria-label': `Paper ${c}`,
          onclick: () => store.setSubstrate({ colour: c }),
        }))),
      el('p', { class: 'panel-label', text: 'Texture' }),
      chips(SUBSTRATE_TEXTURES.map((t) => ({ id: t, label: label(t) })), substrate.texture,
        (id: SubstrateTexture) => store.setSubstrate({ texture: id })),
      el('p', { class: 'panel-label', text: 'Palette, across everything' }),
      chips(PALETTES.map((p) => ({ id: p.id, label: p.name })), palette,
        (id: PaletteId) => { store.setPalette(id); track('verb_applied', { verb: 'palette', detail: id }); }),
    ]));
  }
}

const label = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
const round = (n: number): number => Math.round(n * 1000) / 1000;
