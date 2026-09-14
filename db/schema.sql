-- Offcut object storage for Cloudflare D1. Image bytes live in R2 under the
-- blob keys referenced here. Apply with:
--   wrangler d1 execute <database> --file db/schema.sql

CREATE TABLE IF NOT EXISTS objects (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  brand          TEXT,
  price_amount   REAL,
  price_currency TEXT,
  category       TEXT,
  description    TEXT,
  attributes     TEXT NOT NULL DEFAULT '{}',   -- JSON object
  original_image TEXT NOT NULL,                -- JSON ImageRef
  cutout_image   TEXT,                         -- JSON ImageRef
  cutout         TEXT NOT NULL,                -- JSON CutoutStatus
  source         TEXT NOT NULL,                -- JSON ObjectSource
  source_host    TEXT NOT NULL,
  canonical_url  TEXT,
  clipped_by     TEXT NOT NULL,
  embedding      TEXT,                         -- JSON number[]
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS objects_clipped_by ON objects (clipped_by, created_at DESC);
CREATE INDEX IF NOT EXISTS objects_canonical ON objects (canonical_url);
CREATE INDEX IF NOT EXISTS objects_host ON objects (source_host);

CREATE TABLE IF NOT EXISTS creations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  pieces     TEXT NOT NULL,                    -- JSON CreationPiece[]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS creations_owner ON creations (owner_id, created_at DESC);

-- The used_in edge. One row per (creation, object) pair.
CREATE TABLE IF NOT EXISTS creation_objects (
  creation_id TEXT NOT NULL REFERENCES creations (id) ON DELETE CASCADE,
  object_id   TEXT NOT NULL REFERENCES objects (id) ON DELETE CASCADE,
  PRIMARY KEY (creation_id, object_id)
);
CREATE INDEX IF NOT EXISTS creation_objects_object ON creation_objects (object_id);
