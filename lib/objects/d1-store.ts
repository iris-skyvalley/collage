import type { ClipObject, Creation, UsageCount } from './schema.ts';
import { normalizeCreation, type ObjectStore } from './store.ts';

/**
 * Cloudflare backend: rows in D1, image bytes in R2. Schema: db/schema.sql.
 *
 * Wire it up in vite.config.ts / hosting.json by naming the d1 and r2
 * bindings; until then the app uses IndexedDB and nothing here runs.
 */
export class D1ObjectStore implements ObjectStore {
  private readonly db: D1Database;
  private readonly bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) {
    this.db = db;
    this.bucket = bucket;
  }

  async putObject(o: ClipObject) {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO objects (
          id, title, brand, price_amount, price_currency, category,
          description, attributes, original_image, cutout_image, cutout,
          source, source_host, canonical_url, clipped_by, embedding,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        o.id,
        o.title,
        o.brand ?? null,
        o.price?.amount ?? null,
        o.price?.currency ?? null,
        o.category ?? null,
        o.description ?? null,
        JSON.stringify(o.attributes),
        JSON.stringify(o.originalImage),
        o.cutoutImage ? JSON.stringify(o.cutoutImage) : null,
        JSON.stringify(o.cutout),
        JSON.stringify(o.source),
        o.source.host,
        o.source.canonicalUrl ?? null,
        o.clippedBy,
        o.embedding ? JSON.stringify(o.embedding) : null,
        o.createdAt,
        o.updatedAt,
      )
      .run();
  }

  async getObject(id: string) {
    const row = await this.db
      .prepare('SELECT * FROM objects WHERE id = ?')
      .bind(id)
      .first<ObjectRow>();
    return row ? rowToObject(row) : undefined;
  }

  async listObjects(filter?: { clippedBy?: string }) {
    const stmt = filter?.clippedBy
      ? this.db
          .prepare(
            'SELECT * FROM objects WHERE clipped_by = ? ORDER BY created_at DESC',
          )
          .bind(filter.clippedBy)
      : this.db.prepare('SELECT * FROM objects ORDER BY created_at DESC');
    const { results } = await stmt.all<ObjectRow>();
    return results.map(rowToObject);
  }

  async deleteObject(id: string) {
    await this.db.prepare('DELETE FROM objects WHERE id = ?').bind(id).run();
  }

  async putBlob(key: string, blob: Blob) {
    await this.bucket.put(key, await blob.arrayBuffer(), {
      httpMetadata: { contentType: blob.type },
    });
  }
  async getBlob(key: string) {
    const obj = await this.bucket.get(key);
    if (!obj) return undefined;
    return new Blob([await obj.arrayBuffer()], {
      type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
    });
  }
  async deleteBlob(key: string) {
    await this.bucket.delete(key);
  }

  async putCreation(creation: Creation) {
    const c = normalizeCreation(creation);
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR REPLACE INTO creations
            (id, title, owner_id, pieces, created_at, updated_at)
           VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          c.id,
          c.title,
          c.ownerId,
          JSON.stringify(c.pieces),
          c.createdAt,
          c.updatedAt,
        ),
      this.db
        .prepare('DELETE FROM creation_objects WHERE creation_id = ?')
        .bind(c.id),
      ...c.objectIds.map((objectId) =>
        this.db
          .prepare(
            'INSERT INTO creation_objects (creation_id, object_id) VALUES (?,?)',
          )
          .bind(c.id, objectId),
      ),
    ]);
  }

  async getCreation(id: string) {
    const row = await this.db
      .prepare('SELECT * FROM creations WHERE id = ?')
      .bind(id)
      .first<CreationRow>();
    return row ? rowToCreation(row) : undefined;
  }

  async listCreations(filter?: { ownerId?: string }) {
    const stmt = filter?.ownerId
      ? this.db
          .prepare(
            'SELECT * FROM creations WHERE owner_id = ? ORDER BY created_at DESC',
          )
          .bind(filter.ownerId)
      : this.db.prepare('SELECT * FROM creations ORDER BY created_at DESC');
    const { results } = await stmt.all<CreationRow>();
    return results.map(rowToCreation);
  }

  async deleteCreation(id: string) {
    await this.db.batch([
      this.db
        .prepare('DELETE FROM creation_objects WHERE creation_id = ?')
        .bind(id),
      this.db.prepare('DELETE FROM creations WHERE id = ?').bind(id),
    ]);
  }

  async usedIn(objectId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT c.* FROM creations c
         JOIN creation_objects co ON co.creation_id = c.id
         WHERE co.object_id = ? ORDER BY c.created_at DESC`,
      )
      .bind(objectId)
      .all<CreationRow>();
    return results.map(rowToCreation);
  }

  async usageCounts(objectIds: readonly string[]): Promise<UsageCount[]> {
    if (!objectIds.length) return [];
    const marks = objectIds.map(() => '?').join(',');
    const { results } = await this.db
      .prepare(
        `SELECT object_id, COUNT(*) AS n FROM creation_objects
         WHERE object_id IN (${marks}) GROUP BY object_id`,
      )
      .bind(...objectIds)
      .all<{ object_id: string; n: number }>();
    const counts = new Map(results.map((r) => [r.object_id, r.n]));
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
  price_amount: number | null;
  price_currency: string | null;
  category: string | null;
  description: string | null;
  attributes: string;
  original_image: string;
  cutout_image: string | null;
  cutout: string;
  source: string;
  clipped_by: string;
  embedding: string | null;
  created_at: string;
  updated_at: string;
};

type CreationRow = {
  id: string;
  title: string;
  owner_id: string;
  pieces: string;
  created_at: string;
  updated_at: string;
};

function rowToObject(r: ObjectRow): ClipObject {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand ?? undefined,
    price:
      r.price_amount !== null && r.price_currency
        ? { amount: r.price_amount, currency: r.price_currency }
        : undefined,
    category: r.category ?? undefined,
    description: r.description ?? undefined,
    attributes: JSON.parse(r.attributes) as Record<string, string>,
    originalImage: JSON.parse(r.original_image) as ClipObject['originalImage'],
    cutoutImage: r.cutout_image
      ? (JSON.parse(r.cutout_image) as ClipObject['cutoutImage'])
      : undefined,
    cutout: JSON.parse(r.cutout) as ClipObject['cutout'],
    source: JSON.parse(r.source) as ClipObject['source'],
    clippedBy: r.clipped_by,
    embedding: r.embedding ? (JSON.parse(r.embedding) as number[]) : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToCreation(r: CreationRow): Creation {
  return normalizeCreation({
    id: r.id,
    title: r.title,
    ownerId: r.owner_id,
    pieces: JSON.parse(r.pieces) as Creation['pieces'],
    objectIds: [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
}
