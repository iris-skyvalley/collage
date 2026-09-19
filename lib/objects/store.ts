import type { ClipObject, Creation, UsageCount } from './schema.ts';
import { objectIdsOf } from './schema.ts';

/**
 * Storage for objects, creations and image bytes.
 *
 * One interface, several backends: memory (tests, server rendering),
 * IndexedDB (the static build, per browser) and D1 + R2 (Cloudflare, shared).
 * The app talks only to this interface, so moving from a local library to a
 * shared one is a matter of handing it a different store.
 */
/** Who is using the store, as far as it can tell. */
export type Identity = {
  id: string;
  email?: string;
  /** True until the user has claimed the account with an email. */
  anonymous: boolean;
};

/** Account operations, for stores that have accounts at all. */
export interface Account {
  get(): Promise<Identity>;
  /** Attach an email to the current (anonymous) user, keeping its id. */
  claim(email: string): Promise<void>;
  /** Send a sign-in link to an existing account. */
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Called whenever the identity changes; returns an unsubscribe. */
  onChange(cb: (identity: Identity) => void): () => void;
}

export interface ObjectStore {
  /** Which backend this is; the studio words its "saved" notice by it. */
  readonly kind: 'memory' | 'indexeddb' | 'supabase';
  /** Who the store thinks the user is. Absent for stores with no identity. */
  whoAmI?(): Promise<string>;
  /** Accounts, when the backend has them. */
  readonly account?: Account;
  /** A URL the browser can load a blob from directly, when the store has one. */
  blobUrl?(key: string): string;

  putObject(object: ClipObject): Promise<void>;
  /** Change which library category an object is filed under. */
  setCategory(id: string, category: string | undefined): Promise<void>;
  getObject(id: string): Promise<ClipObject | undefined>;
  /** Newest first. */
  listObjects(filter?: { clippedBy?: string }): Promise<ClipObject[]>;
  deleteObject(id: string): Promise<void>;

  putBlob(key: string, blob: Blob): Promise<void>;
  getBlob(key: string): Promise<Blob | undefined>;
  deleteBlob(key: string): Promise<void>;

  putCreation(creation: Creation): Promise<void>;
  getCreation(id: string): Promise<Creation | undefined>;
  /** Newest first. */
  listCreations(filter?: { ownerId?: string }): Promise<Creation[]>;
  deleteCreation(id: string): Promise<void>;

  /** Creations an object appears in, newest first. */
  usedIn(objectId: string): Promise<Creation[]>;
  /** How many creations each object appears in. Missing ids count 0. */
  usageCounts(objectIds: readonly string[]): Promise<UsageCount[]>;
}

/** Normalise a creation before storing: objectIds always match pieces. */
export function normalizeCreation(creation: Creation): Creation {
  return { ...creation, objectIds: objectIdsOf(creation.pieces) };
}

function byNewest<T extends { createdAt: string }>(a: T, b: T): number {
  return b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0;
}

/** In-memory store. Used by tests and as the server-side placeholder. */
export class MemoryObjectStore implements ObjectStore {
  readonly kind = 'memory' as const;
  private objects = new Map<string, ClipObject>();
  private blobs = new Map<string, Blob>();
  private creations = new Map<string, Creation>();

  async putObject(object: ClipObject) {
    this.objects.set(object.id, structuredClone(object));
  }
  async setCategory(id: string, category: string | undefined) {
    const o = this.objects.get(id);
    if (o)
      this.objects.set(id, {
        ...o,
        category,
        updatedAt: new Date().toISOString(),
      });
  }
  async getObject(id: string) {
    const o = this.objects.get(id);
    return o && structuredClone(o);
  }
  async listObjects(filter?: { clippedBy?: string }) {
    return [...this.objects.values()]
      .filter((o) => !filter?.clippedBy || o.clippedBy === filter.clippedBy)
      .sort(byNewest)
      .map((o) => structuredClone(o));
  }
  async deleteObject(id: string) {
    this.objects.delete(id);
  }

  async putBlob(key: string, blob: Blob) {
    this.blobs.set(key, blob);
  }
  async getBlob(key: string) {
    return this.blobs.get(key);
  }
  async deleteBlob(key: string) {
    this.blobs.delete(key);
  }

  async putCreation(creation: Creation) {
    this.creations.set(
      creation.id,
      structuredClone(normalizeCreation(creation)),
    );
  }
  async getCreation(id: string) {
    const c = this.creations.get(id);
    return c && structuredClone(c);
  }
  async listCreations(filter?: { ownerId?: string }) {
    return [...this.creations.values()]
      .filter((c) => !filter?.ownerId || c.ownerId === filter.ownerId)
      .sort(byNewest)
      .map((c) => structuredClone(c));
  }
  async deleteCreation(id: string) {
    this.creations.delete(id);
  }

  async usedIn(objectId: string) {
    return (await this.listCreations()).filter((c) =>
      c.objectIds.includes(objectId),
    );
  }
  async usageCounts(objectIds: readonly string[]) {
    const all = [...this.creations.values()];
    return objectIds.map((objectId) => ({
      objectId,
      creations: all.filter((c) => c.objectIds.includes(objectId)).length,
    }));
  }
}
