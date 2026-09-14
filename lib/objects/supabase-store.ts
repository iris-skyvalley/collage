import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ClipObject, Creation, UsageCount } from './schema.ts';
import {
  normalizeCreation,
  type Account,
  type Identity,
  type ObjectStore,
} from './store.ts';

const BUCKET = 'objects';

/**
 * Supabase backend: rows in Postgres, bytes in Storage, identity from Auth.
 * Schema and policies: supabase/migrations. The library is shared: everyone
 * reads everything; you write only what is yours.
 */
export class SupabaseObjectStore implements ObjectStore {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;
  private user: Promise<string> | null = null;

  readonly account: Account;

  constructor(url: string, anonKey: string) {
    // Implicit flow: a magic link opened on another device still signs in.
    this.client = createClient(url, anonKey, {
      auth: { flowType: 'implicit' },
    });
    const client = this.client;
    const identity = (u: {
      id: string;
      email?: string;
      is_anonymous?: boolean;
    }): Identity => ({
      id: u.id,
      email: u.email || undefined,
      anonymous: !!u.is_anonymous || !u.email,
    });
    this.account = {
      get: async () => {
        await this.whoAmI();
        const { data } = await client.auth.getUser();
        if (!data.user) throw new Error('Not signed in');
        return identity(data.user);
      },
      claim: async (email) => {
        const { error } = await client.auth.updateUser(
          { email },
          { emailRedirectTo: location.origin },
        );
        if (error) throw error;
      },
      signIn: async (email) => {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin, shouldCreateUser: true },
        });
        if (error) throw error;
      },
      signOut: async () => {
        await client.auth.signOut();
        this.user = null;
      },
      onChange: (cb) => {
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (!session?.user) return;
          if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
            this.user = Promise.resolve(session.user.id);
            cb(identity(session.user));
          }
        });
        return () => data.subscription.unsubscribe();
      },
    };
  }

  static configured(env: { url?: string; anonKey?: string }): boolean {
    return !!(env.url && env.anonKey);
  }

  /** The signed-in user, signing in anonymously when there is none. */
  whoAmI(): Promise<string> {
    this.user ??= (async () => {
      const { data } = await this.client.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: anon, error } = await this.client.auth.signInAnonymously();
      if (error || !anon.user) throw error ?? new Error('Could not sign in');
      return anon.user.id;
    })();
    return this.user;
  }

  async putObject(o: ClipObject) {
    const { error } = await this.client.from('objects').upsert({
      id: o.id,
      title: o.title,
      brand: o.brand ?? null,
      price_amount: o.price?.amount ?? null,
      price_currency: o.price?.currency ?? null,
      category: o.category ?? null,
      description: o.description ?? null,
      attributes: o.attributes,
      original_image: o.originalImage,
      cutout_image: o.cutoutImage ?? null,
      cutout: o.cutout,
      source: o.source,
      source_host: o.source.host,
      canonical_url: o.source.canonicalUrl ?? null,
      clipped_by: o.clippedBy,
      embedding: o.embedding ?? null,
      created_at: o.createdAt,
      updated_at: o.updatedAt,
    });
    if (error) throw error;
  }

  async getObject(id: string) {
    const { data, error } = await this.client
      .from('objects')
      .select('*')
      .eq('id', id)
      .maybeSingle<ObjectRow>();
    if (error) throw error;
    return data ? rowToObject(data) : undefined;
  }

  async listObjects(filter?: { clippedBy?: string }) {
    let q = this.client
      .from('objects')
      .select('*')
      .order('created_at', { ascending: false });
    if (filter?.clippedBy) q = q.eq('clipped_by', filter.clippedBy);
    const { data, error } = await q.overrideTypes<
      ObjectRow[],
      { merge: false }
    >();
    if (error) throw error;
    return data.map(rowToObject);
  }

  async deleteObject(id: string) {
    const { error } = await this.client.from('objects').delete().eq('id', id);
    if (error) throw error;
  }

  async putBlob(key: string, blob: Blob) {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, blob, { upsert: true, contentType: blob.type });
    if (error) throw error;
  }

  async getBlob(key: string) {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .download(key);
    if (error) return undefined;
    return data;
  }

  async deleteBlob(key: string) {
    const { error } = await this.client.storage.from(BUCKET).remove([key]);
    if (error) throw error;
  }

  /** Public URL for a stored image, so the browser loads it straight. */
  blobUrl(key: string): string {
    return this.client.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  async putCreation(creation: Creation) {
    const c = normalizeCreation(creation);
    const { error } = await this.client.rpc('save_creation', {
      p_id: c.id,
      p_title: c.title,
      p_pieces: c.pieces,
      p_object_ids: c.objectIds,
      p_created_at: c.createdAt,
      p_updated_at: c.updatedAt,
    });
    if (error) throw error;
  }

  async getCreation(id: string) {
    const { data, error } = await this.client
      .from('creations')
      .select('*, creation_objects(object_id)')
      .eq('id', id)
      .maybeSingle<CreationRow>();
    if (error) throw error;
    return data ? rowToCreation(data) : undefined;
  }

  async listCreations(filter?: { ownerId?: string }) {
    let q = this.client
      .from('creations')
      .select('*, creation_objects(object_id)')
      .order('created_at', { ascending: false });
    if (filter?.ownerId) q = q.eq('owner_id', filter.ownerId);
    const { data, error } = await q.overrideTypes<
      CreationRow[],
      { merge: false }
    >();
    if (error) throw error;
    return data.map(rowToCreation);
  }

  async deleteCreation(id: string) {
    const { error } = await this.client.from('creations').delete().eq('id', id);
    if (error) throw error;
  }

  async usedIn(objectId: string) {
    const { data, error } = await this.client
      .from('creations')
      .select('*, creation_objects!inner(object_id)')
      .eq('creation_objects.object_id', objectId)
      .order('created_at', { ascending: false })
      .overrideTypes<CreationRow[], { merge: false }>();
    if (error) throw error;
    // The inner join only returned the matching edge; reload the full set.
    return Promise.all(data.map((r) => this.getCreation(r.id))).then((cs) =>
      cs.filter((c): c is Creation => !!c),
    );
  }

  async usageCounts(objectIds: readonly string[]): Promise<UsageCount[]> {
    if (!objectIds.length) return [];
    const { data, error } = await this.client.rpc('usage_counts', {
      p_object_ids: [...objectIds],
    });
    if (error) throw error;
    const rows = (data ?? []) as { object_id: string; creations: number }[];
    const counts = new Map(rows.map((r) => [r.object_id, Number(r.creations)]));
    return objectIds.map((objectId) => ({
      objectId,
      creations: counts.get(objectId) ?? 0,
    }));
  }
}

