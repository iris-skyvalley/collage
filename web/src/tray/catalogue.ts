/**
 * PRD §8.2 — the tray. Themed and finite, 40–80 items, "not a search box.
 * Browsing a curated tray is the creative act; searching a million SKUs is a
 * chore."
 *
 * The server is asked first (it serves pre-warmed, cached pools and any
 * archive items), and the static manifest is the fallback, so the tray is
 * never empty — including offline, which is the one state the "never a blank
 * tray" principle has to survive.
 */
import type { ThemeId } from '@collage/shared/constants';
import { api, type TrayItem } from '../lib/api.ts';

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
      cache.set(key, items);
      return items;
    }
  } catch {
    // Fall through to the bundled tray.
  }
  const items = (await loadStatic())[theme] ?? [];
  cache.set(key, items);
  return items;
}

/** PRD §8.2 — "One 'more like this' action per item." */
export async function moreLikeThis(item: TrayItem, salt: number): Promise<TrayItem[]> {
  try {
    const { items } = await api.variants(item.id, salt);
    if (items?.length) return items;
  } catch {
    // Without a server, the family is still derivable from the id.
  }
  const [theme, family, n] = item.id.split('.');
  const base = Number(n ?? 0);
  return Array.from({ length: 4 }, (_, i) => ({
    ...item,
    id: `${theme}.${family}.${base + 7919 * (salt + 1) + i + 1}`,
    uri: `/api/fragment/${theme}.${family}.${base + 7919 * (salt + 1) + i + 1}.svg`,
  }));
}
