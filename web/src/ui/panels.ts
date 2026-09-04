/**
 * The controls. They live below the canvas and stay there — PRD §8.1: "tray
 * and controls persistent below, no modal editing". A verb is never a dialog
 * you have to dismiss to see what it did.
 */
import { EDGE_STYLES, type EdgeStyle } from '@collage/shared/constants';
import type { Layer } from '@collage/shared/version';
import { store } from '../state/store.ts';
import { el, clear, chips, slider } from './dom.ts';
import { track, trackFirstChange } from '../lib/metrics.ts';

export class FragmentPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  /** True while a slider is being dragged. The store changes on every tick,
   *  and rebuilding the panel would replace the slider under the pointer. */
  private sliding = false;

  constructor() {
    this.body = el('div', { class: 'panel-body' });
    this.el = el('div', { class: 'panel' }, [this.body]);
    store.subscribe(() => { if (!this.sliding) this.render(); });
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
    // One row. Edge is the verb the PRD builds its craft argument on; the
    // others stay in the model and render on any piece that carries them,
    // but the editor offers only this.
    this.body.append(this.edgeControls(layer), this.layerActions(layer));
  }

  /** A verb's row: its options, and anything more beneath. With one verb in
   *  the editor the row needs no name — the options say what they are. */
  private row(label: string, options: HTMLElement | null, below: (HTMLElement | null)[] = []): HTMLElement {
    return el('div', { class: 'verb-row' }, [
      el('div', { class: 'verb-line' }, [label ? el('span', { class: 'verb-label', text: label }) : null, options]),
      ...below,
    ]);
  }

  private edgeControls(layer: Layer): HTMLElement {
    const current = store.getVerb(layer.id, 'edge');
    const style = (current?.params['style'] as EdgeStyle) ?? 'clean';
    const roughness = (current?.params['roughness'] as number) ?? 0.5;
    return this.row('',
      chips(EDGE_STYLES.map((s) => ({ id: s, label: label(s) })), style, (id) => {
        this.apply(layer.id, 'edge', id === 'clean' ? null : { style: id, roughness });
      }),
      [style === 'clean' ? null : slider('Roughness', roughness,
        (v) => { this.sliding = true; this.apply(layer.id, 'edge', { style, roughness: v }, false); },
        (v) => { this.sliding = false; this.apply(layer.id, 'edge', { style, roughness: v }); })],
    );
  }

  private layerActions(layer: Layer): HTMLElement {
    return el('div', { class: 'layer-actions' }, [
      el('button', { class: 'pill', type: 'button', text: 'Front', onclick: () => store.reorder(layer.id, 'front') }),
      el('button', { class: 'pill', type: 'button', text: 'Back', onclick: () => store.reorder(layer.id, 'back') }),
      el('button', { class: 'pill', type: 'button', text: 'Flip', onclick: () => store.updateTransform(layer.id, { flipX: !layer.transform.flipX }, { history: true }) }),
      el('button', { class: 'pill pill-tray', type: 'button', text: 'Tray', onclick: () => store.select(null) }),
    ]);
  }

  private apply(layerId: string, verb: 'edge', params: Record<string, unknown> | null, history = true): void {
    store.setVerb(layerId, verb, params as never, { history });
    if (history) {
      trackFirstChange();
      track('verb_applied', { verb, ...(params ? { detail: String(params['style'] ?? '') } : { cleared: true }) });
    }
  }
}

const label = (s: string): string => s[0]!.toUpperCase() + s.slice(1);
