/**
 * One SQLite file, no external service. `node:sqlite` ships with the runtime,
 * so there is no native build step and no database to stand up before the
 * first person can make something.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const file = process.env['DATABASE_FILE'] ?? 'data/collage.db';
if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS versions (
  id            TEXT PRIMARY KEY,
  -- PRD §9: written from day one, never read in v1. The riff layer attaches
  -- by reading versions and writing children; without these it cannot.
  parent_id     TEXT,
  root_id       TEXT,
  created_by    TEXT,
  theme         TEXT NOT NULL,
  doc           TEXT NOT NULL,   -- substrate, palette, ordered layers, verbs
  render_hashes TEXT NOT NULL DEFAULT '{}',
  recipient     TEXT,            -- §13 Q3: carried, never read in v1
  takedown      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_parent ON versions(parent_id);
CREATE INDEX IF NOT EXISTS versions_root   ON versions(root_id);
CREATE INDEX IF NOT EXISTS versions_author ON versions(created_by);

CREATE TABLE IF NOT EXISTS renders (
  hash       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,
  session    TEXT,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  first_seen INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_tokens (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  session    TEXT,
  version_id TEXT,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  session    TEXT,
  kind       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reactions_version ON reactions(version_id);

CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  session    TEXT,
  reason     TEXT NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  entry      TEXT NOT NULL,   -- PRD §11: every metric is segmented by this
  session    TEXT,
  version_id TEXT,
  props      TEXT,
  at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_name_entry ON events(name, entry, at);

CREATE TABLE IF NOT EXISTS counters (
  key    TEXT NOT NULL,
  window INTEGER NOT NULL,
  count  INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
`);

export function touchSession(id: string | null): void {
  if (!id) return;
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, first_seen, last_seen) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`,
  ).run(id, now, now);
}
