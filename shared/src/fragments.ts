/**
 * The tray's fragments: fashion flats.
 *
 * Every fragment is a deterministic function of its id, which is what makes
 * the tray cacheable and pre-warmable rather than regenerated per user, and
 * what lets the browser produce the same bytes the server would. The same
 * generators serve the static tray, the server's pools, "more like this",
 * and the client's offline fallback.
 *
 * Fragments are pre-cut: transparent ground, no box, an outline so a white
 * tee still reads on a white sheet. The edge verb owns the boundary.
 */
import type { ThemeId } from './constants.ts';
import { INK, WARDROBE, METALS, LEATHERS } from './palettes.ts';
import { rand, type Rand } from './rng.ts';
import { closedSpline, openSpline, polygon, fmt, mixHex, type Pt } from './geom.ts';

export interface FragmentSpec {
  id: string;
  theme: ThemeId;
  family: string;
  name: string;
  w: number;
  h: number;
  svg: string;
}

interface Ctx { r: Rand; uid: string }
type Gen = (c: Ctx) => { w: number; h: number; body: string; defs?: string };

// --- drawing helpers --------------------------------------------------------

const SW = 3.5;
type Attrs = Record<string, string | number>;
/** Later keys win, so an override never produces a duplicate attribute —
 *  which is well-formed HTML and malformed XML, and an SVG in an <img> is XML. */
const attrs = (base: Attrs, extra: Attrs): string =>
  Object.entries({ ...base, ...extra }).map(([k, v]) => `${k}="${v}"`).join(' ');
const line = (d: string, extra: Attrs = {}): string =>
  `<path ${attrs({ d, fill: 'none', stroke: INK, 'stroke-width': SW, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, extra)}/>`;
const shape = (d: string, fill: string, extra: Attrs = {}): string =>
  `<path ${attrs({ d, fill, stroke: INK, 'stroke-width': SW, 'stroke-linejoin': 'round' }, extra)}/>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0, extra: Attrs = {}): string =>
  `<rect ${attrs({ x: fmt(x), y: fmt(y), width: fmt(w), height: fmt(h), rx, fill, stroke: INK, 'stroke-width': SW }, extra)}/>`;
const circle = (cx: number, cy: number, r: number, fill: string, extra: Attrs = {}): string =>
  `<circle ${attrs({ cx: fmt(cx), cy: fmt(cy), r: fmt(r), fill, stroke: INK, 'stroke-width': SW }, extra)}/>`;
const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, extra: Attrs = {}): string =>
  `<ellipse ${attrs({ cx: fmt(cx), cy: fmt(cy), rx: fmt(rx), ry: fmt(ry), fill, stroke: INK, 'stroke-width': SW }, extra)}/>`;

const shade = (hex: string, k = 0.18): string => mixHex(hex, '#000000', k);
const tint = (hex: string, k = 0.25): string => mixHex(hex, '#ffffff', k);
const mirror = (pts: Pt[], cx: number): Pt[] => [...pts, ...[...pts].reverse().map(([x, y]) => [cx - (x - cx), y] as Pt)];

/** A textile pattern, or a plain fill. Patterns are what make a tray of flats
 *  read as clothes rather than as icons. */
function fabric(c: Ctx, base: string, chance = 0.4): { fill: string; defs: string } {
  const { r, uid } = c;
  if (!r.chance(chance)) return { fill: base, defs: '' };
  const id = `f${uid}`;
  const kind = r.pick(['stripe', 'dot', 'check', 'pin', 'floral'] as const);
  const ink = r.chance(0.5) ? shade(base, 0.35) : tint(base, 0.6);
  let inner = '';
  let size = 24;
  switch (kind) {
    case 'stripe': size = r.pick([18, 26, 34]); inner = `<rect width="${size}" height="${size}" fill="${base}"/><rect width="${size}" height="${size * 0.4}" fill="${ink}"/>`; break;
    case 'pin': size = 14; inner = `<rect width="14" height="14" fill="${base}"/><rect width="2" height="14" fill="${ink}"/>`; break;
    case 'dot': size = r.pick([22, 30]); inner = `<rect width="${size}" height="${size}" fill="${base}"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.16}" fill="${ink}"/>`; break;
    case 'check': size = r.pick([28, 40]); inner = `<rect width="${size}" height="${size}" fill="${base}"/><rect width="${size / 2}" height="${size / 2}" fill="${ink}" opacity="0.5"/><rect x="${size / 2}" y="${size / 2}" width="${size / 2}" height="${size / 2}" fill="${ink}" opacity="0.5"/>`; break;
    case 'floral': size = 44; inner = `<rect width="44" height="44" fill="${base}"/>` +
      [[11, 11], [33, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="${ink}"/><circle cx="${x}" cy="${y}" r="2.5" fill="${base}"/>`).join('') +
      `<circle cx="30" cy="9" r="2" fill="${ink}"/><circle cx="8" cy="36" r="2" fill="${ink}"/>`; break;
  }
  const rot = kind === 'stripe' ? r.pick([0, 90, 45]) : 0;
  return {
    fill: `url(#${id})`,
    defs: `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">${inner}</pattern>`,
  };
}

const buttons = (x: number, y0: number, y1: number, n: number, col = METALS[1]!): string =>
  Array.from({ length: n }, (_, i) => circle(x, y0 + ((y1 - y0) * i) / Math.max(1, n - 1), 5, col)).join('');

// --- tops -------------------------------------------------------------------

const tee: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const { fill, defs } = fabric(c, c.r.pick(WARDROBE));
  const half: Pt[] = [[206, 116], [150, 132], [98, 226], [124, 244], [170, 214], [160, 430], [256, 430]];
  return {
    w, h, defs,
    body: shape(polygon(mirror(half, cx)), fill) + line('M 206 116 Q 256 166 306 116') +
      line('M 170 214 L 160 430', { opacity: 0.25 }) + line('M 342 214 L 352 430', { opacity: 0.25 }),
  };
};

