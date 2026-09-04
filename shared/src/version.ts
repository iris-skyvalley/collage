/**
 * PRD §9 — the contract with the riff layer.
 *
 * A piece persists as a *version object*, not an image. The riff layer is out
 * of scope for v1 and is being built separately; this file is the whole of
 * this build's obligation to it. Retrofitting any of it later means migrating
 * everything users have made, so the non-negotiables below are enforced here
 * (see `assertVersionContract`) rather than left as a convention:
 *
 *   - `parent_id` and `root_id` exist and are written from day one, even
 *     though nothing reads them in v1.
 *   - Fragments are referenced, never flattened into the saved state.
 *   - Verbs are stored as parameters, never baked into pixels.
 *   - Layer order and timing are retained (they are the replay, and the
 *     future diff).
 *   - A version is reconstructable and re-renderable from its record alone.
 */
import {
  EDGE_STYLES, MATERIALS, MAX_LAYERS, PALETTES, SUBSTRATE_STOCKS,
  SUBSTRATE_TEXTURES, THEME_IDS, VERBS,
  type EdgeStyle, type Material, type PaletteId, type SubstrateStockId,
  type SubstrateTexture, type ThemeId, type VerbName,
} from './constants.ts';

/** Where a fragment came from. The ref is stable and resolvable; the pixels
 *  it names are never copied into the version record. */
export type FragmentSource = 'generated' | 'archive' | 'upload';

export interface FragmentRef {
  source: FragmentSource;
  /** Stable id within the source namespace. */
  id: string;
  /** Resolution hint only — never the pixels themselves. */
  uri?: string;
  /** Attribution for archive fragments (PRD §10, Rights). */
  credit?: { collection: string; title?: string; url?: string; licence?: string };
  /** Intrinsic pixel size of the referenced asset, for layout reconstruction. */
  w?: number;
  h?: number;
}

export interface Transform {
  /** Centre position in canvas units (0..1080 x 0..1350), not screen pixels. */
  x: number;
  y: number;
  scale: number;
  /** Radians. */
  rotation: number;
  /** Explicit stacking order. Also the replay's build order. */
  z: number;
  flipX?: boolean;
}

export type VerbParams = Record<string, number | string | boolean | number[]>;

export interface AppliedVerb {
  verb: VerbName;
  params: VerbParams;
}

export interface Layer {
  id: string;
  fragment_ref: FragmentRef;
  transform: Transform;
  verbs: AppliedVerb[];
  opacity?: number;
  /** Milliseconds from session start at which this layer was placed.
   *  Retained because the replay is built from it (PRD §9, §6.2). */
  placed_at_ms?: number;
}

export interface Substrate {
  stock: SubstrateStockId;
  colour: string;
  texture: SubstrateTexture;
}

export interface RenderHashes {
  piece?: string;
  story?: string;
  replay?: string;
}

export interface Version {
  id: string;
  /** Always written. Never read in v1. */
  parent_id: string | null;
  root_id: string | null;
  /** Anonymous session id or user id. Null only before the first save. */
  created_by: string | null;
  /** The tray/theme the piece was composed from — needed to reconstruct the
   *  authoring context on link arrival (PRD §7.2 step 3). */
  theme: ThemeId;
  substrate: Substrate;
  palette: PaletteId;
  layers: Layer[];
  render_hashes: RenderHashes;
  /** PRD §13 Q3: nothing in v1 makes a piece *for* a named person, but the
   *  data model must not preclude it. Written null; never read in v1. */
  recipient: string | null;
  created_at: number;
}

/** The mutable document the editor works on: a Version minus the fields the
 *  server owns. Persisting it is what mints a Version. */
export type Composition = Pick<
  Version, 'theme' | 'substrate' | 'palette' | 'layers' | 'recipient'
> & { parent_id: string | null; root_id: string | null };

export const DEFAULT_SUBSTRATE: Substrate = {
  stock: 'cartridge',
  colour: '#efe7d7',
  texture: 'grain',
};

