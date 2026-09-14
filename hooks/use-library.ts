import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipObject, Creation } from '@/lib/objects/schema';
import { newId, now } from '@/lib/objects/schema';
import { MemoryObjectStore, type ObjectStore } from '@/lib/objects/store';
import { IndexedDbObjectStore } from '@/lib/objects/indexeddb-store';
import { SupabaseObjectStore } from '@/lib/objects/supabase-store';
import { FlatBackgroundCutter } from '@/lib/clip/cutout';
import { ingestClip, isClipPayload, type ClipPayload } from '@/lib/clip/ingest';
import type { Piece } from '@/app/collage';

const CREATOR_KEY = 'offcut:creator';
const CREATION_KEY = 'offcut:creation';

function local(key: string, make: () => string): string {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const made = make();
    localStorage.setItem(key, made);
    return made;
  } catch {
    return make();
  }
}

const supabaseEnv = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

/** The shared library when a Supabase project is configured. */
function makeSharedStore(): ObjectStore | null {
  return SupabaseObjectStore.configured(supabaseEnv)
    ? new SupabaseObjectStore(supabaseEnv.url!, supabaseEnv.anonKey!)
    : null;
}

/** The library in this browser: IndexedDB when the browser has it. */
function makeLocalStore(): ObjectStore {
  return IndexedDbObjectStore.available()
    ? new IndexedDbObjectStore()
    : new MemoryObjectStore();
}

/**
 * The library: clipped objects, how often each has been used, and the
 * creation currently on the canvas. Everything persists through the store.
 */
export function useLibrary(pieces: Piece[], title: string) {
  // The shared store is preferred; if it cannot identify the user (project
  // down, anonymous sign-in off) the library falls back to this browser.
  const [store, setStore] = useState<ObjectStore>(
    () => makeSharedStore() ?? makeLocalStore(),
  );
  const [creator, setCreator] = useState<string | null>(null);
  /** Why the shared library was given up on, when it was. */
  const [fallback, setFallback] = useState<string | null>(null);
  const cutter = useMemo(() => new FlatBackgroundCutter(), []);
  const [objects, setObjects] = useState<ClipObject[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const creationRef = useRef<{ id: string; createdAt: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const list = await store.listObjects();
    const counts = await store.usageCounts(list.map((o) => o.id));
    const next = { ...urlsRef.current };
    await Promise.all(
      list.map(async (o) => {
        if (next[o.id]) return;
        const ref = o.cutoutImage ?? o.originalImage;
        if (ref.blobKey && store.blobUrl) {
          next[o.id] = store.blobUrl(ref.blobKey);
        } else if (ref.blobKey) {
          const blob = await store.getBlob(ref.blobKey);
          if (blob) next[o.id] = URL.createObjectURL(blob);
        } else if (ref.url) {
          next[o.id] = ref.url;
        }
      }),
    );
    urlsRef.current = next;
    setUrls(next);
    setObjects(list);
    setUsage(Object.fromEntries(counts.map((c) => [c.objectId, c.creations])));
  }, [store]);

  /** Pieces of the creation last worked on in this browser, if any. */
  const loadCreation = useCallback(async (): Promise<Piece[] | null> => {
    const id = local(CREATION_KEY, newId);
    const saved = await store.getCreation(id);
    creationRef.current = { id, createdAt: saved?.createdAt ?? now() };
    setHydrated(true);
    return saved ? (saved.pieces as Piece[]) : null;
  }, [store]);

  // Identify the user for this store, then load the library. A shared store
  // that cannot identify us is swapped for the local one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const id = store.whoAmI
          ? await store.whoAmI()
          : local(CREATOR_KEY, newId);
        if (cancelled) return;
        setCreator(id);
        await refresh();
      } catch (e) {
        if (cancelled || store.kind !== 'supabase') return;
        const why = describeAuthFailure(e);
        console.warn(
          'Offcut: shared library unavailable, using this browser.',
          e,
        );
        setFallback(why);
        setStore(makeLocalStore());
      }
    })();
    return () => {
      cancelled = true;
      for (const u of Object.values(urlsRef.current))
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      urlsRef.current = {};
    };
  }, [store, refresh]);

  // Autosave the canvas as a creation. Debounced, flushed when the tab goes
  // away, and never before hydration, or the demo layout would overwrite
  // what was saved.
  useEffect(() => {
    if (!hydrated || !creator || !creationRef.current) return;
    const { id, createdAt } = creationRef.current;
    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      const creation: Creation = {
        id,
        title,
        ownerId: creator,
        pieces,
        objectIds: [],
        createdAt,
        updatedAt: now(),
      };
      store
        .putCreation(creation)
        .then(async () => {
          const counts = await store.usageCounts(objects.map((o) => o.id));
          setUsage(
            Object.fromEntries(counts.map((c) => [c.objectId, c.creations])),
          );
        })
        .catch(() => {});
    };
    const t = setTimeout(save, 500);
    window.addEventListener('pagehide', save);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pagehide', save);
    };
  }, [pieces, title, hydrated, store, creator, objects]);

  /** Leave the current creation in the library and start a fresh one. */
  const startNewCreation = useCallback(() => {
    const id = newId();
    try {
      localStorage.setItem(CREATION_KEY, id);
    } catch {}
    creationRef.current = { id, createdAt: now() };
  }, []);

  const clip = useCallback(
    async (payload: ClipPayload) => {
      const who =
        creator ??
        (store.whoAmI ? await store.whoAmI() : local(CREATOR_KEY, newId));
      const object = await ingestClip(payload, store, cutter, who);
      await refresh();
      return object;
    },
    [store, cutter, creator, refresh],
  );

  const remove = useCallback(
    async (o: ClipObject) => {
      await store.deleteObject(o.id);
      for (const ref of [o.originalImage, o.cutoutImage])
        if (ref?.blobKey) await store.deleteBlob(ref.blobKey);
      const u = urlsRef.current[o.id];
      if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
      delete urlsRef.current[o.id];
      await refresh();
    },
    [store, refresh],
  );

  return {
    objects,
    usage,
    /** Image URL to show for an object (cutout when there is one). */
    src: (o: ClipObject) => urls[o.id],
    srcById: (id: string) => urls[id],
    clip,
    remove,
    loadCreation,
    startNewCreation,
    creator,
    /** Where the library lives: shared, in this browser, or nowhere. */
    kind: store.kind,
    fallback,
  };
}

