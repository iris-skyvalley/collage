/**
 * PRD §6.3 — "OG/Twitter card renders the piece at the correct ratio with a
 * static preview."
 *
 * The card is served from the version's stored `piece` render. Until one
 * exists the card falls back to a generated placeholder rather than a broken
 * image, because the link is minted before the renders are pushed and a link
 * pasted in that window still has to unfurl.
 */
import { PIECE } from '@collage/shared/constants';
import type { Version } from '@collage/shared/version';
import { encodePngRgb } from './lib/png.ts';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function cardHtml(version: Version, appHtml: string, origin: string): string {
  const image = version.render_hashes.piece
    ? `${origin}/r/${version.render_hashes.piece}`
    : `${origin}/api/versions/${version.id}/card.png`;
  const title = 'Someone made you a collage';
  const n = version.layers.length;
  const description = `${n} ${n === 1 ? 'piece' : 'pieces'}, torn and laid down. Open it and change anything.`;

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(`${origin}/v/${version.id}`)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="${PIECE.w}" />`,
    `<meta property="og:image:height" content="${PIECE.h}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ].join('\n    ');

  return appHtml.replace('</head>', `    ${tags}\n  </head>`);
}

/**
 * A placeholder card, drawn from the record itself — the substrate colour and
 * where the layers sit. The link is minted before the renders are pushed, and
 * a link pasted in that window still has to unfurl into something.
 */
export function placeholderCard(version: Version): Buffer {
  const w = PIECE.w, h = PIECE.h;
  const [br, bg, bb] = parseHex(version.substrate.colour);
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    px[i * 3] = br;
    px[i * 3 + 1] = bg;
    px[i * 3 + 2] = bb;
  }

  // One soft mark per layer, at its own place and size: enough for the card to
  // read as this particular piece rather than as a generic brand tile.
  for (const layer of version.layers.slice(0, 20)) {
    const cx = layer.transform.x;
    const cy = layer.transform.y;
    const radius = Math.max(24, Math.min(w * 0.42, (layer.fragment_ref.w ?? 512) * layer.transform.scale * 0.42));
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        const a = (1 - d * d) * 0.34;
        const i = (y * w + x) * 3;
        px[i] = px[i]! * (1 - a) + 46 * a;
        px[i + 1] = px[i + 1]! * (1 - a) + 40 * a;
        px[i + 2] = px[i + 2]! * (1 - a) + 32 * a;
      }
    }
  }

  // A drawn border, so the card reads as a sheet with edges.
  const edge = 14;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (d >= edge) continue;
      const a = (1 - d / edge) * 0.4;
      const i = (y * w + x) * 3;
      px[i] = px[i]! * (1 - a) + 34 * a;
      px[i + 1] = px[i + 1]! * (1 - a) + 30 * a;
      px[i + 2] = px[i + 2]! * (1 - a) + 24 * a;
    }
  }

  return encodePngRgb(px, w, h);
}

const parseHex = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [239, 231, 215];
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