const blouse: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.55);
  const half: Pt[] = [[216, 110], [156, 128], [112, 330], [148, 340], [172, 232], [166, 440], [256, 440]];
  return {
    w, h, defs,
    body: shape(polygon(mirror(half, cx)), fill) +
      shape('M 216 110 L 256 170 L 296 110 L 276 98 L 256 130 L 236 98 Z', tint(base, 0.15)) +
      buttons(256, 190, 410, 5) + line('M 112 330 L 148 340'),
  };
};

const sweater: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.35);
  const half: Pt[] = [[204, 118], [146, 136], [96, 340], [140, 350], [170, 236], [164, 420], [256, 420]];
  const rib = (x0: number, x1: number, y: number): string =>
    Array.from({ length: 14 }, (_, i) => line(`M ${fmt(x0 + ((x1 - x0) * i) / 13)} ${y} v 18`, { opacity: 0.45 })).join('');
  return {
    w, h, defs,
    body: shape(polygon(mirror(half, cx)), fill) + shape('M 204 118 Q 256 150 308 118 Q 256 176 204 118 Z', shade(base, 0.1)) +
      rect(164, 420, 184, 22, fill) + rib(170, 342, 420) + rect(96, 340, 44, 20, fill, 0, { transform: 'rotate(-78 118 350)' }) +
      rect(372, 340, 44, 20, fill, 0, { transform: 'rotate(78 394 350)' }),
  };
};

const tank: Gen = (c) => {
  const w = 512, h = 512;
  const { fill, defs } = fabric(c, c.r.pick(WARDROBE), 0.35);
  // Scooped neck, scooped armholes, straps: the shape is the openings.
  const d = 'M 176 60 L 202 60 Q 256 172 310 60 L 336 60 Q 296 150 346 184 L 338 432 L 174 432 L 166 184 Q 216 150 176 60 Z';
  return { w, h, defs, body: shape(d, fill) };
};

// --- bottoms ----------------------------------------------------------------

const trousers: Gen = (c) => {
  const w = 512, h = 512;
  const denim = c.r.chance(0.5);
  const base = denim ? c.r.pick(['#3f5f85', '#1f2a44', '#6f8fae', '#1c1c1e', '#d9d2c4']) : c.r.pick(WARDROBE);
  const flare = c.r.range(-8, 22);
  const left: Pt[] = [[172, 96], [340, 96], [340, 128], [368 + flare, 480], [276, 480], [256, 250], [236, 480], [144 - flare, 480], [172, 128]];
  return {
    w, h,
    body: shape(polygon(left), base) + rect(172, 96, 168, 32, shade(base, 0.08)) + line('M 256 128 L 256 250', { opacity: 0.5 }) +
      line('M 172 140 Q 210 150 214 190', { opacity: 0.5 }) + line('M 340 140 Q 302 150 298 190', { opacity: 0.5 }) +
      (denim ? line('M 148 470 H 232', { opacity: 0.35 }) + line('M 280 470 H 364', { opacity: 0.35 }) : ''),
  };
};

const skirtA: Gen = (c) => {
  const w = 512, h = 512;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.5);
  const pleats = c.r.chance(0.5);
  return {
    w, h, defs,
    body: shape(polygon([[190, 118], [322, 118], [384, 408], [128, 408]]), fill) + rect(190, 96, 132, 24, shade(base, 0.08)) +
      (pleats ? [0.2, 0.4, 0.6, 0.8].map((t) => line(`M ${fmt(190 + 132 * t)} 120 L ${fmt(128 + 256 * t)} 408`, { opacity: 0.3 })).join('') : ''),
  };
};