type ObjectRow = {
  id: string;
  title: string;
  brand: string | null;
  price_amount: number | string | null;
  price_currency: string | null;
  category: string | null;
  description: string | null;
  attributes: Record<string, string>;
  original_image: ClipObject['originalImage'];
  cutout_image: ClipObject['cutoutImage'] | null;
  cutout: ClipObject['cutout'];
  source: ClipObject['source'];
  clipped_by: string;
  embedding: number[] | string | null;
  created_at: string;
  updated_at: string;
};

type CreationRow = {
  id: string;
  title: string;
  owner_id: string;
  pieces: Creation['pieces'];
  created_at: string;
  updated_at: string;
  creation_objects?: { object_id: string }[];
};

const iso = (t: string) => new Date(t).toISOString();

function rowToObject(r: ObjectRow): ClipObject {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand ?? undefined,
    price:
      r.price_amount !== null && r.price_currency
        ? { amount: Number(r.price_amount), currency: r.price_currency }
        : undefined,
    category: r.category ?? undefined,
    description: r.description ?? undefined,
    attributes: r.attributes ?? {},
    originalImage: r.original_image,
    cutoutImage: r.cutout_image ?? undefined,
    cutout: r.cutout,
    source: r.source,
    clippedBy: r.clipped_by,
    embedding: Array.isArray(r.embedding)
      ? r.embedding
      : typeof r.embedding === 'string'
        ? (JSON.parse(r.embedding) as number[])
        : undefined,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function rowToCreation(r: CreationRow): Creation {
  return normalizeCreation({
    id: r.id,
    title: r.title,
    ownerId: r.owner_id,
    pieces: r.pieces ?? [],
    objectIds: [],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  });
}
