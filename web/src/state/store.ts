/**
 * The editor's state, and the autosave that makes "claim this" act on
 * something that already exists (PRD §7.3).
 *
 * The composition here is the same shape that gets persisted as a Version, so
 * there is no translation step between what the editor holds and what the riff
 * layer will one day read.
 */
import { MAX_LAYERS, PALETTES, PIECE, type EntryPath, type PaletteId, type ThemeId } from '@collage/shared/constants';
import { emptyComposition, type AppliedVerb, type Composition, type FragmentRef, type Layer, type VerbName } from '@collage/shared/version';
import { shortId } from '@collage/shared/id';

export interface StoreState {
  comp: Composition;
  selectedId: string | null;
  entry: EntryPath;
  /** The version this session started from, if any. Becomes parent_id. */
  sourceVersionId: string | null;
  sourceAuthor: string | null;
  /** Set once the composition has been persisted. */
  savedVersionId: string | null;
  dirty: boolean;
  /** Wall-clock start, so layer timings are relative to the session. */
  startedAt: number;
}

type Listener = (s: StoreState) => void;

const LOCAL_KEY = 'collage.draft.v1';

export class Store {
  private state: StoreState;
  private listeners = new Set<Listener>();
  private past: Composition[] = [];
  private future: Composition[] = [];
  private saveTimer: number | undefined;

  constructor(initial?: Partial<StoreState>) {
    this.state = {
      comp: emptyComposition(),
      selectedId: null,
      entry: 'cold',
      sourceVersionId: null,
      sourceAuthor: null,
      savedVersionId: null,
      dirty: false,
      startedAt: Date.now(),
      ...initial,
    };
  }

  get(): StoreState { return this.state; }
  get comp(): Composition { return this.state.comp; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  private set(patch: Partial<StoreState>, opts: { history?: boolean } = {}): void {
    if (opts.history) {
      this.past.push(structuredClone(this.state.comp));
      if (this.past.length > 60) this.past.shift();
      this.future.length = 0;
    }
    this.state = { ...this.state, ...patch };
    this.emit();
    if (patch.comp) this.scheduleSave();
  }

  // --- composition edits ----------------------------------------------------

  /** PRD §8.1 — the layer cap is hard. Returns null when the piece is full. */
  addLayer(ref: FragmentRef, at?: { x: number; y: number }): Layer | null {
    const comp = this.state.comp;
    if (comp.layers.length >= MAX_LAYERS) return null;
    const topZ = comp.layers.reduce((m, l) => Math.max(m, l.transform.z), -1);
    const natural = Math.max(ref.w ?? 512, ref.h ?? 512);
    // Land at a size that reads on a phone without swallowing the frame.
    const scale = (PIECE.w * 0.42) / natural;
    // And land beside what is already down. Stacking every tapped fragment on
    // the exact centre hides the piece under itself, which is the difference
    // between the tray feeling like a pile and feeling like a table.
    const spot = at ?? scatter(comp.layers.length);
    const layer: Layer = {
      id: shortId(8),
      fragment_ref: ref,
      transform: {
        x: spot.x,
        y: spot.y,
        scale,
        rotation: (Math.random() - 0.5) * 0.16,
        z: topZ + 1,
      },
      verbs: [],
      placed_at_ms: Date.now() - this.state.startedAt,
    };
    this.set({ comp: { ...comp, layers: [...comp.layers, layer] }, selectedId: layer.id, dirty: true }, { history: true });
    return layer;
  }

  removeLayer(id: string): void {
    const comp = this.state.comp;
    this.set({
      comp: { ...comp, layers: comp.layers.filter((l) => l.id !== id) },
      selectedId: this.state.selectedId === id ? null : this.state.selectedId,
      dirty: true,
    }, { history: true });
  }

  /** Transform changes during a gesture are not each an undo step. */
  updateTransform(id: string, patch: Partial<Layer['transform']>, opts: { history?: boolean } = {}): void {
    const comp = this.state.comp;
    this.set({
      comp: {
        ...comp,
        layers: comp.layers.map((l) => (l.id === id ? { ...l, transform: { ...l.transform, ...patch } } : l)),
      },
      dirty: true,
    }, opts);
  }

  reorder(id: string, direction: 'front' | 'back' | 'up' | 'down'): void {
    const comp = this.state.comp;
    const sorted = [...comp.layers].sort((a, b) => a.transform.z - b.transform.z);
    const idx = sorted.findIndex((l) => l.id === id);
    if (idx < 0) return;
    let target = idx;
    if (direction === 'front') target = sorted.length - 1;
    else if (direction === 'back') target = 0;
    else if (direction === 'up') target = Math.min(sorted.length - 1, idx + 1);
    else target = Math.max(0, idx - 1);
    if (target === idx) return;
    const [moved] = sorted.splice(idx, 1);
    sorted.splice(target, 0, moved!);
    // z values must stay distinct — layer order is part of the contract.
    const layers = sorted.map((l, i) => ({ ...l, transform: { ...l.transform, z: i } }));
    this.set({ comp: { ...comp, layers }, dirty: true }, { history: true });
  }

  setVerb(layerId: string, verb: VerbName, params: AppliedVerb['params'] | null, opts: { history?: boolean } = { history: true }): void {
    const comp = this.state.comp;
    this.set({
      comp: {
        ...comp,
        layers: comp.layers.map((l) => {
          if (l.id !== layerId) return l;
          const rest = l.verbs.filter((v) => v.verb !== verb);
          return { ...l, verbs: params === null ? rest : [...rest, { verb, params }] };
        }),
      },
      dirty: true,
    }, opts);
  }

  getVerb(layerId: string, verb: VerbName): AppliedVerb | undefined {
    return this.state.comp.layers.find((l) => l.id === layerId)?.verbs.find((v) => v.verb === verb);
  }

  setSubstrate(patch: Partial<Composition['substrate']>): void {
    this.set({ comp: { ...this.state.comp, substrate: { ...this.state.comp.substrate, ...patch } }, dirty: true }, { history: true });
  }

  setPalette(id: PaletteId): void {
    this.set({ comp: { ...this.state.comp, palette: id }, dirty: true }, { history: true });
  }

  setTheme(theme: ThemeId): void {
    this.set({ comp: { ...this.state.comp, theme }, dirty: true }, { history: true });
  }

  select(id: string | null): void {
    if (id === this.state.selectedId) return;
    this.set({ selectedId: id });
  }

  replaceComposition(comp: Composition, patch: Partial<StoreState> = {}): void {
    this.past.length = 0;
    this.future.length = 0;
    this.set({ comp, ...patch });
  }

  markSaved(versionId: string): void {
    this.set({ savedVersionId: versionId, dirty: false });
  }

  // --- history --------------------------------------------------------------

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(structuredClone(this.state.comp));
    this.state = { ...this.state, comp: prev, dirty: true };
    this.emit();
    this.scheduleSave();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(structuredClone(this.state.comp));
    this.state = { ...this.state, comp: next, dirty: true };
    this.emit();
    this.scheduleSave();
  }