const skirtPencil: Gen = (c) => {
  const w = 512, h = 512;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.35);
  return {
    w, h, defs,
    body: shape(polygon([[184, 112], [328, 112], [334, 300], [318, 456], [194, 456], [178, 300]]), fill) + rect(184, 92, 144, 22, shade(base, 0.08)) +
      line('M 256 380 L 256 456', { opacity: 0.4 }),
  };
};

const shorts: Gen = (c) => {
  const w = 512, h = 360;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.35);
  return {
    w, h, defs,
    body: shape(polygon([[168, 60], [344, 60], [344, 92], [372, 300], [276, 300], [256, 200], [236, 300], [140, 300], [168, 92]]), fill) +
      rect(168, 60, 176, 32, shade(base, 0.08)) + line('M 256 92 L 256 200', { opacity: 0.5 }),
  };
};

// --- dresses ----------------------------------------------------------------

const shiftDress: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.5);
  const half: Pt[] = [[204, 60], [160, 74], [130, 170], [166, 180], [166, 250], [130, 470], [256, 470]];
  return { w, h, defs, body: shape(polygon(mirror(half, cx)), fill) + line('M 204 60 Q 256 104 308 60') };
};

const slipDress: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(['#1c1c1e', '#e5b3a6', '#7a4b6e', '#2f5d3a', '#ece4d2', '#b5342a', '#1f2a44']);
  const half: Pt[] = [[204, 40], [198, 40], [180, 140], [186, 300], [150, 480], [256, 480]];
  return {
    w, h,
    body: shape(polygon(mirror(half, cx)), base) + line('M 204 40 L 256 150 L 308 40') + line('M 180 140 L 256 150 L 332 140', { opacity: 0.5 }),
  };
};

const wrapDress: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.6);
  const half: Pt[] = [[190, 62], [150, 76], [104, 220], [142, 232], [166, 200], [160, 240], [110, 500], [256, 500]];
  return {
    w, h, defs,
    body: shape(polygon(mirror(half, cx)), fill) + line('M 190 62 L 256 210 L 322 62') + line('M 166 240 H 346', { opacity: 0.6 }) +
      line('M 256 240 Q 236 300 262 340', { opacity: 0.5 }),
  };
};

// --- outerwear --------------------------------------------------------------

const trench: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(['#c6a27a', '#ece4d2', '#1c1c1e', '#1f2a44', '#6b7048', '#5a3e2b']);
  const half: Pt[] = [[196, 60], [140, 74], [96, 360], [140, 366], [166, 250], [144, 490], [256, 490]];
  return {
    w, h,
    body: shape(polygon(mirror(half, cx)), base) +
      shape('M 196 60 L 256 200 L 316 60 L 300 48 L 256 150 L 212 48 Z', shade(base, 0.12)) +
      rect(160, 264, 192, 22, shade(base, 0.1)) + rect(246, 260, 20, 30, base, 2) +
      buttons(232, 220, 400, 3) + buttons(280, 220, 400, 3) +
      line('M 166 250 L 144 490', { opacity: 0.25 }) + line('M 346 250 L 368 490', { opacity: 0.25 }),
  };
};

const blazer: Gen = (c) => {
  const w = 512, h = 512, cx = 256;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.3);
  const half: Pt[] = [[200, 70], [144, 84], [100, 340], [142, 348], [170, 240], [168, 430], [256, 430]];
  return {
    w, h, defs,
    body: shape(polygon(mirror(half, cx)), fill) +
      shape('M 200 70 L 256 250 L 312 70 L 292 58 L 256 170 L 220 58 Z', shade(base, 0.14)) +
      circle(256, 290, 6, METALS[1]!) + line('M 180 330 h 40', { opacity: 0.5 }) + line('M 292 330 h 40', { opacity: 0.5 }),
  };
};

const puffer: Gen = (c) => {
  const w = 512, h = 512;
  const base = c.r.pick(['#1c1c1e', '#6b7048', '#b5342a', '#ece4d2', '#2c4fa3', '#d3a53a', '#e5b3a6']);
  const quilt = (x0: number, x1: number, y0: number, y1: number, n: number): string =>
    Array.from({ length: n - 1 }, (_, i) => line(`M ${x0} ${fmt(y0 + ((y1 - y0) * (i + 1)) / n)} Q ${fmt((x0 + x1) / 2)} ${fmt(y0 + ((y1 - y0) * (i + 1)) / n + 8)} ${x1} ${fmt(y0 + ((y1 - y0) * (i + 1)) / n)}`, { opacity: 0.55 })).join('');
  // Sleeves as continuous quilted columns behind the body, not stacked pills.
  let out = rect(84, 118, 76, 280, base, 34) + quilt(90, 154, 118, 398, 6) + rect(352, 118, 76, 280, base, 34) + quilt(358, 422, 118, 398, 6);
  out += rect(146, 104, 220, 344, base, 30) + quilt(150, 362, 104, 448, 7);
  out += shape('M 196 104 L 208 66 Q 256 84 304 66 L 316 104 Z', shade(base, 0.12));
  out += line('M 256 104 L 256 448', { opacity: 0.7 }) + line('M 256 104 L 256 448', { 'stroke-dasharray': '3 6', stroke: '#ffffff', opacity: 0.5 });
  return { w, h, body: out };
};

