/** PRD §8.2 — themed, finite, pre-warmed, cached. Never a search box. */
import { Router } from 'express';
import { CAPS, TRAY_TARGET, isThemeId } from '@collage/shared/constants';
import { consume, HOUR, DAY } from '../ratelimit.ts';
import { asyncRoute, context, fail, param } from '../lib/http.ts';
import { getPool, getVariants, fragmentSvg, type TrayAsset } from '../providers/generation.ts';
import { archiveItems, archiveEnabled, type ArchiveItem } from '../archive.ts';

export const trayRouter: Router = Router();

const TRAY_SIZE = Math.min(TRAY_TARGET.max, Math.max(TRAY_TARGET.min, Number(process.env['TRAY_SIZE'] ?? 60)));

trayRouter.get('/tray', asyncRoute(async (req, res) => {
  const theme = String(req.query['theme'] ?? '');
  if (!isThemeId(theme)) return fail(res, 400, 'Unknown theme.');
  const generation = Math.max(0, Math.min(64, Number(req.query['generation'] ?? 0) | 0));

  const generated = await getPool(theme, TRAY_SIZE, generation);
  // Archive items are additive and never block the tray: if the collections
  // are slow or unreachable, the generated pool is already a full tray.
  const archive = archiveEnabled() ? await archiveItems(theme).catch(() => []) : [];

  const items = interleave<TrayAsset | ArchiveItem>(generated, archive).slice(0, TRAY_TARGET.max);
  // The pool is deterministic in (theme, generation), so it caches hard.
  res.set('cache-control', 'public, max-age=600');
  res.json({ items, source: archive.length ? 'generated+archive' : 'generated' });
}));

/** PRD §8.2 — "One 'more like this' action per item." This is the one call in
 *  the tray that costs money with a hosted provider, so it is the one that is
 *  capped per session and per IP. */
trayRouter.get('/tray/variants', asyncRoute(async (req, res) => {
  const ctx = context(req);
  const id = String(req.query['id'] ?? '');
  if (!/^[a-z]+\.[a-z]+\.\d+$/.test(id)) return fail(res, 400, 'Unknown fragment.');

  const perSession = consume(`gen:s:${ctx.session ?? ctx.ip}`, { max: CAPS.generationsPerSessionPerDay, windowMs: DAY });
  if (!perSession.ok) {
    return fail(res, 429, 'That is the limit of new pieces for today. The tray you have is still yours.');
  }
  const perIp = consume(`gen:ip:${ctx.ip}`, { max: CAPS.generationsPerIpPerHour, windowMs: HOUR });
  if (!perIp.ok) return fail(res, 429, 'Too many requests from this network right now.');

  const salt = Math.max(0, Math.min(9999, Number(req.query['salt'] ?? 1) | 0));
  res.json({ items: await getVariants(id, salt, 4) });
}));

/** Fragments are addressed by a seed, so this is immutable and cacheable
 *  forever — which is most of what keeps the generated tray affordable. */
trayRouter.get('/fragment/:id.svg', asyncRoute(async (req, res) => {
  const id = param(req, 'id');
  const svg = fragmentSvg(id);
  if (!svg) return fail(res, 404, 'No such fragment.');
  res.set('content-type', 'image/svg+xml; charset=utf-8');
  res.set('cache-control', 'public, max-age=31536000, immutable');
  res.send(svg);
}));

function interleave<T>(a: T[], b: T[]): T[] {
  if (!b.length) return a;
  const out: T[] = [];
  const ratio = Math.max(2, Math.round(a.length / Math.max(1, b.length)));
  let bi = 0;
  for (let i = 0; i < a.length; i++) {
    out.push(a[i]!);
    if ((i + 1) % ratio === 0 && bi < b.length) out.push(b[bi++]!);
  }
  while (bi < b.length) out.push(b[bi++]!);
  return out;
}
