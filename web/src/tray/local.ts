/**
 * Fragments, generated on the device.
 *
 * A generated fragment's id is its whole seed, so the client can produce the
 * same bytes the server would — which means the tray, "more like this", and
 * every generated fragment on a saved piece work with no server at all: on a
 * static deploy, offline, or while the API is down. The server path remains
 * the one that matters once a hosted provider is configured; this is what the
 * client falls back to, and it is exact rather than approximate.
 */
import type { ThemeId } from '@collage/shared/constants';
import { generateFragment, generateTray, variantsOf, type FragmentSpec } from '@collage/shared/fragments';
import type { TrayItem } from '../lib/api.ts';

const GENERATED_ID = /^[a-z]+\.[a-z]+\.\d+$/;
const urls = new Map<string, string>();

export const isGeneratedId = (id: string): boolean => GENERATED_ID.test(id);

/** A blob: URL for the fragment's SVG, minted once per id. */
export function localFragmentUrl(id: string): string | undefined {
  if (!isGeneratedId(id)) return undefined;
  const hit = urls.get(id);
  if (hit) return hit;
  try {
    const url = URL.createObjectURL(new Blob([generateFragment(id).svg], { type: 'image/svg+xml' }));
    urls.set(id, url);
    return url;
  } catch {
    return undefined;
  }
}

const toItem = (s: FragmentSpec): TrayItem => ({
  id: s.id,
  theme: s.theme,
  family: s.family,
  name: s.name,
  w: s.w,
  h: s.h,
  // The canonical, server-resolvable address is what gets saved on a piece;
  // the thumbnail comes from the blob so nothing is fetched.
  uri: `/api/fragment/${s.id}.svg`,
  thumb: localFragmentUrl(s.id),
  source: 'generated',
});

export const localTray = (theme: ThemeId, count = 60): TrayItem[] => generateTray(theme, count).map(toItem);

export const localVariants = (id: string, salt: number, n = 4): TrayItem[] => variantsOf(id, n, salt).map(toItem);