const denimJacket: Gen = (c) => {
  const w = 512, h = 460, cx = 256;
  const base = c.r.pick(['#3f5f85', '#6f8fae', '#1f2a44', '#d9d2c4', '#1c1c1e']);
  const half: Pt[] = [[204, 60], [148, 76], [104, 300], [146, 308], [170, 220], [166, 380], [256, 380]];
  return {
    w, h,
    body: shape(polygon(mirror(half, cx)), base) + shape('M 204 60 L 232 96 L 256 76 L 280 96 L 308 60 L 292 48 L 256 62 L 220 48 Z', shade(base, 0.1)) +
      rect(184, 160, 52, 56, base, 4) + rect(276, 160, 52, 56, base, 4) + buttons(256, 110, 350, 5) +
      rect(166, 350, 180, 30, shade(base, 0.08)) + line('M 210 160 h 0'),
  };
};

// --- shoes ------------------------------------------------------------------

const sneaker: Gen = (c) => {
  const w = 512, h = 300;
  const base = c.r.pick(['#f6f3ec', '#f6f3ec', '#1c1c1e', '#9d9a94', '#b5342a', '#2c4fa3', '#e5b3a6', '#6b7048']);
  const sole = c.r.pick(['#f6f3ec', '#d9d2c4', '#1c1c1e']);
  // Sole, then the upper: a collar at the ankle, a tongue, a toe box that
  // drops to the sole. The eyelet row and the toe cap are what say "sneaker".
  const top = openSpline([[64, 212], [72, 138], [118, 100], [196, 98], [262, 86], [334, 108], [410, 150], [472, 206]] as Pt[]);
  return {
    w, h,
    body: rect(36, 206, 444, 46, sole, 22) + rect(36, 230, 444, 22, shade(sole, 0.25), 11) +
      shape(`${top} L 472 214 L 64 214 Z`, base) +
      shape('M 372 130 Q 430 160 472 206 L 472 214 L 350 214 Z', shade(base, 0.12)) +
      line('M 118 100 Q 150 128 190 118', { opacity: 0.5 }) + line('M 72 138 Q 100 190 110 214', { opacity: 0.35 }) +
      [0, 1, 2, 3, 4].map((i) => line(`M ${206 + i * 28} ${104 + i * 9} l 22 ${8 - (i % 2) * 16}`)).join('') +
      line('M 200 100 L 330 148', { opacity: 0.3 }),
  };
};

const heel: Gen = (c) => {
  const w = 512, h = 320;
  const base = c.r.pick(LEATHERS);
  // A pump in profile: pointed toe to the right, an arch, a tall thin heel.
  const upper = closedSpline([[112, 148], [150, 112], [250, 170], [340, 178], [420, 168], [490, 230], [440, 238], [300, 210], [176, 232], [112, 236]] as Pt[], 0.6);
  return {
    w, h,
    body: shape('M 116 236 L 178 236 L 162 308 L 138 308 Z', shade(base, 0.3)) + shape(upper, base) +
      line('M 150 128 Q 250 196 420 176', { opacity: 0.55 }) + line('M 176 232 Q 300 200 440 238', { opacity: 0.35 }),
  };
};

const boot: Gen = (c) => {
  const w = 400, h = 512;
  const base = c.r.pick(LEATHERS);
  return {
    w, h,
    body: shape('M 120 60 L 250 60 L 254 300 Q 300 320 360 340 Q 380 360 370 400 L 100 400 Q 90 380 110 340 Z', base) +
      shape('M 100 400 L 370 400 L 372 430 L 96 430 Z', shade(base, 0.35)) + shape('M 100 400 L 150 400 L 150 440 L 96 440 Z', shade(base, 0.35)) +
      shape('M 250 60 L 254 300 L 280 300 Q 270 200 268 60 Z', shade(base, 0.12)) + line('M 130 90 Q 190 120 246 92', { opacity: 0.4 }),
  };
};

