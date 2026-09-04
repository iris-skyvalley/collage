/**
 * PRD §10, Cost — "Anonymous plus generative means every session spends money
 * with no identity to bill or throttle. Required in v1: per-session and per-IP
 * generation caps."
 *
 * Both, and both persisted, because an in-memory limiter resets on every
 * deploy and a per-session-only limiter is defeated by clearing storage.
 */
import { db } from './db.ts';

export interface Limit {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface LimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export function consume(key: string, limit: Limit, cost = 1): LimitResult {
  const window = Math.floor(Date.now() / limit.windowMs);
  const resetAt = (window + 1) * limit.windowMs;
  const row = db.prepare('SELECT count FROM counters WHERE key = ? AND window = ?').get(key, window) as
    | { count: number }
    | undefined;
  const used = row?.count ?? 0;
  if (used + cost > limit.max) return { ok: false, remaining: 0, resetAt };
  db.prepare(
    `INSERT INTO counters (key, window, count) VALUES (?, ?, ?)
     ON CONFLICT(key, window) DO UPDATE SET count = count + excluded.count`,
  ).run(key, window, cost);
  return { ok: true, remaining: limit.max - used - cost, resetAt };
}

/** Old windows are dead weight; drop them on a slow timer. */
export function sweepCounters(): void {
  const cutoff = Math.floor((Date.now() - 7 * 24 * 3600_000) / 3600_000);
  db.prepare('DELETE FROM counters WHERE window < ?').run(cutoff);
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
