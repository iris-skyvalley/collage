/**
 * PRD §8.2 — "User upload allowed (photo picker), auto-cut on import."
 *
 * Uploads live in IndexedDB on the device and are addressed by id, never
 * inlined into the composition (PRD §9: fragments are referenced, never
 * flattened). When a piece is shared, `syncUploads` pushes the bytes to the
 * server so the record stays renderable by whoever opens the link — the ref
 * gains a URL, and still no pixels enter the version.
 */
const DB_NAME = 'collage';
const STORE = 'uploads';

let dbPromise: Promise<IDBDatabase> | null = null;
const urls = new Map<string, string>();
const remote = new Map<string, string>();

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function putUpload(id: string, blob: Blob): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  urls.set(id, URL.createObjectURL(blob));
}

export async function getUpload(id: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

/** Object URL for an upload already in memory, or the remote copy once synced. */
export function resolveUploadUrl(id: string): string | undefined {
  return urls.get(id) ?? remote.get(id);
}

export function noteRemoteUrl(id: string, url: string): void {
  remote.set(id, url);
}

/** Warm the object-URL map from IndexedDB — needed after a reload, when the
 *  composition was restored from device storage but the blobs were not. */
export async function hydrateUploads(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      if (urls.has(id)) return;
      const blob = await getUpload(id).catch(() => undefined);
      if (blob) urls.set(id, URL.createObjectURL(blob));
    }),
  );
}

export function listCachedUploadIds(): string[] {
  return [...urls.keys()];
}
