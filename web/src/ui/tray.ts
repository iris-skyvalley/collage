/** The tray strip: themed, finite, always populated. */
import { MAX_LAYERS, PALETTES, THEMES, type PaletteId, type ThemeId } from '@collage/shared/constants';
import type { FragmentRef } from '@collage/shared/version';
import { store } from '../state/store.ts';
import { el, clear, chips } from './dom.ts';
import { loadTray, moreLikeThis } from '../tray/catalogue.ts';
import type { TrayItem } from '../lib/api.ts';
import { track, trackFirstChange } from '../lib/metrics.ts';
import { importPhoto } from './importPhoto.ts';

export class Tray {
  readonly el: HTMLElement;
  private strip: HTMLElement;
  private themes: HTMLElement;
  private palette: HTMLElement;
  private items: TrayItem[] = [];
  private variantSalt = new Map<string, number>();

  private onPlaced: () => void;

  constructor(onPlaced: () => void) {
    this.onPlaced = onPlaced;
    this.strip = el('div', { class: 'tray-strip', role: 'list' });
    // The theme switcher is present but not required (PRD §7.1), and it lives
    // with the tray it changes rather than in the tab bar.
    this.themes = el('div', { class: 'theme-switch' });
    // PRD §8.3 — palette applies across all fragments at once, so it sits
    // with the tray that supplies them rather than with any one piece.
    this.palette = el('div', { class: 'palette-row' });
    this.el = el('div', { class: 'tray' }, [this.themes, this.strip, this.palette]);
    this.renderThemes();
    this.renderPalette();
    store.subscribe(() => this.renderPalette());
    void this.load(store.comp.theme);
  }

  private renderThemes(): void {
    clear(this.themes);
    this.themes.append(chips(THEMES.map((t) => ({ id: t.id, label: t.name })), store.comp.theme, (id: ThemeId) => {
      store.setTheme(id);
      void this.load(id);
      this.renderThemes();
    }));
  }

  private renderPalette(): void {
    clear(this.palette);
    this.palette.append(
      el('span', { class: 'palette-label', text: 'Palette' }),
      chips(PALETTES.map((p) => ({ id: p.id, label: p.name })), store.comp.palette, (id: PaletteId) => {
        store.setPalette(id);
        track('verb_applied', { verb: 'palette', detail: id });
      }),
    );
  }

  async load(theme: ThemeId): Promise<void> {
    this.strip.setAttribute('aria-busy', 'true');
    this.items = await loadTray(theme);
    this.render();
    this.strip.removeAttribute('aria-busy');
    track('tray_source', { theme, count: this.items.length });
  }

  private render(): void {
    clear(this.strip);
    for (const item of this.items) this.strip.append(this.cell(item));
    // A photo is a fragment like any other, so it is offered where the
    // fragments are: the last tile in the grid.
    this.strip.append(el('button', {
      class: 'tray-add',
      type: 'button',
      text: 'your photo',
      onclick: () => this.pickPhoto(),
    }));
  }

  private cell(item: TrayItem): HTMLElement {
    const img = el('img', { src: item.thumb ?? item.uri, alt: item.name, loading: 'lazy', decoding: 'async', draggable: 'false' });
    const button = el('button', {
      class: 'tray-item',
      type: 'button',
      role: 'listitem',
      title: item.credit ? `${item.name} — ${item.credit.collection}` : item.name,
      onclick: () => this.place(item),
    }, [img]);

    const more = el('button', {
      class: 'tray-more',
      type: 'button',
      title: 'More like this',
      'aria-label': `More like ${item.name}`,
      text: '+',
      onclick: async (e: Event) => {
        e.stopPropagation();
        const salt = (this.variantSalt.get(item.id) ?? 0) + 1;
        this.variantSalt.set(item.id, salt);
        const variants = await moreLikeThis(item, salt);
        const at = this.items.indexOf(item);
        this.items.splice(at + 1, 0, ...variants);
        this.render();
        this.strip.children[at + 1]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        track('tray_source', { action: 'more_like_this', family: item.family });
      },
    });

    return el('div', { class: 'tray-cell' }, [button, more]);
  }

  private place(item: TrayItem): void {
    const ref: FragmentRef = {
      source: item.source === 'archive' ? 'archive' : 'generated',
      id: item.id,
      uri: item.uri,
      w: item.w,
      h: item.h,
      ...(item.credit ? { credit: item.credit } : {}),
    };
    const layer = store.addLayer(ref);
    if (!layer) {
      this.flashCap();
      return;
    }
    trackFirstChange();
    track('layer_count', { count: store.comp.layers.length });
    this.onPlaced();
  }

  private async pickPhoto(): Promise<void> {
    const ref = await importPhoto();
    if (!ref) return;
    if (!store.addLayer(ref)) { this.flashCap(); return; }
    trackFirstChange();
    this.onPlaced();
  }

  private flashCap(): void {
    this.el.dispatchEvent(new CustomEvent('tray:full', { bubbles: true, detail: { max: MAX_LAYERS } }));
  }

  static themeOptions(): { id: ThemeId; label: string }[] {
    return THEMES.map((t) => ({ id: t.id, label: t.name }));
  }
}
