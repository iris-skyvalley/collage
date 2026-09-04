/**
 * Constraints, not preferences. PRD §5: "Constrain, don't simplify."
 * Anything in this file that looks like it wants to be user-selectable is
 * deliberately not.
 */

/** PRD §6.1 — the piece. 4:5, not user-selectable. */
export const PIECE = { w: 1080, h: 1350 } as const;

/** PRD §6.1 — the story. Background is outpainted from the composition,
 *  never a taller authoring canvas (9:16 is a bad collage frame). */
export const STORY = { w: 1080, h: 1920 } as const;

/** PRD §6.1 — the replay. 9:16, 4–8s, layer-by-layer build. */
export const REPLAY = {
  w: 1080,
  h: 1920,
  fps: 30,
  minMs: 4000,
  maxMs: 8000,
  /** Held on the last frame; the only place a mark appears (§6.3). */
  outroMs: 1200,
} as const;

/** PRD §8.1 — hard cap. Forces composition, keeps the replay watchable,
 *  bounds render cost. Not a soft warning. */
export const MAX_LAYERS = 20;

/** PRD §8.2 — a tray is themed and finite. Not a search box. */
export const TRAY_TARGET = { min: 40, max: 80 } as const;

export const THEMES = [
  { id: 'herbarium', name: 'Herbarium', blurb: 'Pressed plants, plates, specimen tags' },
  { id: 'cartography', name: 'Cartography', blurb: 'Coastlines, contours, compass roses' },
  { id: 'ephemera', name: 'Ephemera', blurb: 'Tickets, stamps, tape, torn pages' },
  { id: 'typography', name: 'Type Specimen', blurb: 'Letterforms, rules, wood type' },
  { id: 'cosmos', name: 'Cosmos', blurb: 'Planets, orbits, satellite tiles' },
  { id: 'marginalia', name: 'Marginalia', blurb: 'Hands, arrows, blots, ribbons' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const THEME_IDS = THEMES.map((t) => t.id) as ThemeId[];
export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as string[]).includes(v);

/** PRD §8.1 — substrate is a first-class choice, not a background afterthought. */
export const SUBSTRATE_STOCKS = [
  { id: 'cartridge', name: 'Cartridge', tooth: 0.55, fibre: 0.35 },
  { id: 'newsprint', name: 'Newsprint', tooth: 0.3, fibre: 0.7 },
  { id: 'kraft', name: 'Kraft', tooth: 0.7, fibre: 0.6 },
  { id: 'vellum', name: 'Vellum', tooth: 0.12, fibre: 0.15 },
  { id: 'blotter', name: 'Blotter', tooth: 0.85, fibre: 0.5 },
  { id: 'board', name: 'Grey board', tooth: 0.65, fibre: 0.8 },
] as const;
export type SubstrateStockId = (typeof SUBSTRATE_STOCKS)[number]['id'];

export const SUBSTRATE_TEXTURES = ['smooth', 'laid', 'grain', 'speckle', 'foxed'] as const;
export type SubstrateTexture = (typeof SUBSTRATE_TEXTURES)[number];

/** PRD §8.3 — the verb set. Bounded on purpose. No prompt field in v1. */
export const VERBS = ['edge', 'material', 'cut', 'extend', 'relight', 'palette'] as const;
export type VerbName = (typeof VERBS)[number];

/** PRD §8.3 — "Edge is the highest-priority verb." */
export const EDGE_STYLES = ['clean', 'cut', 'torn', 'scissor', 'deckle', 'burnt'] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];

export const MATERIALS = [
  'none', 'newsprint', 'riso', 'halftone', 'photocopy', 'textile', 'satellite',
] as const;
export type Material = (typeof MATERIALS)[number];

/** PRD §8.3 — palette applies across all fragments at once, so it lives on
 *  the document rather than on a layer. */
export const PALETTES = [
  { id: 'none', name: 'As found', ramp: [] as string[] },
  { id: 'foxed', name: 'Foxed', ramp: ['#2b2118', '#7a5b3d', '#c39b6f', '#e8d5b7', '#faf3e6'] },
  { id: 'riso-duo', name: 'Riso duo', ramp: ['#1c1b3a', '#3b3ba0', '#e8437d', '#ffa3c0', '#fff4e6'] },
  { id: 'botanic', name: 'Botanic', ramp: ['#1d2b1f', '#3f5d3a', '#7d9a63', '#c2cf9b', '#f2f0e0'] },
  { id: 'cyanotype', name: 'Cyanotype', ramp: ['#08161f', '#123a5c', '#2f7ba8', '#8fc4d9', '#e7f2f5'] },
  { id: 'ashfall', name: 'Ashfall', ramp: ['#141414', '#3d3d3f', '#77777a', '#b6b6b8', '#efeeea'] },
  { id: 'orchard', name: 'Orchard', ramp: ['#2a1206', '#8c2f0d', '#d9701e', '#f0b95c', '#fdf1d8'] },
] as const;
export type PaletteId = (typeof PALETTES)[number]['id'];

/** PRD §10 — anonymous + generative means every session spends money with no
 *  identity to bill. These are enforced server-side, per session AND per IP. */
export const CAPS = {
  generationsPerSessionPerDay: 60,
  generationsPerIpPerHour: 120,
  uploadsPerSessionPerDay: 40,
  versionsPerSessionPerHour: 40,
  maxUploadBytes: 8 * 1024 * 1024,
  maxRenderBytes: 12 * 1024 * 1024,
} as const;

/** PRD §11 — metrics. Segmented by entry path, always. */
export const ENTRY_PATHS = ['cold', 'link'] as const;
export type EntryPath = (typeof ENTRY_PATHS)[number];
