import type { ClipObject, Creation, UsageCount } from './schema.ts';
import { normalizeCreation, type ObjectStore } from './store.ts';

const DB_NAME = 'offcut';
const DB_VERSION = 1;

/**
 * IndexedDB backend: the library lives in this browser.
 *
 * Three object stores:
 *   objects    keyed by id, indexed by clippedBy and createdAt
 *   blobs      keyed by blob key, value is the Blob
 *   creations  keyed by id, indexed by ownerId, createdAt and a multiEntry
 *              index on objectIds — that index *is* used_in.
 */
export class IndexedDbObjectStore implements ObjectStore {
  readonly kind = 'indexeddb' as const;
  private db: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('objects')) {
          const objects = db.createObjectStore('objects', { keyPath: 'id' });
          objects.createIndex('clippedBy', 'clippedBy');
          objects.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
        if (!db.objectStoreNames.contains('creations')) {
          const creations = db.createObjectStore('creations', {
            keyPath: 'id',
          });
          creations.createIndex('ownerId', 'ownerId');
          creations.createIndex('createdAt', 'createdAt');
          creations.createIndex('objectIds', 'objectIds', { multiEntry: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB failed'));
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
    });
    return this.db;
  }

  private async run<T>(
    store: string,
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request'));
    });
  }

  private async getAllBy<T>(
    store: string,
    index: string | null,
    key: IDBValidKey | undefined,
  ): Promise<T[]> {
    return this.run<T[]>(store, 'readonly', (s) =>
      index && key !== undefined ? s.index(index).getAll(key) : s.getAll(),
    );
  }

  putObject(object: ClipObject) {
    return this.run('objects', 'readwrite', (s) => s.put(object)).then(
      () => {},
    );
  }
  async setCategory(id: string, category: string | undefined) {
    const o = await this.getObject(id);
    if (o)
      await this.putObject({
        ...o,
        category,
        updatedAt: new Date().toISOString(),
      });
  }
  getObject(id: string) {
    return this.run<ClipObject | undefined>('objects', 'readonly', (s) =>
      s.get(id),
    );
  }
  async listObjects(filter?: { clippedBy?: string }) {
    const rows = await this.getAllBy<ClipObject>(
      'objects',
      'clippedBy',
      filter?.clippedBy,
    );
    return rows.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  }
  deleteObject(id: string) {
    return this.run('objects', 'readwrite', (s) => s.delete(id)).then(() => {});
  }

  putBlob(key: string, blob: Blob) {
    return this.run('blobs', 'readwrite', (s) => s.put(blob, key)).then(
      () => {},
    );
  }
  getBlob(key: string) {
    return this.run<Blob | undefined>('blobs', 'readonly', (s) => s.get(key));
  }
  deleteBlob(key: string) {
    return this.run('blobs', 'readwrite', (s) => s.delete(key)).then(() => {});
  }

  putCreation(creation: Creation) {
    return this.run('creations', 'readwrite', (s) =>
      s.put(normalizeCreation(creation)),
    ).then(() => {});
  }
  getCreation(id: string) {
    return this.run<Creation | undefined>('creations', 'readonly', (s) =>
      s.get(id),
    );
  }
  async listCreations(filter?: { ownerId?: string }) {
    const rows = await this.getAllBy<Creation>(
      'creations',
      'ownerId',
      filter?.ownerId,
    );
    return rows.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  }
  deleteCreation(id: string) {
    return this.run('creations', 'readwrite', (s) => s.delete(id)).then(
      () => {},
    );
  }

  async usedIn(objectId: string) {
    const rows = await this.getAllBy<Creation>(
      'creations',
      'objectIds',
      objectId,
    );
    return rows.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  }
  async usageCounts(objectIds: readonly string[]): Promise<UsageCount[]> {
    const db = await this.open();
    const tx = db.transaction('creations', 'readonly');
    const index = tx.objectStore('creations').index('objectIds');
    return Promise.all(
      objectIds.map(
        (objectId) =>
          new Promise<UsageCount>((resolve, reject) => {
            const req = index.count(objectId);
            req.onsuccess = () => resolve({ objectId, creations: req.result });
            req.onerror = () => reject(req.error ?? new Error('count'));
          }),
      ),
    );
  }
}
