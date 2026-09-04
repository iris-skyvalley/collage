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

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function cardHtml(version: Version, appHtml: string, origin: string): string {
  const image = version.render_hashes.piece
    ? `${origin}/r/${version.render_hashes.piece}`
    : `${origin}/api/versions/${version.id}/card.svg`;
  const title = 'Someone made you a collage';
  const description = `${version.layers.length} pieces, torn and laid down. Open it and change anything.`;

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

/** A placeholder card built from the record itself — the substrate colour and
 *  the layer count — so an unrendered piece still unfurls as something. */
export function placeholderCard(version: Version): string {
  const bg = /^#[0-9a-fA-F]{6}$/.test(version.substrate.colour) ? version.substrate.colour : '#efe7d7';
  const marks = version.layers.slice(0, 12).map((l, i) => {
    const x = (l.transform.x / PIECE.w) * 100;
    const y = (l.transform.y / PIECE.h) * 100;
    const r = Math.max(3, Math.min(22, l.transform.scale * 26));
    return `<circle cx="${x.toFixed(1)}%" cy="${y.toFixed(1)}%" r="${r.toFixed(1)}%" fill="rgba(40,34,26,${(0.1 + (i % 4) * 0.05).toFixed(2)})" />`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIECE.w} ${PIECE.h}" width="${PIECE.w}" height="${PIECE.h}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${marks}
  <text x="50%" y="94%" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="rgba(40,34,26,0.6)">collage</text>
</svg>`;
}