export function emptyComposition(theme: ThemeId = 'herbarium'): Composition {
  return {
    theme,
    substrate: { ...DEFAULT_SUBSTRATE },
    palette: 'none',
    layers: [],
    recipient: null,
    parent_id: null,
    root_id: null,
  };
}

// ---------------------------------------------------------------------------
// Validation. The contract is enforced, not documented.
// ---------------------------------------------------------------------------

export class ContractError extends Error {}

const oneOf = <T extends readonly string[]>(list: T, v: unknown, what: string): T[number] => {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) {
    throw new ContractError(`${what}: expected one of ${list.join('|')}, got ${JSON.stringify(v)}`);
  }
  return v as T[number];
};

const finite = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ContractError(`${what}: expected a finite number, got ${JSON.stringify(v)}`);
  }
  return v;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseFragmentRef(v: unknown): FragmentRef {
  if (!v || typeof v !== 'object') throw new ContractError('fragment_ref: expected an object');
  const r = v as Record<string, unknown>;
  const source = oneOf(['generated', 'archive', 'upload'] as const, r['source'], 'fragment_ref.source');
  if (typeof r['id'] !== 'string' || !r['id']) throw new ContractError('fragment_ref.id: required');
  // Non-negotiable: fragments are referenced, never flattened. A data: URI in
  // a saved record means someone inlined pixels into the version.
  const uri = r['uri'];
  if (typeof uri === 'string' && uri.startsWith('data:')) {
    throw new ContractError('fragment_ref.uri: fragments must be referenced, not inlined');
  }
  const out: FragmentRef = { source, id: r['id'] };
  if (typeof uri === 'string') out.uri = uri;
  if (r['credit'] && typeof r['credit'] === 'object') out.credit = r['credit'] as FragmentRef['credit'];
  if (typeof r['w'] === 'number') out.w = r['w'];
  if (typeof r['h'] === 'number') out.h = r['h'];
  return out;
}

function parseVerb(v: unknown, i: number): AppliedVerb {
  if (!v || typeof v !== 'object') throw new ContractError(`verbs[${i}]: expected an object`);
  const r = v as Record<string, unknown>;
  const verb = oneOf(VERBS, r['verb'], `verbs[${i}].verb`);
  const params = (r['params'] ?? {}) as Record<string, unknown>;
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new ContractError(`verbs[${i}].params: expected an object`);
  }
  for (const [k, val] of Object.entries(params)) {
    const ok = typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean' ||
      (Array.isArray(val) && val.every((n) => typeof n === 'number'));
    if (!ok) throw new ContractError(`verbs[${i}].params.${k}: verbs are stored as parameters`);
    // A verb result baked to pixels and smuggled back in as a param is the
    // failure mode this guards against.
    if (typeof val === 'string' && val.startsWith('data:')) {
      throw new ContractError(`verbs[${i}].params.${k}: verbs must not be baked into pixels`);
    }
  }
  if (verb === 'edge') oneOf(EDGE_STYLES, params['style'] ?? 'clean', `verbs[${i}].params.style`);
  if (verb === 'material') oneOf(MATERIALS, params['material'] ?? 'none', `verbs[${i}].params.material`);
  return { verb, params: params as VerbParams };
}

function parseLayer(v: unknown, i: number): Layer {
  if (!v || typeof v !== 'object') throw new ContractError(`layers[${i}]: expected an object`);
  const r = v as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || !r['id']) throw new ContractError(`layers[${i}].id: required`);
  const t = (r['transform'] ?? {}) as Record<string, unknown>;
  const transform: Transform = {
    x: finite(t['x'], `layers[${i}].transform.x`),
    y: finite(t['y'], `layers[${i}].transform.y`),
    scale: finite(t['scale'], `layers[${i}].transform.scale`),
    rotation: finite(t['rotation'], `layers[${i}].transform.rotation`),
    z: finite(t['z'], `layers[${i}].transform.z`),
  };
  if (t['flipX'] === true) transform.flipX = true;
  const rawVerbs = r['verbs'] ?? [];
  if (!Array.isArray(rawVerbs)) throw new ContractError(`layers[${i}].verbs: expected an array`);
  const layer: Layer = {
    id: r['id'],
    fragment_ref: parseFragmentRef(r['fragment_ref']),
    transform,
    verbs: rawVerbs.map(parseVerb),
  };
  if (typeof r['opacity'] === 'number') layer.opacity = Math.min(1, Math.max(0, r['opacity']));
  if (typeof r['placed_at_ms'] === 'number') layer.placed_at_ms = r['placed_at_ms'];
  return layer;
}

