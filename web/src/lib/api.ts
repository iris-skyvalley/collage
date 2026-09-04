/** Thin client over the server. Everything here works without an account. */
import type { Composition, Version } from '@collage/shared/version';

export interface SaveResult {
  id: string;
  url: string;
  parent_id: string | null;
  root_id: string | null;
}

const SESSION_KEY = 'collage.session.v1';

export function sessionId(): string {
  let id = '';
  try { id = localStorage.getItem(SESSION_KEY) ?? ''; } catch { /* private mode */ }
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* ignore */ }
  }
  return id;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-collage-session': sessionId(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  /** PRD §10 — generation is capped per session and per IP. */
  get isCapped(): boolean { return this.status === 429; }
}

export const api = {
  saveVersion: (comp: Composition, renders: Record<string, string>): Promise<SaveResult> =>
    req('/api/versions', { method: 'POST', body: JSON.stringify({ composition: comp, renders }) }),

  getVersion: (id: string): Promise<{ version: Version }> => req(`/api/versions/${id}`),

  uploadFragment: async (id: string, blob: Blob): Promise<{ id: string; url: string }> => {
    const res = await fetch(`/api/uploads/${id}`, {
      method: 'POST',
      headers: { 'content-type': blob.type || 'image/png', 'x-collage-session': sessionId() },
      body: blob,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => res.statusText));
    return res.json() as Promise<{ id: string; url: string }>;
  },

  tray: (theme: string, generation = 0): Promise<{ items: TrayItem[]; source: string }> =>
    req(`/api/tray?theme=${encodeURIComponent(theme)}&generation=${generation}`),

  variants: (fragmentId: string, salt: number): Promise<{ items: TrayItem[] }> =>
    req(`/api/tray/variants?id=${encodeURIComponent(fragmentId)}&salt=${salt}`),

  react: (versionId: string, kind: string): Promise<{ ok: true }> =>
    req(`/api/versions/${versionId}/reactions`, { method: 'POST', body: JSON.stringify({ kind }) }),

  report: (versionId: string, reason: string): Promise<{ ok: true }> =>
    req(`/api/versions/${versionId}/report`, { method: 'POST', body: JSON.stringify({ reason }) }),

  claim: (email: string, versionId: string | null): Promise<{ sent: boolean; dev_link?: string }> =>
    req('/api/claim', { method: 'POST', body: JSON.stringify({ email, version_id: versionId }) }),

  me: (): Promise<{ user: { id: string; email: string } | null; pieces: number }> => req('/api/me'),

  events: (events: unknown[]): Promise<{ ok: true }> =>
    req('/api/events', { method: 'POST', body: JSON.stringify({ events }) }),
};

export interface TrayItem {
  id: string;
  theme: string;
  family: string;
  name: string;
  w: number;
  h: number;
  uri: string;
  source: 'generated' | 'archive';
  credit?: { collection: string; title?: string; url?: string; licence?: string };
}