  // --- device-scoped persistence -------------------------------------------
  //
  // PRD §7.3: "Auto-save to device-scoped anonymous session from the first
  // action. Nothing is ever lost, and 'claim this' acts on an object that
  // already exists."

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveLocal(), 400) as unknown as number;
  }

  saveLocal(): void {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({
        comp: this.state.comp,
        sourceVersionId: this.state.sourceVersionId,
        savedVersionId: this.state.savedVersionId,
        entry: this.state.entry,
        at: Date.now(),
      }));
    } catch {
      // A full or blocked store must never break composing.
    }
  }

  static loadLocal(): { comp: Composition; sourceVersionId: string | null; savedVersionId: string | null; entry: EntryPath } | null {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { comp?: Composition; sourceVersionId?: string | null; savedVersionId?: string | null; entry?: EntryPath };
      if (!parsed.comp?.layers) return null;
      return {
        comp: parsed.comp,
        sourceVersionId: parsed.sourceVersionId ?? null,
        savedVersionId: parsed.savedVersionId ?? null,
        entry: parsed.entry ?? 'cold',
      };
    } catch {
      return null;
    }
  }

  static clearLocal(): void {
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
  }
}

/** A golden-angle spiral out from the centre: even coverage, no repetition,
 *  and the first few land close enough to still read as one composition. */
function scatter(index: number): { x: number; y: number } {
  if (index === 0) return { x: PIECE.w / 2, y: PIECE.h / 2 };
  const golden = 2.399963;
  const radius = Math.sqrt(index) * PIECE.w * 0.16;
  const angle = index * golden;
  const margin = PIECE.w * 0.16;
  return {
    x: clamp(PIECE.w / 2 + Math.cos(angle) * radius, margin, PIECE.w - margin),
    y: clamp(PIECE.h / 2 + Math.sin(angle) * radius * 1.1, margin, PIECE.h - margin),
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const paletteRamp = (id: PaletteId): string[] =>
  [...(PALETTES.find((p) => p.id === id)?.ramp ?? [])];

export const store = new Store();
