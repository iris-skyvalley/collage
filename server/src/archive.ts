/**
 * PRD §8.2 — the archive half of the tray: "Open-access collections —
 * Rijksmuseum, the Met, NYPL, Biodiversity Heritage Library, Internet
 * Archive."
 *
 * PRD §10, Rights — generated and open-access only. Every item carries its
 * collection and licence, and anything without a clear open-access marker is
 * not offered.
 *
 * Off by default (ARCHIVE_ENABLED). Two reasons: the tray must never depend on
 * a third party being up, and each collection's API wants its own key and rate
 * budget, which is a decision to make deliberately rather than by shipping.
 */
import type { ThemeId } from '@collage/shared/constants';

export interface ArchiveItem {
  id: string;
  theme: ThemeId;
  family: string;
  name: string;
  w: number;
  h: number;
  uri: string;
  source: 'archive';
  credit: { collection: string; title?: string; url?: string; licence?: string };
}

interface Collection {
  id: string;
  name: string;
  licence: string;
  /** Search terms per theme; empty means the collection has nothing for it. */
  queries: Partial<Record<ThemeId, string>>;
  search(query: string, signal: AbortSignal, theme: ThemeId): Promise<ArchiveItem[]>;
}

export const archiveEnabled = (): boolean => process.env['ARCHIVE_ENABLED'] === '1';

const TIMEOUT_MS = 2500;
const cache = new Map<string, { at: number; items: ArchiveItem[] }>();
const TTL = 6 * 3600_000;

/** The Met's Open Access API needs no key and marks public-domain items. */
const met: Collection = {
  id: 'met',
  name: 'The Metropolitan Museum of Art',
  licence: 'CC0',
  // The Costume Institute is public domain and photographed on neutral
  // grounds — the nearest thing to a rights-clean product shot that exists.
  queries: {
    all: 'costume institute',
    tops: 'blouse',
    bottoms: 'skirt',
    dresses: 'evening dress',
    outerwear: 'coat',
    shoes: 'shoes',
    bags: 'handbag',
    accessories: 'hat',
    beauty: 'perfume bottle',
  },
  async search(query, signal, theme) {
    const base = 'https://collectionapi.metmuseum.org/public/collection/v1';
    const idsRes = await fetch(`${base}/search?isPublicDomain=true&hasImages=true&q=${encodeURIComponent(query)}`, { signal });
    const ids = ((await idsRes.json()) as { objectIDs?: number[] }).objectIDs ?? [];
    const picks = ids.slice(0, 12);
    const items = await Promise.all(picks.map(async (id): Promise<ArchiveItem | null> => {
      const res = await fetch(`${base}/objects/${id}`, { signal });
      const obj = (await res.json()) as {
        primaryImageSmall?: string; title?: string; objectURL?: string; isPublicDomain?: boolean;
      };
      if (!obj.primaryImageSmall || !obj.isPublicDomain) return null;
      return {
        id: `met.${id}`,
        theme,
        family: 'plate',
        name: obj.title?.slice(0, 60) ?? 'Plate',
        w: 512,
        h: 512,
        uri: obj.primaryImageSmall,
        source: 'archive' as const,
        credit: { collection: 'The Met', title: obj.title, url: obj.objectURL, licence: 'CC0' },
      };
    }));
    return items.filter((x): x is ArchiveItem => x !== null);
  },
};

const COLLECTIONS: Collection[] = [met];

export async function archiveItems(theme: ThemeId): Promise<ArchiveItem[]> {
  const hit = cache.get(theme);
  if (hit && Date.now() - hit.at < TTL) return hit.items;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const results = await Promise.all(COLLECTIONS.map(async (c) => {
      const q = c.queries[theme];
      if (!q) return [];
      try {
        return await c.search(q, controller.signal, theme);
      } catch {
        // One slow collection must not cost the tray its other sources.
        return [];
      }
    }));
    const items = results.flat();
    cache.set(theme, { at: Date.now(), items });
    return items;
  } finally {
    clearTimeout(timer);
  }
}
