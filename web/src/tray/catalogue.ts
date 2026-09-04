/**
 * PRD §8.2 — the tray. Themed and finite, 40–80 items, "not a search box.
 * Browsing a curated tray is the creative act; searching a million SKUs is a
 * chore."
 *
 * The server is asked first (it serves pre-warmed, cached pools and any
 * archive items). Failing that, the static manifest; failing that, the tray is
 * generated here from the same seeds. So it is never empty — on a static
 * deploy, offline, or with the API down, which are the states the "never a
 * blank tray" principle has to survive.
 */
import type { ThemeId } from '@collage/shared/constants';
import { api, type TrayItem } from '../lib/api.ts';
import { localTray, localVariants, localFragmentUrl } from './local.ts';

let staticManifest: Record<string, TrayItem[]> | null = null;

async function loadStatic(): Promise<Record<string, TrayItem[]>> {
  if (staticManifest) return staticManifest;
  const res = await fetch('/fragments/manifest.json');
  const data = (await res.json()) as { themes: Record<string, Omit<TrayItem, 'source'>[]> };
  staticManifest = Object.fromEntries(
    Object.entries(data.themes).map(([k, v]) => [k, v.map((i) => ({ ...i, source: 'generated' as const }))]),
  );
  return staticManifest;
}

const cache = new Map<string, TrayItem[]>();

export async function loadTray(theme: ThemeId, generation = 0): Promise<TrayItem[]> {
  const key = `${theme}:${generation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const { items } = await api.tray(theme, generation);
    if (items?.length) {
      // Generated items are drawn on the device from their ids, so the tray
      // can never disagree with the canvas and makes no request per tile.
      const local = items.map((i) => (i.source === 'generated' ? { ...i, thumb: localFragmentUrl(i.id) ?? i.thumb } : i));
      cache.set(key, local);
      return local;
    }
  } catch {
    // Fall through to the bundled tray.
  }
  const fromManifest = await loadStatic().then((m) => m[theme]).catch(() => undefined);
  const items = fromManifest?.length ? fromManifest : localTray(theme);
  cache.set(key, items);
  return items;
}

/** PRD §8.2 — "One 'more like this' action per item." */
export async function moreLikeThis(item: TrayItem, salt: number): Promise<TrayItem[]> {
  try {
    const { items } = await api.variants(item.id, salt);
    if (items?.length) return items;
  } catch {
    // Without a server the variants are generated here, from the same seeds.
  }
  return localVariants(item.id, salt);
}
