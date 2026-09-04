/**
 * PRD §8.2 — the generated tray, and §10 — the cost of it.
 *
 * The provider seam exists so an image model can be dropped in without the
 * tray, the cache, the pools or the client changing. Until one is configured,
 * the local generator fills the same pools from the same seeds, which means
 * the whole path — pre-warm, cache, serve, "more like this" — is exercised and
 * measured from day one rather than stubbed out and discovered later.
 *
 * Two rules hold for any provider (PRD §10, Abuse):
 *   - no likeness generation of real people;
 *   - no user-uploaded image is ever sent into a generative verb.
 * Both are enforced at the call sites, not left to the provider's own policy.
 */
import { THEMES, type ThemeId } from '@collage/shared/constants';
import { generateTray, generateFragment, variantsOf, type FragmentSpec } from '@collage/shared/fragments';

export interface TrayAsset {
  id: string;
  theme: ThemeId;
  family: string;
  name: string;
  w: number;
  h: number;
  uri: string;
  source: 'generated';
}

export interface GenerationProvider {
  readonly name: string;
  /** A themed pool. Must be deterministic in (theme, generation) so it caches. */
  pool(theme: ThemeId, size: number, generation: number): Promise<FragmentSpec[]>;
  variants(fragmentId: string, salt: number, n: number): Promise<FragmentSpec[]>;
}

/** Deterministic, free, offline. The default, and the fallback for any other. */
export const localProvider: GenerationProvider = {
  name: 'local',
  async pool(theme, size, generation) {
    return generateTray(theme, size, generation);
  },
  async variants(fragmentId, salt, n) {
    return variantsOf(fragmentId, n, salt);
  },
};

/** Pre-warmed pools (PRD §10: "pre-warmed tray pools rather than on-demand
 *  generation per user"). Held in memory; the SVG for any id is re-derivable
 *  from the id alone, so a cold process costs nothing to refill. */
const pools = new Map<string, FragmentSpec[]>();
const svgCache = new Map<string, string>();

export function provider(): GenerationProvider {
  // A hosted provider would be selected here from configuration.
  return localProvider;
}

export async function warmPools(size: number): Promise<number> {
  const p = provider();
  let total = 0;
  for (const theme of THEMES) {
    const specs = await p.pool(theme.id, size, 0);
    pools.set(`${theme.id}:0`, specs);
    for (const s of specs) svgCache.set(s.id, s.svg);
    total += specs.length;
  }
  return total;
}

export async function getPool(theme: ThemeId, size: number, generation: number): Promise<TrayAsset[]> {
  const key = `${theme}:${generation}`;
  let specs = pools.get(key);
  if (!specs) {
    specs = await provider().pool(theme, size, generation);
    pools.set(key, specs);
    for (const s of specs) svgCache.set(s.id, s.svg);
  }
  return specs.map(toAsset);
}

export async function getVariants(fragmentId: string, salt: number, n = 4): Promise<TrayAsset[]> {
  const specs = await provider().variants(fragmentId, salt, n);
  for (const s of specs) svgCache.set(s.id, s.svg);
  return specs.map(toAsset);
}

/** Serve any fragment by id, generating it on the spot if the pool has been
 *  evicted. Ids are seeds, so this can never 404 for a well-formed id. */
export function fragmentSvg(id: string): string | null {
  const hit = svgCache.get(id);
  if (hit) return hit;
  try {
    const spec = generateFragment(id);
    svgCache.set(id, spec.svg);
    if (svgCache.size > 4000) svgCache.delete(svgCache.keys().next().value as string);
    return spec.svg;
  } catch {
    return null;
  }
}

const toAsset = (s: FragmentSpec): TrayAsset => ({
  id: s.id,
  theme: s.theme,
  family: s.family,
  name: s.name,
  w: s.w,
  h: s.h,
  uri: `/api/fragment/${s.id}.svg`,
  source: 'generated',
});
