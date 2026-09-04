/** Uploads, identity, metrics, moderation. Everything that must not block making. */
import { Router } from 'express';
import { CAPS } from '@collage/shared/constants';
import { shortId, token } from '@collage/shared/id';
import { db } from '../db.ts';
import { consume, DAY, HOUR } from '../ratelimit.ts';
import { asyncRoute, context, fail, param, readBody } from '../lib/http.ts';
import { inspectImage, hasClassifier } from '../providers/moderation.ts';

export const miscRouter: Router = Router();

const IMAGE_MIME = /^image\/(png|jpeg|webp)$/;

/** An uploaded fragment's bytes, so a shared piece renders for the recipient.
 *  The version record still only ever holds the reference. */
miscRouter.post('/uploads/:id', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const id = param(req, 'id');
  if (!/^upload\.[A-Za-z0-9]{4,32}$/.test(id)) return fail(res, 400, 'Bad upload id.');

  const limit = consume(`upload:${ctx.session ?? ctx.ip}`, { max: CAPS.uploadsPerSessionPerDay, windowMs: DAY });
  if (!limit.ok) return fail(res, 429, 'That is the upload limit for today.');

  const mime = (req.header('content-type') ?? '').split(';')[0]!.trim();
  if (!IMAGE_MIME.test(mime)) return fail(res, 415, 'Images only.');

  const bytes = await readBody(req, CAPS.maxUploadBytes);
  const verdict = await inspectImage(bytes, mime);
  if (!verdict.allowed) return fail(res, 422, verdict.reason ?? 'That image cannot be used here.');
  if (!verdict.checked) console.warn(`[moderation] upload ${id} stored unchecked (no classifier configured)`);

  db.prepare('INSERT OR REPLACE INTO uploads (id, session, mime, bytes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, ctx.session, mime, bytes, Date.now());
  res.json({ id, url: `/u/${id}` });
}));

/**
 * PRD §8.4 — identity after value. Nothing above this line needs an account;
 * the account exists to tell you who reacted.
 */
miscRouter.post('/claim', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const email = String((req.body as { email?: string })?.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 422, 'That does not look like an email address.');
  const limit = consume(`claim:${ctx.ip}`, { max: 12, windowMs: HOUR });
  if (!limit.ok) return fail(res, 429, 'Too many sign-in attempts from this network.');

  const versionId = (req.body as { version_id?: string })?.version_id ?? null;
  const tok = token(24);
  db.prepare('INSERT INTO claim_tokens (token, email, session, version_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(tok, email, ctx.session, versionId, Date.now() + 30 * 60_000);

  const link = `/api/claim/${tok}`;
  // No password, no profile setup, no onboarding (PRD §8.4). Delivery is a
  // mail provider's job; without one configured the link is logged and, in
  // development only, returned so the flow can be walked end to end.
  console.log(`[claim] ${email} -> ${link}`);
  const dev = process.env['NODE_ENV'] !== 'production';
  res.json({ sent: true, ...(dev ? { dev_link: link } : {}) });
}));

miscRouter.get('/claim/:token', asyncRoute(async (req, res) => {
  const row = db.prepare('SELECT token, email, session, version_id, expires_at FROM claim_tokens WHERE token = ?')
    .get(param(req, 'token')) as
    | { token: string; email: string; session: string | null; version_id: string | null; expires_at: number }
    | undefined;
  if (!row || row.expires_at < Date.now()) return fail(res, 410, 'That sign-in link has expired.');
  db.prepare('DELETE FROM claim_tokens WHERE token = ?').run(row.token);

  let user = db.prepare('SELECT id FROM users WHERE email = ?').get(row.email) as { id: string } | undefined;
  if (!user) {
    const id = shortId(12);
    db.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)').run(id, row.email, Date.now());
    user = { id };
  }
  // Everything the session already made becomes theirs — "claim this" acts on
  // an object that already exists (PRD §7.3).
  if (row.session) {
    db.prepare('UPDATE sessions SET user_id = ? WHERE id = ?').run(user.id, row.session);
    db.prepare('UPDATE versions SET created_by = ? WHERE created_by = ?').run(user.id, row.session);
  }
  res.redirect(row.version_id ? `/v/${row.version_id}?claimed=1` : '/?claimed=1');
}));

miscRouter.get('/me', asyncRoute(async (req, res) => {
  const ctx = context(req);
  if (!ctx.session) return res.json({ user: null, pieces: 0 });
  const row = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(ctx.session) as { user_id: string | null } | undefined;
  const owner = row?.user_id ?? ctx.session;
  const user = row?.user_id
    ? (db.prepare('SELECT id, email FROM users WHERE id = ?').get(row.user_id) as { id: string; email: string } | undefined)
    : undefined;
  const pieces = (db.prepare('SELECT COUNT(*) AS n FROM versions WHERE created_by = ?').get(owner) as { n: number }).n;
  const reactions = (db.prepare(
    'SELECT COUNT(*) AS n FROM reactions WHERE version_id IN (SELECT id FROM versions WHERE created_by = ?)',
  ).get(owner) as { n: number }).n;
  res.json({ user: user ?? null, pieces, reactions });
}));

/** PRD §11 — instrumentation. Best-effort by design: it must never be able to
 *  fail a session, so a malformed batch is dropped rather than rejected. */
miscRouter.post('/events', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const events = (req.body as { events?: unknown[] })?.events;
  if (!Array.isArray(events)) return res.json({ ok: true });
  const insert = db.prepare('INSERT INTO events (name, entry, session, version_id, props, at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const raw of events.slice(0, 50)) {
    const e = raw as { name?: string; entry?: string; version_id?: string | null; props?: unknown; at?: number };
    if (typeof e.name !== 'string') continue;
    try {
      insert.run(
        e.name.slice(0, 48),
        e.entry === 'link' ? 'link' : 'cold',
        ctx.session,
        typeof e.version_id === 'string' ? e.version_id : null,
        e.props ? JSON.stringify(e.props).slice(0, 2000) : null,
        typeof e.at === 'number' ? e.at : Date.now(),
      );
    } catch { /* one bad event is not worth a 500 */ }
  }
  res.json({ ok: true });
}));

miscRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    moderation_classifier: hasClassifier(),
    versions: (db.prepare('SELECT COUNT(*) AS n FROM versions').get() as { n: number }).n,
  });
});