const loafer: Gen = (c) => {
  const w = 512, h = 260;
  const base = c.r.pick(LEATHERS);
  const upper = closedSpline([[56, 190], [70, 126], [130, 104], [230, 100], [330, 116], [420, 150], [470, 196], [300, 208], [120, 208]] as Pt[], 0.7);
  return {
    w, h,
    body: rect(40, 196, 448, 30, shade(base, 0.35), 12) + shape('M 56 226 L 130 226 L 124 248 L 60 248 Z', shade(base, 0.35)) +
      shape(upper, base) + line('M 130 118 Q 190 150 250 144 Q 320 140 420 154', { opacity: 0.55 }) +
      shape('M 210 138 Q 250 118 300 136 L 300 160 Q 250 146 210 160 Z', shade(base, 0.15)) + rect(240, 134, 28, 12, METALS[0]!, 3),
  };
};

const sandal: Gen = (c) => {
  const w = 512, h = 220;
  const base = c.r.pick(LEATHERS);
  const strap = (d: string): string =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${base}" stroke-width="22" stroke-linecap="round"/>`;
  return {
    w, h,
    body: shape('M 40 150 Q 30 190 80 192 L 460 192 Q 500 190 486 156 Q 400 130 260 130 Q 120 130 40 150 Z', '#d9d2c4') +
      strap('M 120 150 Q 180 76 250 142') + strap('M 300 140 Q 360 66 420 150') + line('M 150 120 Q 300 60 420 128', { opacity: 0.5 }),
  };
};

// --- bags -------------------------------------------------------------------

const tote: Gen = (c) => {
  const w = 460, h = 512;
  const base = c.r.pick(LEATHERS);
  const { fill, defs } = fabric(c, base, 0.25);
  return {
    w, h, defs,
    body: line('M 150 150 Q 150 40 230 40 Q 310 40 310 150') + line('M 176 160 Q 176 70 230 70 Q 284 70 284 160') +
      shape(polygon([[90, 150], [370, 150], [400, 470], [60, 470]]), fill) + line('M 90 150 L 370 150') +
      (c.r.chance(0.5) ? rect(196, 280, 68, 40, shade(base, 0.2), 3) : ''),
  };
};

const shoulderBag: Gen = (c) => {
  const w = 460, h = 480;
  const base = c.r.pick(LEATHERS);
  const { fill, defs } = fabric(c, base, 0.2);
  return {
    w, h, defs,
    body: line('M 110 210 Q 110 40 230 40 Q 350 40 350 210') +
      rect(70, 210, 320, 230, fill, 22) + shape('M 70 232 L 390 232 L 390 330 Q 230 360 70 330 Z', shade(base, 0.12)) +
      rect(208, 300, 44, 26, METALS[0]!, 6),
  };
};

const clutch: Gen = (c) => {
  const w = 512, h = 300;
  const base = c.r.pick(LEATHERS);
  const { fill, defs } = fabric(c, base, 0.3);
  return {
    w, h, defs,
    body: rect(40, 80, 432, 190, fill, 18) + shape('M 40 98 L 472 98 L 472 170 Q 256 196 40 170 Z', shade(base, 0.14)) + circle(256, 172, 12, METALS[0]!),
  };
};

const backpack: Gen = (c) => {
  const w = 420, h = 512;
  const base = c.r.pick(WARDROBE);
  return {
    w, h,
    body: line('M 150 100 Q 150 40 210 40 Q 270 40 270 100') + rect(60, 90, 300, 380, base, 60) +
      rect(100, 300, 220, 140, shade(base, 0.1), 30) + rect(90, 90, 240, 150, shade(base, 0.05), 60) +
      buttons(210, 340, 400, 2, METALS[1]!),
  };
};

// --- accessories ------------------------------------------------------------

const sunglasses: Gen = (c) => {
  const w = 512, h = 220;
  const frame = c.r.pick(['#1c1c1e', '#5a3e2b', '#c6a27a', '#b5342a', '#d9d2c4']);
  const lens = c.r.pick(['#3a3a3f', '#6b4a3a', '#2f4a5e', '#8c8c8c']);
  const style = c.r.pick(['round', 'square', 'cat'] as const);
  const lensAt = (cx: number, flip: number): string => {
    const f = { stroke: frame, 'stroke-width': 7 };
    if (style === 'round') return circle(cx, 120, 62, lens, f);
    if (style === 'square') return rect(cx - 66, 62, 132, 112, lens, 14, f);
    return shape(`M ${cx - 70} 120 Q ${cx - 66} 60 ${cx + 10 * flip} 74 L ${cx + 72 * flip} 62 Q ${cx + 70 * flip} 170 ${cx} 176 Q ${cx - 66} 174 ${cx - 70} 120 Z`, lens, f);
  };
  return {
    w, h,
    body: lensAt(160, 1) + `<g transform="translate(512 0) scale(-1 1)">${lensAt(160, 1)}</g>` +
      line('M 222 110 Q 256 92 290 110', { stroke: frame, 'stroke-width': 7 }) +
      line('M 96 104 L 30 88', { stroke: frame, 'stroke-width': 7 }) + line('M 416 104 L 482 88', { stroke: frame, 'stroke-width': 7 }),
  };
};

