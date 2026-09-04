/**
 * Minting a version and pushing its renders.
 *
 * PRD §6.3 — "Every piece gets a permanent short URL on creation, before any
 * share action." The URL is minted when the artifact is made, not when a share
 * button is pressed, so the link always exists by the time anyone wants it.
 *
 * PRD §6.3 again — "The URL opens the piece as a *version* — parameters and
 * layer stack, viewable, not a flat image." The renders are a preview for
 * cards and for saving; the record is what the URL resolves to.
 */
import type { Composition, Layer } from '@collage/shared/version';
import { api, sessionId } from '../lib/api.ts';
import { getUpload, noteRemoteUrl } from '../tray/uploads.ts';
import { store } from '../state/store.ts';
import { track } from '../lib/metrics.ts';

export interface Artifacts {
  piece?: Blob;
  story?: Blob;
  replay?: { blob: Blob; extension: string };
}

/**
 * Uploaded fragments live on the device. A shared link has to render for
 * someone else, so their bytes are pushed and the ref gains a URL — still a
 * reference, still no pixels in the version record.
 */
export async function syncUploads(comp: Composition): Promise<Composition> {
  const uploads = comp.layers.filter((l) => l.fragment_ref.source === 'upload' && !l.fragment_ref.uri);
  if (!uploads.length) return comp;

  const mapped = new Map<string, string>();
  await Promise.all(uploads.map(async (l) => {
    const blob = await getUpload(l.fragment_ref.id);
    if (!blob) return;
    const { url } = await api.uploadFragment(l.fragment_ref.id, blob);
    mapped.set(l.fragment_ref.id, url);
    noteRemoteUrl(l.fragment_ref.id, url);
  }));
  if (!mapped.size) return comp;

  const layers: Layer[] = comp.layers.map((l) => {
    const url = mapped.get(l.fragment_ref.id);
    return url ? { ...l, fragment_ref: { ...l.fragment_ref, uri: url } } : l;
  });
  return { ...comp, layers };
}

export interface Published {
  id: string;
  url: string;
}

export async function mintVersion(): Promise<Published> {
  const synced = await syncUploads(store.comp);
  if (synced !== store.comp) store.replaceComposition(synced);
  const result = await api.saveVersion(synced, {});
  store.markSaved(result.id);
  return { id: result.id, url: absolute(result.url) };
}

export async function pushRender(versionId: string, kind: 'piece' | 'story' | 'replay', blob: Blob): Promise<string> {
  const res = await fetch(`/api/versions/${versionId}/renders/${kind}`, {
    method: 'POST',
    headers: { 'content-type': blob.type || 'application/octet-stream', 'x-collage-session': sessionId() },
    body: blob,
  });
  if (!res.ok) throw new Error(`render upload failed: ${res.status}`);
  const { hash } = (await res.json()) as { hash: string };
  track('export', { kind, bytes: blob.size });
  return hash;
}

export const absolute = (url: string): string =>
  url.startsWith('http') ? url : new URL(url, location.origin).toString();