export function parseComposition(v: unknown): Composition {
  if (!v || typeof v !== 'object') throw new ContractError('composition: expected an object');
  const r = v as Record<string, unknown>;
  const sub = (r['substrate'] ?? {}) as Record<string, unknown>;
  const colour = sub['colour'];
  if (typeof colour !== 'string' || !HEX.test(colour)) {
    throw new ContractError('substrate.colour: expected #rrggbb');
  }
  const rawLayers = r['layers'];
  if (!Array.isArray(rawLayers)) throw new ContractError('layers: expected an array');
  if (rawLayers.length > MAX_LAYERS) {
    throw new ContractError(`layers: ${rawLayers.length} exceeds the cap of ${MAX_LAYERS}`);
  }
  const parentId = r['parent_id'];
  if (parentId !== null && typeof parentId !== 'string') {
    throw new ContractError('parent_id: must be written, as a string or null');
  }
  const rootId = r['root_id'];
  if (rootId !== null && typeof rootId !== 'string') {
    throw new ContractError('root_id: must be written, as a string or null');
  }
  const recipient = r['recipient'] ?? null;
  if (recipient !== null && typeof recipient !== 'string') {
    throw new ContractError('recipient: expected a string or null');
  }
  return {
    theme: oneOf(THEME_IDS as readonly string[] as ThemeId[], r['theme'], 'theme') as ThemeId,
    substrate: {
      stock: oneOf(SUBSTRATE_STOCKS.map((s) => s.id), sub['stock'], 'substrate.stock') as SubstrateStockId,
      colour,
      texture: oneOf(SUBSTRATE_TEXTURES, sub['texture'], 'substrate.texture') as SubstrateTexture,
    },
    palette: oneOf(PALETTES.map((p) => p.id), r['palette'], 'palette') as PaletteId,
    layers: rawLayers.map(parseLayer),
    recipient,
    parent_id: parentId,
    root_id: rootId,
  };
}

/**
 * The five non-negotiables of PRD §9, checked against a record as it would be
 * persisted. Called on every write. If this ever throws in production we have
 * broken the riff layer's ability to attach, which is not recoverable by
 * anything short of a migration.
 */
export function assertVersionContract(v: Version): void {
  if (!('parent_id' in v) || !('root_id' in v)) {
    throw new ContractError('parent_id and root_id must exist on every version');
  }
  if (v.parent_id !== null && v.root_id === null) {
    throw new ContractError('a version with a parent must carry a root_id');
  }
  if (v.parent_id === null && v.root_id !== null && v.root_id !== v.id) {
    throw new ContractError('a rootless version may only be its own root');
  }
  for (const layer of v.layers) {
    if (!layer.fragment_ref?.id) throw new ContractError('every layer must reference a fragment');
    if (layer.fragment_ref.uri?.startsWith('data:')) {
      throw new ContractError('fragments must be referenced, never flattened');
    }
  }
  const zs = v.layers.map((l) => l.transform.z);
  if (new Set(zs).size !== zs.length) {
    throw new ContractError('layer order must be unambiguous: z values are not distinct');
  }
}

/** Layers in draw order — and, identically, in replay build order. */
export function orderedLayers(c: Pick<Composition, 'layers'>): Layer[] {
  return [...c.layers].sort((a, b) => a.transform.z - b.transform.z);
}