const hat: Gen = (c) => {
  const w = 512, h = 320;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.3);
  const kind = c.r.pick(['bucket', 'beret', 'fedora', 'cap'] as const);
  let body = '';
  switch (kind) {
    case 'bucket': body = shape('M 140 200 L 172 90 Q 256 60 340 90 L 372 200 Z', fill) + shape('M 60 200 Q 256 260 452 200 Q 256 230 60 200 Z', shade(base, 0.12)) + line('M 60 200 Q 256 260 452 200'); break;
    case 'beret': body = shape('M 100 210 Q 90 90 256 80 Q 422 90 412 210 Q 256 240 100 210 Z', fill) + line('M 256 80 l 0 -22') + shape('M 130 206 Q 256 236 382 206 Q 256 224 130 206 Z', shade(base, 0.15)); break;
    case 'fedora': body = shape('M 40 210 Q 256 250 472 210 Q 256 240 40 210 Z', shade(base, 0.12)) + line('M 40 210 Q 256 250 472 210') + shape('M 150 210 L 176 96 Q 256 72 336 96 L 362 210 Z', fill) + rect(150, 178, 212, 22, shade(base, 0.3)); break;
    case 'cap': body = shape('M 120 200 Q 130 80 256 80 Q 382 80 392 200 Z', fill) + shape('M 380 200 Q 470 190 490 230 Q 400 232 370 218 Z', shade(base, 0.12)) + line('M 256 80 L 256 200', { opacity: 0.4 }) + line('M 190 96 Q 200 150 200 200', { opacity: 0.4 }) + line('M 322 96 Q 312 150 312 200', { opacity: 0.4 }); break;
  }
  return { w, h, defs, body };
};

const necklace: Gen = (c) => {
  const w = 400, h = 460;
  const metal = c.r.pick(METALS);
  const stone = c.r.pick(['#2c4fa3', '#b5342a', '#2f5d3a', '#f6f3ec', '#7a4b6e', '#d3a53a']);
  return {
    w, h,
    body: line('M 60 40 Q 60 300 200 330 Q 340 300 340 40', { stroke: metal, 'stroke-width': 6 }) +
      line('M 60 40 Q 60 300 200 330 Q 340 300 340 40', { 'stroke-dasharray': '1 9', 'stroke-width': 7, opacity: 0.5 }) +
      (c.r.chance(0.6) ? shape('M 200 340 L 236 380 L 200 428 L 164 380 Z', stone) : circle(200, 372, 30, stone)),
  };
};

const earrings: Gen = (c) => {
  const w = 400, h = 300;
  const metal = c.r.pick(METALS);
  const hoop = c.r.chance(0.5);
  const one = (cx: number): string =>
    hoop ? circle(cx, 170, 80, 'none', { stroke: metal, 'stroke-width': 10 }) + circle(cx, 78, 8, metal)
      : circle(cx, 70, 12, metal) + line(`M ${cx} 82 L ${cx} 150`, { stroke: metal, 'stroke-width': 5 }) + ellipse(cx, 200, 34, 52, c.r.pick(['#f6f3ec', '#2c4fa3', '#e5b3a6', '#1c1c1e']));
  return { w, h, body: one(110) + one(290) };
};

const ring: Gen = (c) => {
  const w = 300, h = 300;
  const metal = c.r.pick(METALS);
  const stone = c.r.pick(['#f6f3ec', '#2c4fa3', '#b5342a', '#2f5d3a', '#1c1c1e']);
  return { w, h, body: circle(150, 170, 90, 'none', { stroke: metal, 'stroke-width': 22 }) +  shape('M 150 44 L 190 78 L 150 112 L 110 78 Z', stone) };
};

const watch: Gen = (c) => {
  const w = 300, h = 512;
  const strap = c.r.pick(LEATHERS);
  const metal = c.r.pick(METALS);
  const face = c.r.pick(['#f6f3ec', '#1c1c1e', '#1f2a44', '#2f5d3a']);
  return {
    w, h,
    body: rect(110, 30, 80, 452, strap, 14) + circle(150, 256, 96, metal) + circle(150, 256, 80, face) +
      line('M 150 256 L 150 200', { stroke: face === '#f6f3ec' ? INK : '#f6f3ec', 'stroke-width': 5 }) +
      line('M 150 256 L 190 270', { stroke: face === '#f6f3ec' ? INK : '#f6f3ec', 'stroke-width': 5 }) + rect(244, 240, 16, 32, metal, 4),
  };
};

