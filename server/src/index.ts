/**
 * The whole server: version records, their renders, the tray, and the short
 * URLs that make a piece shareable.
 */
import express from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from './db.ts';
import { sweepCounters, HOUR } from './ratelimit.ts';
import { errorHandler, fail, param } from './lib/http.ts';
import { versionsRouter, loadVersion } from './routes/versions.ts';
import { trayRouter } from './routes/tray.ts';
import { miscRouter } from './routes/misc.ts';
import { warmPools } from './providers/generation.ts';
import { cardHtml, placeholderCard } from './og.ts';
import { TRAY_TARGET } from '@collage/shared/constants';

const PORT = Number(process.env['PORT'] ?? 8787);
const DIST = join(process.cwd(), 'dist/web');
const DEV_ORIGIN = process.env['DEV_CLIENT_ORIGIN'] ?? 'http://localhost:5173';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '512kb' }));

app.use('/api', versionsRouter);
app.use('/api', trayRouter);
app.use('/api', miscRouter);

/** Renders are content-addressed: the bytes at a hash never change. */
app.get('/r/:hash', (req, res) => {
  const row = db.prepare('SELECT mime, bytes FROM renders WHERE hash = ?').get(param(req, 'hash')) as
    | { mime: string; bytes: Uint8Array }
    | undefined;
  if (!row) return fail(res, 404, 'No such render.');
  res.set('content-type', row.mime);
  res.set('cache-control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(row.bytes));
});

app.get('/u/:id', (req, res) => {
  const row = db.prepare('SELECT mime, bytes FROM uploads WHERE id = ?').get(param(req, 'id')) as
    | { mime: string; bytes: Uint8Array }
    | undefined;
  if (!row) return fail(res, 404, 'No such upload.');
  res.set('content-type', row.mime);
  res.set('cache-control', 'public, max-age=31536000, immutable');
  res.send(Buffer.from(row.bytes));
});

app.get('/api/versions/:id/card.svg', (req, res) => {
  const version = loadVersion(param(req, 'id'));
  if (!version) return fail(res, 404, 'No such piece.');
  res.set('content-type', 'image/svg+xml; charset=utf-8');
  res.set('cache-control', 'public, max-age=300');
  res.send(placeholderCard(version));
});

const hasBuild = existsSync(join(DIST, 'index.html'));
if (hasBuild) app.use(express.static(DIST, { index: false, maxAge: '1h' }));

/**
 * A shared link is the piece, with the card tags injected. The page it loads
 * opens the piece as a *version* — parameters and layer stack — not a flat
 * image (PRD §6.3).
 */
app.get('/v/:id', async (req, res, next) => {
  const version = loadVersion(param(req, 'id'));
  if (!version) {
    // A taken-down or unknown piece is gone, not a broken app shell.
    res.status(404);
  }
  if (!hasBuild) return next();
  try {
    const shell = await readFile(join(DIST, 'index.html'), 'utf8');
    const origin = `${req.protocol}://${req.get('host')}`;
    res.set('content-type', 'text/html; charset=utf-8');
    res.send(version ? cardHtml(version, shell, origin) : shell);
  } catch (err) {
    next(err);
  }
});

app.get(/^\/(?!api|r\/|u\/).*/, async (_req, res, next) => {
  if (!hasBuild) {
    res.status(404).type('text/plain').send(
      `The client is not built. Run \`npm run dev\` (client on ${DEV_ORIGIN}) or \`npm run build\`.`,
    );
    return;
  }
  try {
    res.type('html').send(await readFile(join(DIST, 'index.html'), 'utf8'));
  } catch (err) {
    next(err);
  }
});

app.use(errorHandler);

const trayLimit = Math.min(TRAY_TARGET.max, Math.max(TRAY_TARGET.min, Number(process.env['TRAY_SIZE'] ?? 60)));
const warmed = await warmPools(trayLimit);
sweepCounters();
setInterval(sweepCounters, 6 * HOUR).unref();

app.listen(PORT, () => {
  console.log(`collage server on http://localhost:${PORT}`);
  console.log(`  tray pools warmed: ${warmed} fragments`);
  console.log(`  client: ${hasBuild ? 'dist/web' : `not built — dev client expected on ${DEV_ORIGIN}`}`);
});
