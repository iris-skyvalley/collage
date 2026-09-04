/**
 * The two entry points (PRD §5, §7).
 *
 * "Never a blank tray — but a blank canvas is fine for the people who came
 * looking." Someone who navigated here self-selected as a maker and gets the
 * empty frame with the tray already full: no modal, no onboarding, no template
 * gallery. Someone who arrived on a link was conscripted and didn't ask to
 * create, so they get the sender's finished piece with the knobs already live,
 * and their first act is a nudge rather than a first mark.
 *
 * Downstream of that the two paths are identical, which is why link arrival
 * differs in exactly one stored field: parent_id.
 */
import { MAX_LAYERS } from '@collage/shared/constants';
import { parseComposition, type Composition } from '@collage/shared/version';
import { store, Store } from '../state/store.ts';
import { hydrateUploads } from '../tray/uploads.ts';
import { api } from '../lib/api.ts';
import { setEntryPath, track } from '../lib/metrics.ts';
import { CanvasSurface } from './canvas.ts';
import { Tray } from './tray.ts';
import { FragmentPanel, PaperPanel } from './panels.ts';
import { ExportSheet } from './exportSheet.ts';
import { el, clear } from './dom.ts';

type Tab = 'tray' | 'fragment' | 'paper';

export class App {
  private surface!: CanvasSurface;
  private tray!: Tray;
  private fragmentPanel!: FragmentPanel;
  private paperPanel!: PaperPanel;
  private exportSheet!: ExportSheet;
  private tabsEl!: HTMLElement;
  private panelHost!: HTMLElement;
  private headerRight!: HTMLElement;
  private tab: Tab = 'tray';
  private banner!: HTMLElement;

  async mount(root: HTMLElement): Promise<void> {
    const stage = el('div', { class: 'stage' });
    this.banner = el('div', { class: 'banner', hidden: true });
    this.headerRight = el('div', { class: 'header-right' });
    this.tabsEl = el('div', { class: 'tabs', role: 'tablist' });
    this.panelHost = el('div', { class: 'panel-host' });

    root.append(
      el('header', { class: 'header' }, [
        el('div', { class: 'brand', text: 'collage' }),
        this.headerRight,
      ]),
      this.banner,
      stage,
      el('div', { class: 'dock' }, [this.tabsEl, this.panelHost]),
    );

    this.surface = new CanvasSurface(stage);
    // Metric 1's denominator (PRD §11): sessions that touch the canvas.
    this.surface.el.addEventListener('pointerdown', () => track('canvas_touched'), { once: true });
    this.exportSheet = new ExportSheet();
    root.append(this.exportSheet.el);

    this.tray = new Tray(() => this.setTab('fragment'));
    this.fragmentPanel = new FragmentPanel(this.surface);
    this.paperPanel = new PaperPanel();

    root.addEventListener('tray:full', () => {
      this.flash(`${MAX_LAYERS} pieces is the cap. Take something off to add something new.`);
    });

    let lastSelected: string | null = null;
    store.subscribe((s) => {
      // Selecting a piece brings its knobs up; letting go returns the tray.
      if (s.selectedId !== lastSelected) {
        lastSelected = s.selectedId;
        this.setTab(s.selectedId ? 'fragment' : 'tray');
      }
      this.renderHeader();
    });

    await this.route();
    this.renderTabs();
    this.renderHeader();
    this.setTab(this.tab);
    track('session_start', { entry: store.get().entry });
  }

  // --- entry points ---------------------------------------------------------

  private async route(): Promise<void> {
    const match = /^\/v\/([A-Za-z0-9]+)/.exec(location.pathname);
    if (match) {
      await this.linkArrival(match[1]!);
      return;
    }
    this.coldArrival();
  }

  /** PRD §7.1 — empty canvas, substrate pre-selected, themed tray already
   *  populated. No modal, no onboarding, no template gallery. */
  private coldArrival(): void {
    setEntryPath('cold');
    const draft = Store.loadLocal();
    if (draft?.comp.layers.length) {
      store.replaceComposition(draft.comp, {
        entry: draft.entry,
        sourceVersionId: draft.sourceVersionId,
        savedVersionId: draft.savedVersionId,
      });
      void hydrateUploads(draft.comp.layers.filter((l) => l.fragment_ref.source === 'upload').map((l) => l.fragment_ref.id));
      this.flash('Picked up where you left off.', 3200);
    }
    void this.tray.load(store.comp.theme);
  }

  /**
   * PRD §7.2 — land on their piece, rendered and attributed, controls live.
   * "Not a viewer with an edit button — the knobs are already there."
   */
  private async linkArrival(id: string): Promise<void> {
    setEntryPath('link');
    track('link_opened', {}, id);
    try {
      const { version } = await api.getVersion(id);
      const comp: Composition = parseComposition({
        theme: version.theme,
        substrate: version.substrate,
        palette: version.palette,
        layers: version.layers,
        recipient: version.recipient ?? null,
        // The one difference between the two paths in what gets stored.
        parent_id: version.id,
        root_id: version.root_id ?? version.id,
      });
      store.replaceComposition(comp, {
        entry: 'link',
        sourceVersionId: version.id,
        sourceAuthor: version.created_by,
        savedVersionId: null,
      });
      await this.tray.load(version.theme);
      this.flash('Someone sent you this. Change anything — it stays theirs and becomes yours.', 6000);
    } catch {
      this.flash('That piece could not be found. Here is a blank one.', 5000);
      setEntryPath('cold');
      store.replaceComposition(store.comp, { entry: 'cold' });
      void this.tray.load(store.comp.theme);
    }
  }

  // --- chrome ---------------------------------------------------------------

  private renderHeader(): void {
    const { comp, entry } = store.get();
    clear(this.headerRight);
    this.headerRight.append(
      el('span', { class: 'count', text: `${comp.layers.length}/${MAX_LAYERS}` }),
      el('button', { class: 'icon', type: 'button', 'aria-label': 'Undo', text: '↶', disabled: !store.canUndo(), onclick: () => store.undo() }),
      el('button', { class: 'icon', type: 'button', 'aria-label': 'Redo', text: '↷', disabled: !store.canRedo(), onclick: () => store.redo() }),
      el('button', {
        class: 'pill pill-primary',
        type: 'button',
        text: entry === 'link' ? 'Send yours' : 'Export',
        onclick: () => void this.exportSheet.show(),
      }),
    );
  }

  private renderTabs(): void {
    clear(this.tabsEl);
    const tabs: { id: Tab; label: string }[] = [
      { id: 'tray', label: 'Tray' },
      { id: 'fragment', label: 'Piece' },
      { id: 'paper', label: 'Paper' },
    ];
    for (const t of tabs) {
      this.tabsEl.append(el('button', {
        class: `tab${t.id === this.tab ? ' is-active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': t.id === this.tab,
        text: t.label,
        onclick: () => this.setTab(t.id),
      }));
    }
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    clear(this.panelHost);
    this.panelHost.append(
      tab === 'tray' ? this.tray.el : tab === 'fragment' ? this.fragmentPanel.el : this.paperPanel.el,
    );
    if (tab === 'fragment') this.fragmentPanel.render();
    this.renderTabs();
  }

  private flash(message: string, ms = 4200): void {
    this.banner.textContent = message;
    this.banner.hidden = false;
    clearTimeout((this.banner as HTMLElement & { _t?: number })._t);
    (this.banner as HTMLElement & { _t?: number })._t = setTimeout(() => { this.banner.hidden = true; }, ms) as unknown as number;
  }
}