const scarf: Gen = (c) => {
  const w = 512, h = 260;
  const base = c.r.pick(WARDROBE);
  const { fill, defs } = fabric(c, base, 0.7);
  const pts: Pt[] = [[30, 120], [120, 60], [230, 140], [340, 70], [450, 130], [490, 110]];
  return {
    w, h, defs,
    body: shape(openSpline(pts) + ` L 490 170 ` + openSpline([...pts].reverse().map(([x, y]) => [x, y + 60] as Pt)).replace('M', 'L') + ' Z', fill) +
      Array.from({ length: 5 }, (_, i) => line(`M ${30 + i * 4} ${122 + i * 12} l -18 22`)).join(''),
  };
};

const belt: Gen = (c) => {
  const w = 512, h = 160;
  const base = c.r.pick(LEATHERS);
  const metal = c.r.pick(METALS);
  return {
    w, h,
    body: rect(60, 60, 430, 44, base, 6) + rect(40, 46, 70, 72, 'none', 10, { stroke: metal, 'stroke-width': 10 }) +
      line('M 75 46 L 75 118', { stroke: metal, 'stroke-width': 8 }) + [200, 240, 280].map((x) => circle(x, 82, 5, shade(base, 0.4))).join(''),
  };
};

// --- beauty -----------------------------------------------------------------

const lipstick: Gen = (c) => {
  const w = 240, h = 460;
  const tube = c.r.pick(['#1c1c1e', METALS[0]!, '#b5342a', '#f6f3ec', METALS[1]!]);
  const bullet = c.r.pick(['#b5342a', '#c2453f', '#7a2a3a', '#e5b3a6', '#8c2f4a']);
  return {
    w, h,
    body: rect(70, 220, 100, 220, tube, 10) + rect(80, 190, 80, 34, shade(tube, 0.2), 4) +
      shape('M 90 190 L 90 90 Q 90 70 110 62 L 150 106 L 150 190 Z', bullet),
  };
};

const perfume: Gen = (c) => {
  const w = 320, h = 460;
  const glass = c.r.pick(['#e8d9c7', '#dfe6ec', '#f3d3cf', '#e2ebe0', '#e7dfeb']);
  const cap = c.r.pick(['#1c1c1e', METALS[0]!, METALS[1]!, '#f6f3ec']);
  const kind = c.r.pick(['tall', 'round', 'square'] as const);
  const body = kind === 'tall' ? rect(90, 150, 140, 280, glass, 12)
    : kind === 'round' ? circle(160, 300, 120, glass)
    : rect(50, 170, 220, 240, glass, 26);
  return {
    w, h,
    body: body + rect(130, 80, 60, 80, cap, 8) + rect(140, 150, 40, 20, shade(glass, 0.2), 2) + rect(120, 300, 80, 44, '#f6f3ec', 4),
  };
};

const polish: Gen = (c) => {
  const w = 220, h = 400;
  const col = c.r.pick(['#b5342a', '#1c1c1e', '#e5b3a6', '#f6f3ec', '#2f5d3a', '#7a4b6e', '#d3a53a']);
  return { w, h, body: rect(50, 200, 120, 180, col, 26) + rect(80, 40, 60, 170, '#1c1c1e', 10) + rect(94, 205, 32, 20, shade(col, 0.2), 2) };
};

const compact: Gen = (c) => {
  const w = 360, h = 360;
  const shell = c.r.pick([METALS[0]!, '#1c1c1e', '#f6f3ec', '#e5b3a6', METALS[1]!]);
  return {
    w, h,
    body: (c.r.chance(0.5) ? circle(180, 180, 140, shell) : rect(50, 50, 260, 260, shell, 40)) + circle(180, 180, 96, '#dfe6ec') +
      line('M 130 130 L 150 150', { stroke: '#ffffff', 'stroke-width': 6, opacity: 0.8 }),
  };
};

// --- registry ---------------------------------------------------------------

interface Family { key: string; name: string; gen: Gen }

