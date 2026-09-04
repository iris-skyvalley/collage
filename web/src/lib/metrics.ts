/**
 * PRD §11 — the metrics, and the one rule about them: "Segment every one of
 * these by entry path." Every event carries `entry`, so no number here can be
 * read blended by accident.
 */
import { api, sessionId } from './api.ts';
import type { EntryPath } from '@collage/shared/constants';

export type MetricName =
  | 'session_start'        // denominator for nothing on its own
  | 'canvas_touched'       // denominator for completion rate
  | 'first_change'         // time to first change (metric 4)
  | 'export'               // completion rate (metric 1)
  | 'share'                // send rate (metric 2)
  | 'share_included_replay' // replay share share (metric 3)
  | 'link_opened'          // the other half of send rate
  | 'recipient_created'    // recipient creation rate (metric 5)
  | 'verb_applied'         // instrumented, not optimised
  | 'layer_count'
  | 'tray_source'
  | 'generation_cost';

interface Event {
  name: MetricName;
  entry: EntryPath;
  session: string;
  at: number;
  version_id?: string | null;
  props?: Record<string, string | number | boolean | null>;
}

let entry: EntryPath = 'cold';
let queue: Event[] = [];
let timer: number | undefined;
let firstChangeSent = false;
const startedAt = Date.now();

export function setEntryPath(path: EntryPath): void {
  entry = path;
}

export function track(name: MetricName, props?: Event['props'], versionId?: string | null): void {
  queue.push({ name, entry, session: sessionId(), at: Date.now(), version_id: versionId ?? null, props });
  clearTimeout(timer);
  timer = setTimeout(flush, 1500) as unknown as number;
  if (queue.length >= 20) flush();
}

/** Metric 4 — time to first change, the read on whether the entry point works. */
export function trackFirstChange(): void {
  if (firstChangeSent) return;
  firstChangeSent = true;
  track('first_change', { ms_since_load: Date.now() - startedAt });
}

export function flush(): void {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  // Delivery is best-effort: instrumentation must never block or break making.
  const body = JSON.stringify({ events: batch });
  if (navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) return;
  api.events(batch).catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
