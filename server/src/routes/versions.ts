/**
 * PRD §9 — versions are the product of this server. Everything else is
 * decoration around a record that must stay reconstructable.
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import { CAPS } from '@collage/shared/constants';
import { assertVersionContract, parseComposition, type Version } from '@collage/shared/version';
import { shortId } from '@collage/shared/id';
import { db } from '../db.ts';
import { consume, HOUR } from '../ratelimit.ts';
import { asyncRoute, context, fail, param, readBody } from '../lib/http.ts';
import { inspectImage } from '../providers/moderation.ts';

export const versionsRouter: Router = Router();

const RENDER_KINDS = new Set(['piece', 'story', 'replay']);

versionsRouter.post('/versions', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const limit = consume(`versions:s:${ctx.session ?? ctx.ip}`, { max: CAPS.versionsPerSessionPerHour, windowMs: HOUR });
  if (!limit.ok) return fail(res, 429, 'Too many pieces saved from this session in the last hour.');

  const body = req.body as { composition?: unknown };
  let comp;
  try {
    comp = parseComposition(body?.composition);
  } catch (err) {
    return fail(res, 422, (err as Error).message);
  }

  const id = shortId();
  // A rootless version is its own root, so lineage queries never special-case
  // the first piece in a chain.
  const parentId = comp.parent_id;
  let rootId = comp.root_id;
  if (parentId) {
    const parent = db.prepare('SELECT root_id FROM versions WHERE id = ?').get(parentId) as { root_id: string | null } | undefined;
    rootId = parent?.root_id ?? parentId;
  } else {
    rootId = id;
  }

  const version: Version = {
    id,
    parent_id: parentId,
    root_id: rootId,
    created_by: ctx.session,
    theme: comp.theme,
    substrate: comp.substrate,
    palette: comp.palette,
    layers: comp.layers,
    render_hashes: {},
    recipient: comp.recipient,
    created_at: Date.now(),
  };
  assertVersionContract(version);

  db.prepare(
    `INSERT INTO versions (id, parent_id, root_id, created_by, theme, doc, render_hashes, recipient, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
  ).run(
    version.id, version.parent_id, version.root_id, version.created_by, version.theme,
    JSON.stringify({ substrate: version.substrate, palette: version.palette, layers: version.layers }),
    version.recipient, version.created_at,
  );

  res.json({ id, url: `/v/${id}`, parent_id: version.parent_id, root_id: version.root_id });
}));

versionsRouter.get('/versions/:id', asyncRoute(async (req, res) => {
  const version = loadVersion(param(req, 'id'));
  if (!version) return fail(res, 404, 'No such piece.');
  res.json({ version });
}));

/** Renders are content-addressed, so re-saving an unchanged piece stores
 *  nothing new and an OG card can be cached forever. */
versionsRouter.post('/versions/:id/renders/:kind', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const kind = param(req, 'kind');
  if (!RENDER_KINDS.has(kind)) return fail(res, 400, 'Unknown render kind.');
  const row = db.prepare('SELECT id, render_hashes, created_by FROM versions WHERE id = ?').get(param(req, 'id')) as
    | { id: string; render_hashes: string; created_by: string | null }
    | undefined;
  if (!row) return fail(res, 404, 'No such piece.');
  if (row.created_by && ctx.session && row.created_by !== ctx.session) {
    return fail(res, 403, 'That piece belongs to another session.');
  }

  const bytes = await readBody(req, CAPS.maxRenderBytes);
  const mime = req.header('content-type') ?? 'application/octet-stream';
  const verdict = await inspectImage(bytes, mime);
  if (!verdict.allowed) return fail(res, 422, verdict.reason ?? 'rejected');

  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  db.prepare('INSERT OR IGNORE INTO renders (hash, kind, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(hash, kind, mime, bytes, Date.now());

  const hashes = JSON.parse(row.render_hashes || '{}') as Record<string, string>;
  hashes[kind] = hash;
  db.prepare('UPDATE versions SET render_hashes = ? WHERE id = ?').run(JSON.stringify(hashes), row.id);
  res.json({ hash, url: `/r/${hash}` });
}));

versionsRouter.post('/versions/:id/reactions', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const kind = String((req.body as { kind?: string })?.kind ?? '').slice(0, 24) || 'like';
  const exists = db.prepare('SELECT 1 FROM versions WHERE id = ?').get(param(req, 'id'));
  if (!exists) return fail(res, 404, 'No such piece.');
  const limit = consume(`react:${ctx.session ?? ctx.ip}`, { max: 120, windowMs: HOUR });
  if (!limit.ok) return fail(res, 429, 'Slow down.');
  db.prepare('INSERT OR REPLACE INTO reactions (id, version_id, session, kind, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(`${param(req, 'id')}:${ctx.session ?? ctx.ip}:${kind}`, param(req, 'id'), ctx.session, kind, Date.now());
  res.json({ ok: true });
}));

/** PRD §10, Abuse — "abuse reporting on every shared URL". */
versionsRouter.post('/versions/:id/report', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const reason = String((req.body as { reason?: string })?.reason ?? '').slice(0, 500);
  const exists = db.prepare('SELECT 1 FROM versions WHERE id = ?').get(param(req, 'id'));
  if (!exists) return fail(res, 404, 'No such piece.');
  db.prepare('INSERT INTO reports (id, version_id, session, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(shortId(12), param(req, 'id'), ctx.session, reason || 'unspecified', Date.now());
  console.warn(`[report] version=${param(req, 'id')} reason=${JSON.stringify(reason)}`);
  res.json({ ok: true });
}));

export function loadVersion(id: string | undefined): Version | null {
  if (!id) return null;
  const row = db.prepare(
    'SELECT id, parent_id, root_id, created_by, theme, doc, render_hashes, recipient, takedown, created_at FROM versions WHERE id = ?',
  ).get(id) as
    | { id: string; parent_id: string | null; root_id: string | null; created_by: string | null; theme: string; doc: string; render_hashes: string; recipient: string | null; takedown: number; created_at: number }
    | undefined;
  if (!row || row.takedown) return null;
  const doc = JSON.parse(row.doc) as { substrate: Version['substrate']; palette: Version['palette']; layers: Version['layers'] };
  return {
    id: row.id,
    parent_id: row.parent_id,
    root_id: row.root_id,
    created_by: row.created_by,
    theme: row.theme as Version['theme'],
    substrate: doc.substrate,
    palette: doc.palette,
    layers: doc.layers,
    render_hashes: JSON.parse(row.render_hashes || '{}') as Version['render_hashes'],
    recipient: row.recipient,
    created_at: row.created_at,
  };
}