const BY_CATEGORY: Record<Exclude<ThemeId, 'all'>, Family[]> = {
  tops: [
    { key: 'tee', name: 'Tee', gen: tee },
    { key: 'blouse', name: 'Blouse', gen: blouse },
    { key: 'sweater', name: 'Sweater', gen: sweater },
    { key: 'tank', name: 'Tank', gen: tank },
  ],
  bottoms: [
    { key: 'trousers', name: 'Trousers', gen: trousers },
    { key: 'skirt', name: 'Skirt', gen: skirtA },
    { key: 'pencil', name: 'Pencil skirt', gen: skirtPencil },
    { key: 'shorts', name: 'Shorts', gen: shorts },
  ],
  dresses: [
    { key: 'shift', name: 'Shift dress', gen: shiftDress },
    { key: 'slip', name: 'Slip dress', gen: slipDress },
    { key: 'wrap', name: 'Wrap dress', gen: wrapDress },
  ],
  outerwear: [
    { key: 'trench', name: 'Trench', gen: trench },
    { key: 'blazer', name: 'Blazer', gen: blazer },
    { key: 'puffer', name: 'Puffer', gen: puffer },
    { key: 'denim', name: 'Denim jacket', gen: denimJacket },
  ],
  shoes: [
    { key: 'sneaker', name: 'Sneaker', gen: sneaker },
    { key: 'heel', name: 'Heel', gen: heel },
    { key: 'boot', name: 'Boot', gen: boot },
    { key: 'loafer', name: 'Loafer', gen: loafer },
    { key: 'sandal', name: 'Sandal', gen: sandal },
  ],
  bags: [
    { key: 'tote', name: 'Tote', gen: tote },
    { key: 'shoulder', name: 'Shoulder bag', gen: shoulderBag },
    { key: 'clutch', name: 'Clutch', gen: clutch },
    { key: 'backpack', name: 'Backpack', gen: backpack },
  ],
  accessories: [
    { key: 'sunglasses', name: 'Sunglasses', gen: sunglasses },
    { key: 'hat', name: 'Hat', gen: hat },
    { key: 'necklace', name: 'Necklace', gen: necklace },
    { key: 'earrings', name: 'Earrings', gen: earrings },
    { key: 'ring', name: 'Ring', gen: ring },
    { key: 'watch', name: 'Watch', gen: watch },
    { key: 'scarf', name: 'Scarf', gen: scarf },
    { key: 'belt', name: 'Belt', gen: belt },
  ],
  beauty: [
    { key: 'lipstick', name: 'Lipstick', gen: lipstick },
    { key: 'perfume', name: 'Perfume', gen: perfume },
    { key: 'polish', name: 'Nail polish', gen: polish },
    { key: 'compact', name: 'Compact', gen: compact },
  ],
};

/** "All" is every family, in an order that mixes categories rather than
 *  running through each in turn. */
const ALL: Family[] = (() => {
  const lists = Object.values(BY_CATEGORY).map((l) => [...l]);
  const out: Family[] = [];
  while (lists.some((l) => l.length)) for (const l of lists) { const f = l.shift(); if (f) out.push(f); }
  return out;
})();

export const FAMILIES: Record<ThemeId, Family[]> = { all: ALL, ...BY_CATEGORY };

/** The category a family belongs to — ids carry the family, not the tray. */
const CATEGORY_OF: Record<string, ThemeId> = Object.fromEntries(
  Object.entries(BY_CATEGORY).flatMap(([cat, fams]) => fams.map((f) => [f.key, cat as ThemeId])),
);
const FAMILY_BY_KEY: Record<string, Family> = Object.fromEntries(ALL.map((f) => [f.key, f]));

/** A fragment id is its whole seed: `family.n`. */
export function fragmentId(family: string, n: number): string {
  return `${family}.${n}`;
}

export function generateFragment(id: string): FragmentSpec {
  const [familyKey, nRaw] = id.split('.');
  const fam = familyKey ? FAMILY_BY_KEY[familyKey] : undefined;
  if (!fam || nRaw === undefined) throw new Error(`unknown fragment id: ${id}`);
  const r = rand(id);
  const uid = `${familyKey}${nRaw}`;
  const { w, h, body, defs } = fam.gen({ r, uid });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    (defs ? `<defs>${defs}</defs>` : '') +
    `<g>${body}</g></svg>`;
  return { id, theme: CATEGORY_OF[familyKey!]!, family: familyKey!, name: fam.name, w, h, svg };
}

/** A themed, finite tray. Deterministic for a given category+generation, so
 *  the pool can be pre-warmed and cached rather than generated per user. */
export function generateTray(theme: ThemeId, count = 60, generation = 0): FragmentSpec[] {
  const fams = FAMILIES[theme];
  const out: FragmentSpec[] = [];
  for (let i = 0; i < count; i++) {
    const fam = fams[i % fams.length]!;
    out.push(generateFragment(fragmentId(fam.key, generation * 1000 + Math.floor(i / fams.length))));
  }
  return out;
}

/** "More like this" — same family, new seeds. */
export function variantsOf(id: string, n = 4, salt = 0): FragmentSpec[] {
  const [family, num] = id.split('.');
  const base = Number(num ?? 0);
  return Array.from({ length: n }, (_, i) => generateFragment(fragmentId(family!, base + 7919 * (salt + 1) + i + 1)));
}