/**
 * Receive a clip from the clipper. The studio is opened with `?clip=<token>`;
 * it tells the opener it is ready, then accepts one payload carrying the
 * same token.
 */
export function useClipReceiver(onClip: (payload: ClipPayload) => void) {
  const handler = useRef(onClip);
  useEffect(() => {
    handler.current = onClip;
  });
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('clip');
    if (!token) return;
    params.delete('clip');
    const clean =
      location.pathname + (params.size ? '?' + params : '') + location.hash;
    history.replaceState(null, '', clean);
    const opener = window.opener as Window | null;
    if (!opener) return;
    const life = new AbortController();
    window.addEventListener(
      'message',
      (e: MessageEvent) => {
        const d = e.data as { type?: string } | null;
        if (d?.type !== 'offcut:clip' || !isClipPayload(d) || d.token !== token)
          return;
        life.abort();
        handler.current(d);
      },
      { signal: life.signal },
    );
    opener.postMessage({ type: 'offcut:ready', token }, '*');
    return () => life.abort();
  }, []);
}

/** Turn a Supabase auth error into a sentence that says what to fix. */
function describeAuthFailure(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  const message = e instanceof Error ? e.message : String(e);
  if (status === 422 || /anonymous sign-ins are disabled/i.test(message))
    return 'Anonymous sign-ins are off in the Supabase project (Authentication → Sign In / Providers). Saving in this browser instead.';
  if (status === 401 || status === 403)
    return 'The Supabase anon key was refused. Saving in this browser instead.';
  return `The shared library did not answer (${message}). Saving in this browser instead.`;
}

export function formatPrice(o: ClipObject): string | undefined {
  if (!o.price) return undefined;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: o.price.currency,
      maximumFractionDigits: 2,
    }).format(o.price.amount);
  } catch {
    return `${o.price.amount} ${o.price.currency}`;
  }
}

/**
 * The bookmarklet: loads the clipper from this studio into any page. The
 * built clipper is a classic script; the dev server serves the TypeScript
 * source as a module instead.
 */
export function bookmarkletFor(origin: string, dev: boolean): string {
  const src = dev ? `${origin}/web/clip/main.ts` : `${origin}/clip.js`;
  return (
    'javascript:(function(){var s=document.createElement("script");' +
    (dev ? 's.type="module";' : '') +
    `s.src=${JSON.stringify(src)}+"?t="+Date.now();` +
    'document.documentElement.appendChild(s)})()'
  );
}
