/**
 * The controls. They live below the canvas and stay there — PRD §8.1: "tray
 * and controls persistent below, no modal editing". A verb is never a dialog
 * you have to dismiss to see what it did.
 */
import { EDGE_STYLES, type EdgeStyle, type Material } from '@collage/shared/constants';
import type { Layer } from '@collage/shared/version';
import { store } from '../state/store.ts';
import { el, clear, chips, slider } from './dom.ts';
import { track, trackFirstChange } from '../lib/metrics.ts';

/**
 * The materials offered. The full set stays in the model and renders on any
 * piece that carries it; these three are the ones that read as distinct
 * things at phone scale — screened grey, two misregistered inks, and a
 * blown-out photocopy — rather than as variations on a screen.
 */
const OFFERED_MATERIALS: Material[] = ['none', 'newsprint', 'riso', 'photocopy'];

export class FragmentPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor() {
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
    if (!layer) return;
    // Two rows, no tabs above and none within. Edge is the PRD's first
    // priority and material its second; cut, extend and relight stay in the
    // model but leave the editor until there is a model behind them.
    this.body.append(
      this.edgeControls(layer),
      this.materialControls(layer),
      this.layerActions(layer),
    );
  }

  /** A verb's row: its name, then its options; anything more sits beneath. */
  private row(label: string, options: HTMLElement | null, below: (HTMLElement | null)[] = []): HTMLElement {
    return el('div', { class: 'verb-row' }, [
      el('div', { class: 'verb-line' }, [el('span', { class: 'verb-label', text: label }), options]),
      ...below,
    ]);
  }

  private edgeControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'edge');
    const style = (current?.params['style'] as EdgeStyle) ?? 'clean';
    const roughness = (current?.params['roughness'] as number) ?? 0.5;
    return this.row('Edge',
      chips(EDGE_STYLES.map((s) => ({ id: s, label: label(s) })), style, (id) => {
        this.apply(layer.id, 'edge', id === 'clean' ? null : { style: id, roughness });
      }),
      [style === 'clean' ? null : slider('Roughness', roughness,
        (v) => this.apply(layer.id, 'edge', { style, roughness: v }, false),
        (v) => this.apply(layer.id, 'edge', { style, roughness: v }))],
    );
  }

  private materialControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'material');
    const material = (current?.params['material'] as Material) ?? 'none';
    const strength = (current?.params['strength'] as number) ?? 1;
    return this.row('Material',
      chips(OFFERED_MATERIALS.map((m) => ({ id: m, label: label(m) })), material, (id) => {
        this.apply(layer.id, 'material', id === 'none' ? null : { material: id, strength });
      }),
      [material === 'none' ? null : slider('Strength', strength,
        (v) => this.apply(layer.id, 'material', { material, strength: v }, false),
        (v) => this.apply(layer.id, 'material', { material, strength: v }))],
    );
  }

  private layerActions(layer: Layer): HTMLElement {
    return el('div', { class: 'layer-actions' }, [
      el('button', { class: 'pill', type: 'button', text: 'Front', onclick: () => store.reorder(layer.id, 'front') }),
      el('button', { class: 'pill', type: 'button', text: 'Back', onclick: () => store.reorder(layer.id, 'back') }),
      el('button', { class: 'pill', type: 'button', text: 'Flip', onclick: () => store.updateTransform(layer.id, { flipX: !layer.transform.flipX }, { history: true }) }),
      el('button', { class: 'pill', type: 'button', text: 'Remove', onclick: () => store.removeLayer(layer.id) }),
      el('button', { class: 'pill pill-tray', type: 'button', text: 'Tray', onclick: () => store.select(null) }),
    ]);
  }

  private apply(layerId: string, verb: 'edge' | 'material', params: Record<string, unknown> | null, history = true): void {
    store.setVerb(layerId, verb, params as never, { history });
    if (history) {
      trackFirstChange();
      track('verb_applied', { verb, ...(params ? { detail: String(params['style'] ?? params['material'] ?? params['mode'] ?? '') } : { cleared: true }) });
    }
  }
}

const label = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
