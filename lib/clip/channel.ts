/**
 * How a clip reaches a studio that is already open.
 *
 * The clipper runs on the retailer's page and cannot touch this origin's
 * storage: cross-site iframes are given a partitioned bucket, so the only way
 * to the real library is a window of our own. The receiver tab is that window,
 * and this channel is how it tells the studio what it put there — and how it
 * asks whether a studio is open at all, so it knows to close or to become one.
 */
export const CLIP_CHANNEL = 'offcut:clips';

export type ClipMessage =
  /** The receiver saved a clip. */
  | { type: 'clipped'; id: string; title: string }
  /** Is any studio listening? */
  | { type: 'studio?' }
  /** One is. */
  | { type: 'studio' };

/** The channel, or null where the browser has none. */
export function clipChannel(): BroadcastChannel | null {
  try {
    return 'BroadcastChannel' in globalThis
      ? new BroadcastChannel(CLIP_CHANNEL)
      : null;
  } catch {
    return null;
  }
}
