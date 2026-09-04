/**
 * The tray's fragments (PRD §8.2).
 *
 * Every fragment is authored as a deterministic function of its id, which is
 * what makes the tray cacheable and pre-warmable rather than regenerated per
 * user (PRD §10, Cost). The same generators serve three callers:
 *   - `tools/make-fragments.ts`, which emits the static M0 tray to disk;
 *   - the server's local generation provider, which fills themed pools;
 *   - "more like this", which re-seeds one family (PRD §8.2).
 *
 * Fragments are pre-cut: transparent ground, no bounding box, no white card.
 * The edge verb owns the boundary treatment, so shapes are authored with a
 * clean silhouette and nothing baked in.
 */
import type { ThemeId } from './constants.ts';
import { THEME_INKS, THEME_PAPER } from './palettes.ts';
import { rand, type Rand } from './rng.ts';
import { closedSpline, openSpline, polygon, radialBlob, fmt, mixHex, type Pt } from './geom.ts';

export interface FragmentSpec {
  id: string;
  theme: ThemeId;
  family: string;
  name: string;
  w: number;
  h: number;
  svg: string;
}

interface Ctx {
  r: Rand;
  ink: string[];
  paper: string[];
}

type Gen = (c: Ctx) => { w: number; h: number; body: string };

const S = 512;

// --- shared drawing helpers -------------------------------------------------

function veins(r: Rand, cx: number, top: number, bottom: number, spread: number, n: number, stroke: string): string {
  let out = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const y = top + (bottom - top) * t;
    const reach = spread * Math.sin(Math.PI * t) * r.range(0.7, 1);
    const drop = (bottom - y) * 0.28;
    for (const s of [-1, 1]) {
      out += `<path d="${openSpline([[cx, y], [cx + reach * 0.55 * s, y + drop * 0.5], [cx + reach * s, y + drop]] as Pt[])}" fill="none" stroke="${stroke}" stroke-width="${fmt(r.range(1.4, 2.6))}" stroke-linecap="round" opacity="0.55"/>`;
    }
  }
  return out;
}

// --- herbarium --------------------------------------------------------------

const leaf: Gen = ({ r, ink, paper }) => {
  const w = S, h = S;
  const cx = w / 2, top = 60, bot = h - 50;
  const width = r.range(90, 150);
  const lobes = r.int(0, 7);
  const pts: Pt[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = top + (bot - top) * t;
    const base = Math.sin(Math.PI * Math.pow(t, r.range(0.75, 1.05)));
    const lobe = lobes ? 1 + Math.sin(t * Math.PI * lobes) * 0.16 : 1;
    pts.push([cx + width * base * lobe, y]);
  }
  for (let i = N; i >= 0; i--) {
    const [x, y] = pts[i]!;
    pts.push([cx - (x - cx), y]);
  }
  const body = r.pick(ink.slice(1, 4));
  return {
    w, h,
    body:
      `<path d="${closedSpline(pts.slice(0, N * 2), 0.9)}" fill="${body}" opacity="0.92"/>` +
      `<path d="${closedSpline(pts.slice(0, N * 2), 0.9)}" fill="none" stroke="${ink[0]}" stroke-width="2" opacity="0.5"/>` +
      `<path d="M ${cx} ${top + 4} L ${cx} ${bot - 4}" stroke="${mixHex(body, paper[0]!, 0.55)}" stroke-width="4" stroke-linecap="round"/>` +
      veins(r, cx, top + 30, bot - 20, width * 0.85, r.int(5, 9), mixHex(body, paper[0]!, 0.45)) +
      `<path d="M ${cx} ${bot - 10} q ${r.range(-24, 24)} 34 ${r.range(-8, 8)} 52" fill="none" stroke="${ink[0]}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`,
  };
};

const fern: Gen = ({ r, ink }) => {
  const w = 420, h = S;
  const cx = w / 2;
  const stem: Pt[] = [[cx + r.range(-20, 20), h - 20], [cx + r.range(-30, 30), h * 0.6], [cx + r.range(-40, 40), 40]];
  const col = r.pick(ink.slice(1, 4));
  let out = `<path d="${openSpline(stem)}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"/>`;
  const n = r.int(7, 11);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y = h - 40 - (h - 90) * t;
    const x = cx + (stem[1]![0] - cx) * Math.sin(Math.PI * t) * 0.7;
    const len = (1 - t) * r.range(70, 120) + 26;
    const droop = r.range(10, 30);
    for (const s of [-1, 1]) {
      const tip: Pt = [x + len * s, y + droop];
      out += `<path d="${openSpline([[x, y], [x + len * 0.5 * s, y + droop * 0.3], tip])}" fill="none" stroke="${col}" stroke-width="${fmt(3 + (1 - t) * 3)}" stroke-linecap="round"/>`;
      const pin = r.int(4, 7);
      for (let k = 1; k <= pin; k++) {
        const u = k / (pin + 1);
        const px = x + len * u * s, py = y + droop * u;
        out += `<ellipse cx="${fmt(px)}" cy="${fmt(py - 7)}" rx="${fmt(4 + (1 - t) * 4)}" ry="${fmt(9 + (1 - t) * 7)}" fill="${col}" opacity="0.85" transform="rotate(${fmt(s * 25)} ${fmt(px)} ${fmt(py - 7)})"/>`;
      }
    }
  }
  return { w, h, body: out };
};

const flower: Gen = ({ r, ink, paper }) => {
  const w = 440, h = 440;
  const cx = w / 2, cy = h / 2 - 10;
  const petals = r.int(5, 9);
  const petal = r.pick([ink[5]!, ink[3]!, ink[2]!]);
  let out = '';
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 + r.range(-0.08, 0.08);
    const len = r.range(120, 165), wid = r.range(46, 70);
    const px = cx + Math.cos(a) * len * 0.55, py = cy + Math.sin(a) * len * 0.55;
    out += `<ellipse cx="${fmt(px)}" cy="${fmt(py)}" rx="${fmt(len / 2)}" ry="${fmt(wid / 2)}" fill="${petal}" opacity="0.9" transform="rotate(${fmt((a * 180) / Math.PI)} ${fmt(px)} ${fmt(py)})"/>`;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="${fmt(r.range(28, 44))}" fill="${ink[4]}"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${fmt(r.range(14, 24))}" fill="${mixHex(ink[0]!, paper[0]!, 0.3)}" opacity="0.8"/>`;
  out += `<path d="M ${cx} ${cy + 120} L ${fmt(cx + r.range(-16, 16))} ${h - 6}" stroke="${ink[1]}" stroke-width="8" stroke-linecap="round"/>`;
  return { w, h, body: out };
};

const seedpod: Gen = ({ r, ink }) => {
  const w = 300, h = 480;
  const cx = w / 2;
  const col = r.pick(ink.slice(2, 5));
  const pts: Pt[] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([cx + Math.sin(Math.PI * t) * r.range(60, 82), 50 + (h - 110) * t]);
  }
  for (let i = N; i >= 0; i--) pts.push([cx - (pts[i]![0] - cx), pts[i]![1]]);
  let out = `<path d="${closedSpline(pts, 0.9)}" fill="${col}"/>`;
  out += `<path d="${closedSpline(pts, 0.9)}" fill="none" stroke="${ink[0]}" stroke-width="2.5" opacity="0.55"/>`;
  const seeds = r.int(4, 7);
  for (let i = 0; i < seeds; i++) {
    const t = (i + 0.5) / seeds;
    out += `<circle cx="${fmt(cx + r.range(-8, 8))}" cy="${fmt(60 + (h - 130) * t)}" r="${fmt(r.range(16, 26))}" fill="${ink[0]}" opacity="0.35"/>`;
  }
  out += `<path d="M ${cx} 52 L ${cx} 8" stroke="${ink[1]}" stroke-width="6" stroke-linecap="round"/>`;
  return { w, h, body: out };
};

const branch: Gen = ({ r, ink }) => {
  const w = S, h = 340;
  const col = r.pick(ink.slice(1, 4));
  const spine: Pt[] = [[10, h - 40], [w * 0.35, h * 0.5 + r.range(-40, 40)], [w * 0.7, h * 0.35], [w - 12, 40 + r.range(-20, 40)]];
  let out = `<path d="${openSpline(spine)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`;
  const n = r.int(5, 8);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = 10 + (w - 22) * t;
    const y = h - 40 - (h - 80) * Math.pow(t, 0.8);
    const s = i % 2 ? 1 : -1;
    const len = r.range(50, 90);
    out += `<ellipse cx="${fmt(x + len * 0.4)}" cy="${fmt(y + s * len * 0.35)}" rx="${fmt(len * 0.5)}" ry="${fmt(len * 0.22)}" fill="${col}" opacity="0.9" transform="rotate(${fmt(s * -30)} ${fmt(x + len * 0.4)} ${fmt(y + s * len * 0.35)})"/>`;
  }
  return { w, h, body: out };
};

const specimenTag: Gen = ({ r, ink, paper }) => {
  const w = 380, h = 260;
  const notch = 34;
  const pts: Pt[] = [[notch, 6], [w - 8, 6], [w - 8, h - 6], [notch, h - 6], [6, h / 2]];
  let out = `<path d="${polygon(pts)}" fill="${paper[0]}" stroke="${ink[0]}" stroke-width="2.5" opacity="0.98"/>`;
  out += `<circle cx="${notch + 8}" cy="${h / 2}" r="9" fill="none" stroke="${ink[0]}" stroke-width="3"/>`;
  const lines = r.int(3, 5);
  for (let i = 0; i < lines; i++) {
    const y = 70 + i * 38;
    out += `<path d="M ${notch + 34} ${y} H ${w - 40}" stroke="${ink[2]}" stroke-width="1.5" opacity="0.5"/>`;
    out += `<path d="M ${notch + 34} ${y - 8} h ${fmt(r.range(60, 200))}" stroke="${ink[1]}" stroke-width="${fmt(r.range(4, 7))}" opacity="0.75" stroke-linecap="round"/>`;
  }
  return { w, h, body: out };
};

// --- cartography ------------------------------------------------------------

const coastline: Gen = ({ r, ink }) => {
  const w = S, h = 460;
  const land = r.pick([ink[3]!, ink[2]!]);
  const d = radialBlob(w / 2, h / 2, 30, (t) =>
    150 + Math.sin(t * 3 + r()) * 45 + Math.sin(t * 7.3 + r()) * 22 + Math.sin(t * 13 + r()) * 11);
  let out = `<path d="${d}" fill="${land}"/>`;
  out += `<path d="${d}" fill="none" stroke="${ink[0]}" stroke-width="3"/>`;
  for (let i = 1; i <= 3; i++) {
    out += `<path d="${d}" fill="none" stroke="${ink[1]}" stroke-width="1.5" opacity="${fmt(0.5 - i * 0.12)}" transform="translate(${fmt(w / 2)} ${fmt(h / 2)}) scale(${fmt(1 + i * 0.06)}) translate(${fmt(-w / 2)} ${fmt(-h / 2)})"/>`;
  }
  if (r.chance(0.6)) {
    out += `<path d="${radialBlob(w / 2 + r.range(-50, 50), h / 2 + r.range(-40, 40), 14, (t) => 34 + Math.sin(t * 4) * 12)}" fill="${ink[1]}" opacity="0.85"/>`;
  }
  return { w, h, body: out };
};

const contour: Gen = ({ r, ink }) => {
  const w = 460, h = 460;
  const cx = w / 2, cy = h / 2;
  const seedA = r.range(0, 6), seedB = r.range(0, 6);
  let out = '';
  const rings = r.int(5, 8);
  for (let i = rings; i >= 1; i--) {
    const k = i / rings;
    const d = radialBlob(cx, cy, 26, (t) => 40 + 165 * k * (1 + Math.sin(t * 3 + seedA) * 0.18 + Math.sin(t * 6.7 + seedB) * 0.09));
    out += `<path d="${d}" fill="${i === rings ? ink[3] : 'none'}" opacity="${i === rings ? '0.5' : '1'}" stroke="${ink[1]}" stroke-width="${fmt(i === 1 ? 3 : 1.8)}"/>`;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="6" fill="${ink[0]}"/>`;
  return { w, h, body: out };
};

const compass: Gen = ({ r, ink, paper }) => {
  const w = 440, h = 440;
  const cx = w / 2, cy = h / 2, R = 190;
  let out = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${paper[0]}" opacity="0.75"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${ink[0]}" stroke-width="3"/>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R - 18}" fill="none" stroke="${ink[1]}" stroke-width="1.5"/>`;
  const pts = r.pick([4, 8]);
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
    const long = i % 2 === 0 ? R - 26 : (R - 26) * 0.6;
    const tip: Pt = [cx + Math.cos(a) * long, cy + Math.sin(a) * long];
    const l: Pt = [cx + Math.cos(a + Math.PI / 2) * 22, cy + Math.sin(a + Math.PI / 2) * 22];
    const rr: Pt = [cx + Math.cos(a - Math.PI / 2) * 22, cy + Math.sin(a - Math.PI / 2) * 22];
    out += `<path d="${polygon([tip, l, [cx, cy]])}" fill="${ink[0]}" opacity="0.9"/>`;
    out += `<path d="${polygon([tip, rr, [cx, cy]])}" fill="${ink[2]}" opacity="0.9"/>`;
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const len = i % 5 === 0 ? 14 : 7;
    out += `<path d="M ${fmt(cx + Math.cos(a) * (R - 4))} ${fmt(cy + Math.sin(a) * (R - 4))} L ${fmt(cx + Math.cos(a) * (R - 4 - len))} ${fmt(cy + Math.sin(a) * (R - 4 - len))}" stroke="${ink[0]}" stroke-width="1.6"/>`;
  }
  out += `<text x="${cx}" y="${cy - R + 46}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="${ink[0]}">N</text>`;
  return { w, h, body: out };
};

const gridtile: Gen = ({ r, ink, paper }) => {
  const w = 460, h = 380;
  let out = `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" fill="${paper[1]}" stroke="${ink[0]}" stroke-width="3"/>`;
  const cols = r.int(4, 7), rows = r.int(3, 6);
  for (let i = 1; i < cols; i++) out += `<path d="M ${fmt(4 + ((w - 8) * i) / cols)} 4 V ${h - 4}" stroke="${ink[2]}" stroke-width="1.4" opacity="0.75"/>`;
  for (let i = 1; i < rows; i++) out += `<path d="M 4 ${fmt(4 + ((h - 8) * i) / rows)} H ${w - 4}" stroke="${ink[2]}" stroke-width="1.4" opacity="0.75"/>`;
  const blocks = r.int(3, 7);
  for (let i = 0; i < blocks; i++) {
    const bx = r.range(20, w - 120), by = r.range(20, h - 100);
    out += `<rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(r.range(40, 100))}" height="${fmt(r.range(30, 70))}" fill="${r.pick([ink[4]!, ink[1]!, ink[3]!])}" opacity="0.6"/>`;
  }
  out += `<path d="${openSpline([[4, r.range(60, h - 60)], [w * 0.4, r.range(40, h - 40)], [w - 4, r.range(60, h - 60)]] as Pt[])}" fill="none" stroke="${ink[5]}" stroke-width="4"/>`;
  return { w, h, body: out };
};

const route: Gen = ({ r, ink }) => {
  const w = S, h = 300;
  const pts: Pt[] = [];
  const n = r.int(4, 6);
  for (let i = 0; i < n; i++) pts.push([20 + ((w - 40) * i) / (n - 1), r.range(40, h - 40)]);
  let out = `<path d="${openSpline(pts)}" fill="none" stroke="${ink[0]}" stroke-width="5" stroke-dasharray="18 12" stroke-linecap="round"/>`;
  for (const [x, y] of pts) {
    out += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="10" fill="${ink[5]}" stroke="${ink[0]}" stroke-width="3"/>`;
  }
  return { w, h, body: out };
};

const archipelago: Gen = ({ r, ink }) => {
  const w = 460, h = 460;
  let out = '';
  const n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const cx = r.range(90, w - 90), cy = r.range(90, h - 90), rad = r.range(38, 92);
    const d = radialBlob(cx, cy, 18, (t) => rad * (1 + Math.sin(t * 4 + i) * 0.22 + Math.sin(t * 9) * 0.1));
    out += `<path d="${d}" fill="${ink[3]}" stroke="${ink[0]}" stroke-width="2.5"/>`;
  }
  return { w, h, body: out };
};

// --- ephemera ---------------------------------------------------------------

const ticket: Gen = ({ r, ink, paper }) => {
  const w = S, h = 230;
  const stub = w * r.range(0.24, 0.32);
  let out = `<rect x="4" y="8" width="${w - 8}" height="${h - 16}" rx="6" fill="${paper[0]}" stroke="${ink[0]}" stroke-width="3"/>`;
  out += `<path d="M ${fmt(stub)} 8 V ${h - 8}" stroke="${ink[0]}" stroke-width="2.5" stroke-dasharray="8 9"/>`;
  for (let y = 22; y < h - 16; y += 22) {
    out += `<circle cx="${fmt(stub)}" cy="${fmt(y)}" r="4" fill="none" stroke="${ink[0]}" stroke-width="1.2" opacity="0.35"/>`;
  }
  out += `<text x="${fmt(stub / 2)}" y="${fmt(h / 2 + 4)}" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="${ink[1]}" transform="rotate(-90 ${fmt(stub / 2)} ${fmt(h / 2)})">${r.int(10, 99)}</text>`;
  out += `<text x="${fmt(stub + 26)}" y="90" font-family="Georgia, serif" font-size="${fmt(r.range(38, 52))}" fill="${ink[0]}" letter-spacing="4">${r.pick(['ADMIT ONE', 'RETURN', 'SINGLE', 'NO. ' + r.int(100, 999)])}</text>`;
  out += `<path d="M ${fmt(stub + 26)} 118 H ${w - 40}" stroke="${ink[2]}" stroke-width="2"/>`;
  out += `<text x="${fmt(stub + 26)}" y="164" font-family="Georgia, serif" font-size="26" fill="${ink[3]}" letter-spacing="6">${r.int(1000, 9999)} · ${r.pick(['SER. A', 'SER. B', 'SEC. 4'])}</text>`;
  return { w, h, body: out };
};

const stamp: Gen = ({ r, ink, paper }) => {
  const w = 340, h = 400, p = 12, teeth = 11;
  const pts: Pt[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = (i + 0.5) / n;
      const nx = -(y1 - y0), ny = x1 - x0;
      const L = Math.hypot(nx, ny) || 1;
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      pts.push([x0 + (x1 - x0) * t2 + (nx / L) * -7, y0 + (y1 - y0) * t2 + (ny / L) * -7]);
    }
  };
  edge(p, p, w - p, p, teeth);
  edge(w - p, p, w - p, h - p, teeth + 2);
  edge(w - p, h - p, p, h - p, teeth);
  edge(p, h - p, p, p, teeth + 2);
  let out = `<path d="${polygon(pts)}" fill="${paper[0]}" stroke="${ink[0]}" stroke-width="2"/>`;
  out += `<rect x="${p + 22}" y="${p + 22}" width="${w - 2 * (p + 22)}" height="${h - 2 * (p + 22)}" fill="none" stroke="${ink[1]}" stroke-width="3"/>`;
  const col = r.pick([ink[1]!, ink[5]!, ink[4]!]);
  out += `<path d="${radialBlob(w / 2, h / 2 - 10, 20, (t) => 84 * (1 + Math.sin(t * 3) * 0.2))}" fill="${col}" opacity="0.75"/>`;
  out += `<text x="${w / 2}" y="${h - 46}" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="${ink[0]}">${r.int(1, 60)}c</text>`;
  return { w, h, body: out };
};

const label: Gen = ({ r, ink, paper }) => {
  const w = 460, h = 220;
  let out = `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="${fmt(r.pick([4, 40, 100]))}" fill="${paper[2]}" stroke="${ink[0]}" stroke-width="3"/>`;
  out += `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" rx="${fmt(r.pick([2, 30, 84]))}" fill="none" stroke="${ink[2]}" stroke-width="1.6"/>`;
  out += `<text x="${w / 2}" y="${fmt(h / 2 + 4)}" text-anchor="middle" font-family="Georgia, serif" font-size="${fmt(r.range(40, 56))}" fill="${ink[1]}" letter-spacing="3">${r.pick(['FRAGILE', 'No. ' + r.int(2, 88), 'RETURN TO', 'SAMPLE', 'KEEP DRY'])}</text>`;
  out += `<text x="${w / 2}" y="${fmt(h / 2 + 44)}" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${ink[3]}" letter-spacing="8">${r.pick(['HANDLE WITH CARE', 'DO NOT BEND', 'THIS SIDE UP'])}</text>`;
  return { w, h, body: out };
};

const tape: Gen = ({ r, ink }) => {
  const w = S, h = 170;
  const yc = h / 2, half = r.range(34, 52);
  const pts: Pt[] = [];
  const N = 16;
  for (let i = 0; i <= N; i++) pts.push([(w * i) / N, yc - half + r.range(-5, 5)]);
  const endA = r.range(-18, 18), endB = r.range(-18, 18);
  pts.push([w - 2, yc + half + endB]);
  for (let i = N; i >= 0; i--) pts.push([(w * i) / N, yc + half + r.range(-5, 5)]);
  pts.push([2, yc - half + endA]);
  const col = r.pick([ink[3]!, ink[4]!, ink[2]!]);
  return {
    w, h,
    body:
      `<path d="${polygon(pts)}" fill="${col}" opacity="0.62"/>` +
      `<path d="${polygon(pts)}" fill="none" stroke="${col}" stroke-width="2" opacity="0.8"/>` +
      Array.from({ length: 7 }, () => {
        const x = r.range(20, w - 20);
        return `<path d="M ${fmt(x)} ${fmt(yc - half + 4)} L ${fmt(x + r.range(-6, 6))} ${fmt(yc + half - 4)}" stroke="#ffffff" stroke-width="${fmt(r.range(1, 3))}" opacity="0.28"/>`;
      }).join(''),
  };
};

const pagecorner: Gen = ({ r, ink, paper }) => {
  const w = 420, h = 420;
  const tear: Pt[] = [[6, 6], [w - 6, 6], [w - 6, h * 0.45]];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    tear.push([w - 6 - (w - 12) * t, h * 0.45 + Math.sin(t * 9 + r()) * 26 + t * h * 0.4]);
  }
  let out = `<path d="${polygon(tear)}" fill="${paper[0]}" stroke="${ink[3]}" stroke-width="1.5"/>`;
  const lines = r.int(5, 8);
  for (let i = 0; i < lines; i++) {
    const y = 46 + i * 34;
    out += `<path d="M 34 ${y} h ${fmt(r.range(120, w - 90))}" stroke="${ink[1]}" stroke-width="${fmt(r.range(5, 9))}" opacity="0.55" stroke-linecap="round"/>`;
  }
  return { w, h, body: out };
};

const envelope: Gen = ({ r, ink, paper }) => {
  const w = 480, h = 320;
  let out = `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="${paper[1]}" stroke="${ink[0]}" stroke-width="3"/>`;
  out += `<path d="M 6 6 L ${w / 2} ${fmt(h * 0.55)} L ${w - 6} 6" fill="none" stroke="${ink[0]}" stroke-width="3"/>`;
  out += `<path d="M 6 ${h - 6} L ${fmt(w * 0.38)} ${fmt(h * 0.5)} M ${w - 6} ${h - 6} L ${fmt(w * 0.62)} ${fmt(h * 0.5)}" fill="none" stroke="${ink[2]}" stroke-width="2" opacity="0.7"/>`;
  for (let i = 0; i < r.int(2, 4); i++) {
    out += `<path d="M ${fmt(w * 0.12)} ${fmt(h * 0.62 + i * 26)} h ${fmt(r.range(80, 220))}" stroke="${ink[1]}" stroke-width="6" opacity="0.5" stroke-linecap="round"/>`;
  }
  out += `<rect x="${fmt(w - 118)}" y="26" width="72" height="86" fill="${ink[5]}" opacity="0.7" stroke="${ink[0]}" stroke-width="2"/>`;
  return { w, h, body: out };
};

// --- typography -------------------------------------------------------------

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ&?!§¶'.split('');

const letterform: Gen = ({ r, ink }) => {
  const w = 380, h = 460;
  const g = r.pick(GLYPHS);
  const col = r.pick([ink[0]!, ink[4]!, ink[1]!]);
  return {
    w, h,
    body:
      `<text x="${w / 2}" y="${h - 70}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="400" font-weight="${r.pick(['400', '700'])}" fill="${col}"${r.chance(0.4) ? ' font-style="italic"' : ''}>${g}</text>`,
  };
};

const numeral: Gen = ({ r, ink }) => {
  const w = 420, h = 440;
  const n = String(r.int(0, 99));
  return {
    w, h,
    body: `<text x="${w / 2}" y="${h - 70}" text-anchor="middle" font-family="Georgia, serif" font-size="340" fill="${r.pick([ink[0]!, ink[4]!])}" letter-spacing="-8">${n}</text>`,
  };
};

const ornamentRule: Gen = ({ r, ink }) => {
  const w = S, h = 120;
  const y = h / 2;
  const col = r.pick([ink[0]!, ink[1]!]);
  let out = `<path d="M 10 ${y} H ${w - 10}" stroke="${col}" stroke-width="${fmt(r.range(3, 7))}"/>`;
  if (r.chance(0.6)) out += `<path d="M 10 ${fmt(y + 12)} H ${w - 10}" stroke="${col}" stroke-width="2"/>`;
  const n = r.int(3, 7);
  for (let i = 0; i < n; i++) {
    const x = 40 + ((w - 80) * i) / (n - 1);
    out += `<path d="${polygon([[x, y - 22], [x + 16, y], [x, y + 22], [x - 16, y]] as Pt[])}" fill="${col}"/>`;
  }
  return { w, h, body: out };
};

const wordblock: Gen = ({ r, ink }) => {
  const w = S, h = 320;
  let out = '';
  const lines = r.int(4, 7);
  for (let i = 0; i < lines; i++) {
    const y = 24 + i * (h - 40) / lines;
    let x = 16;
    while (x < w - 40) {
      const bw = r.range(28, 110);
      if (x + bw > w - 16) break;
      out += `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(bw)}" height="${fmt((h - 40) / lines - 14)}" fill="${ink[0]}" opacity="${fmt(r.range(0.7, 0.95))}"/>`;
      x += bw + r.range(10, 22);
    }
  }
  return { w, h, body: out };
};

const dropcap: Gen = ({ r, ink, paper }) => {
  const w = 400, h = 400;
  const g = r.pick(GLYPHS.slice(0, 26));
  let out = `<rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="${r.pick([ink[4]!, ink[0]!, ink[1]!])}"/>`;
  out += `<rect x="26" y="26" width="${w - 52}" height="${h - 52}" fill="none" stroke="${paper[0]}" stroke-width="4" opacity="0.8"/>`;
  out += `<text x="${w / 2}" y="${h - 90}" text-anchor="middle" font-family="Georgia, serif" font-size="300" fill="${paper[0]}">${g}</text>`;
  return { w, h, body: out };
};

// --- cosmos -----------------------------------------------------------------

const planet: Gen = ({ r, ink }) => {
  const w = 460, h = 460, R = 200;
  const cx = w / 2, cy = h / 2;
  const base = r.pick([ink[2]!, ink[4]!, ink[5]!, ink[1]!]);
  const uid = r.int(1000, 9999);
  const ringed = r.chance(0.45);
  const ringTilt = -18;
  const ring = ringed
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${fmt(R * 1.5)}" ry="${fmt(R * 0.3)}" fill="none" stroke="${mixHex(base, '#ffffff', 0.42)}" stroke-width="14" transform="rotate(${ringTilt} ${cx} ${cy})"/>`
    : '';
  let out = `<defs><clipPath id="pc${uid}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>` +
    `<clipPath id="pr${uid}"><rect x="${fmt(cx - R * 1.7)}" y="${cy}" width="${fmt(R * 3.4)}" height="${fmt(R * 1.2)}" transform="rotate(${ringTilt} ${cx} ${cy})"/></clipPath></defs>`;
  // Back of the ring, then the body, then the near arc over it.
  out += ring;
  out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${base}"/>`;
  out += `<g clip-path="url(#pc${uid})">`;
  const bands = r.int(3, 7);
  for (let i = 0; i < bands; i++) {
    const y = cy - R + ((2 * R) * i) / bands + r.range(-10, 10);
    out += `<rect x="${cx - R}" y="${fmt(y)}" width="${2 * R}" height="${fmt(((2 * R) / bands) * r.range(0.3, 0.8))}" fill="${mixHex(base, ink[0]!, r.range(0.12, 0.4))}" opacity="0.8"/>`;
  }
  out += `<circle cx="${fmt(cx + R * 0.55)}" cy="${fmt(cy + R * 0.35)}" r="${R}" fill="${ink[0]}" opacity="0.32"/>`;
  out += `</g>`;
  if (ringed) out += `<g clip-path="url(#pr${uid})">${ring}</g>`;
  return { w, h, body: out };
};

const starburst: Gen = ({ r, ink }) => {
  const w = 400, h = 400;
  const cx = w / 2, cy = h / 2;
  const n = r.pick([4, 5, 6, 8, 12]);
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? 185 : r.range(40, 80);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  const col = r.pick([ink[4]!, ink[0]!, ink[3]!]);
  return { w, h, body: `<path d="${polygon(pts)}" fill="${col}"/><circle cx="${cx}" cy="${cy}" r="${fmt(r.range(14, 30))}" fill="${ink[0]}" opacity="0.5"/>` };
};

const orbit: Gen = ({ r, ink }) => {
  const w = S, h = S;
  const cx = w / 2, cy = h / 2;
  let out = `<circle cx="${cx}" cy="${cy}" r="${fmt(r.range(28, 52))}" fill="${ink[4]}"/>`;
  const rings = r.int(2, 4);
  for (let i = 0; i < rings; i++) {
    const rx = 90 + i * r.range(50, 80), ry = rx * r.range(0.3, 0.75), rot = r.range(-40, 40);
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${fmt(rx)}" ry="${fmt(ry)}" fill="none" stroke="${ink[2]}" stroke-width="2.5" opacity="0.85" transform="rotate(${fmt(rot)} ${cx} ${cy})"/>`;
    const a = r.range(0, Math.PI * 2);
    const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    const rr = (rot * Math.PI) / 180;
    const qx = cx + (px - cx) * Math.cos(rr) - (py - cy) * Math.sin(rr);
    const qy = cy + (px - cx) * Math.sin(rr) + (py - cy) * Math.cos(rr);
    out += `<circle cx="${fmt(qx)}" cy="${fmt(qy)}" r="${fmt(r.range(9, 18))}" fill="${ink[3]}"/>`;
  }
  return { w, h, body: out };
};

const moonphase: Gen = ({ r, ink }) => {
  const w = 400, h = 400, R = 170;
  const cx = w / 2, cy = h / 2;
  const off = r.range(-R * 0.9, R * 0.9);
  const cid = `m${r.int(1000, 9999)}`;
  return {
    w, h,
    body:
      `<defs><mask id="${cid}"><rect x="0" y="0" width="${w}" height="${h}" fill="black"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${R}" fill="white"/>` +
      `<circle cx="${fmt(cx + off)}" cy="${cy}" r="${R}" fill="black"/></mask></defs>` +
      `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${ink[1]}" opacity="0.22"/>` +
      `<g mask="url(#${cid})"><circle cx="${cx}" cy="${cy}" r="${R}" fill="${ink[4]}"/></g>`,
  };
};

const craterfield: Gen = ({ r, ink }) => {
  const w = 440, h = 440, R = 195;
  const cx = w / 2, cy = h / 2;
  const cid = `c${r.int(1000, 9999)}`;
  let out = `<defs><clipPath id="${cid}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
  out += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${ink[3]}"/><g clip-path="url(#${cid})">`;
  for (let i = 0; i < r.int(9, 16); i++) {
    const x = r.range(cx - R, cx + R), y = r.range(cy - R, cy + R), rad = r.range(12, 46);
    out += `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(rad)}" fill="${ink[1]}" opacity="0.3"/>`;
    out += `<circle cx="${fmt(x - rad * 0.15)}" cy="${fmt(y - rad * 0.15)}" r="${fmt(rad * 0.8)}" fill="${ink[2]}" opacity="0.35"/>`;
  }
  out += `</g>`;
  return { w, h, body: out };
};

const satellitetile: Gen = ({ r, ink }) => {
  const w = 460, h = 460;
  let out = `<rect x="0" y="0" width="${w}" height="${h}" fill="${ink[1]}"/>`;
  for (let i = 0; i < r.int(14, 26); i++) {
    const d = radialBlob(r.range(0, w), r.range(0, h), 10, (t) => r.range(30, 110) * (1 + Math.sin(t * 5) * 0.3));
    out += `<path d="${d}" fill="${r.pick(ink)}" opacity="${fmt(r.range(0.25, 0.7))}"/>`;
  }
  const grid = r.int(3, 6);
  for (let i = 1; i < grid; i++) {
    out += `<path d="M ${fmt((w * i) / grid)} 0 V ${h}" stroke="#ffffff" stroke-width="1" opacity="0.18"/>`;
    out += `<path d="M 0 ${fmt((h * i) / grid)} H ${w}" stroke="#ffffff" stroke-width="1" opacity="0.18"/>`;
  }
  return { w, h, body: out };
};

// --- marginalia -------------------------------------------------------------

const manicule: Gen = ({ r, ink, paper }) => {
  const w = 460, h = 300;
  const line = ink[0]!, fill = paper[0]!;
  const sw = 5;
  const draw = (d: string) => `<path d="${d}" fill="${fill}" stroke="${line}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  // Cuff, fist, then the index finger laid over both so the joins disappear.
  let out = draw(polygon([[18, 106], [96, 86], [102, 216], [26, 196]] as Pt[]));
  out += draw(closedSpline([[96, 92], [206, 84], [258, 116], [262, 184], [206, 214], [98, 208]] as Pt[], 0.85));
  const reach = r.range(392, 440);
  out += draw(closedSpline([
    [232, 124], [300, 130], [360, 134], [reach - 18, 139], [reach, 147],
    [reach - 18, 155], [360, 160], [300, 164], [232, 170],
  ] as Pt[], 0.5));
  // Thumb over the knuckles, curled fingers beneath.
  out += `<ellipse cx="168" cy="106" rx="40" ry="21" fill="${fill}" stroke="${line}" stroke-width="${sw}" transform="rotate(-14 168 106)"/>`;
  for (let i = 0; i < 3; i++) {
    out += `<path d="${openSpline([[214, 168 + i * 15], [252, 178 + i * 14], [242, 194 + i * 12]] as Pt[])}" fill="none" stroke="${line}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  out += `<path d="${openSpline([[36, 112], [44, 150], [34, 190]] as Pt[])}" fill="none" stroke="${line}" stroke-width="3" opacity="0.8"/>`;
  return { w, h, body: out };
};

const curvedArrow: Gen = ({ r, ink }) => {
  const w = S, h = 340;
  const col = r.pick([ink[0]!, ink[4]!]);
  const bend = r.range(-120, 120);
  const a: Pt = [30, h - 50], b: Pt = [w / 2, h / 2 + bend], c: Pt = [w - 60, 60];
  let out = `<path d="${openSpline([a, b, c])}" fill="none" stroke="${col}" stroke-width="${fmt(r.range(7, 13))}" stroke-linecap="round"/>`;
  const ang = Math.atan2(c[1] - b[1], c[0] - b[0]);
  const head = 46;
  for (const s of [1, -1]) {
    const ax = c[0] - Math.cos(ang + (s * Math.PI) / 7) * head;
    const ay = c[1] - Math.sin(ang + (s * Math.PI) / 7) * head;
    out += `<path d="M ${c[0]} ${c[1]} L ${fmt(ax)} ${fmt(ay)}" stroke="${col}" stroke-width="${fmt(r.range(7, 12))}" stroke-linecap="round"/>`;
  }
  return { w, h, body: out };
};

const blot: Gen = ({ r, ink }) => {
  const w = 420, h = 420;
  const col = r.pick([ink[0]!, ink[4]!, ink[5]!]);
  let out = `<path d="${radialBlob(w / 2, h / 2, 24, (t) => 120 * (1 + Math.sin(t * 3 + r()) * 0.25 + Math.sin(t * 7) * 0.14 + (r() - 0.5) * 0.1))}" fill="${col}"/>`;
  for (let i = 0; i < r.int(5, 12); i++) {
    const a = r.range(0, Math.PI * 2), d = r.range(130, 200);
    out += `<circle cx="${fmt(w / 2 + Math.cos(a) * d)}" cy="${fmt(h / 2 + Math.sin(a) * d)}" r="${fmt(r.range(3, 16))}" fill="${col}"/>`;
  }
  return { w, h, body: out };
};

const ribbon: Gen = ({ r, ink, paper }) => {
  const w = S, h = 220;
  const col = r.pick([ink[4]!, ink[1]!, ink[5]!]);
  const notch = 42;
  const main: Pt[] = [[60, 40], [w - 60, 40], [w - 60, h - 60], [w / 2, h - 60 - notch + 40], [60, h - 60]];
  let out = `<path d="${polygon([[20, 66], [60, 40], [60, h - 60], [20, h - 34]] as Pt[])}" fill="${mixHex(col, '#000000', 0.28)}"/>`;
  out += `<path d="${polygon([[w - 20, 66], [w - 60, 40], [w - 60, h - 60], [w - 20, h - 34]] as Pt[])}" fill="${mixHex(col, '#000000', 0.28)}"/>`;
  out += `<path d="${polygon(main)}" fill="${col}"/>`;
  out += `<text x="${w / 2}" y="${fmt(h / 2 + 8)}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="${paper[0]}" letter-spacing="4">${r.pick(['NOTE', 'HERE', 'VOL. ' + r.int(1, 12), 'ET AL.', 'YES'])}</text>`;
  return { w, h, body: out };
};

const scallop: Gen = ({ r, ink, paper }) => {
  const w = S, h = 200;
  const n = r.int(4, 8);
  const step = w / n;
  const top = 16, depth = r.range(90, 140);
  let d = `M 0 0 L ${w} 0 L ${w} ${fmt(top)}`;
  for (let i = n; i > 0; i--) {
    const x0 = step * i, x1 = step * (i - 1);
    d += ` Q ${fmt((x0 + x1) / 2)} ${fmt(top + depth)} ${fmt(x1)} ${fmt(top)}`;
  }
  d += ' Z';
  return {
    w, h,
    body: `<path d="${d}" fill="${r.pick([ink[3]!, ink[4]!, paper[0]!])}" stroke="${ink[0]}" stroke-width="2.5" stroke-linejoin="round"/>`,
  };
};

const asterism: Gen = ({ r, ink }) => {
  const w = 320, h = 320;
  const cx = w / 2, cy = h / 2;
  const arms = r.int(5, 8);
  const col = r.pick([ink[0]!, ink[4]!]);
  let out = '';
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2 + r.range(-0.1, 0.1);
    const len = r.range(100, 140);
    out += `<path d="M ${cx} ${cy} L ${fmt(cx + Math.cos(a) * len)} ${fmt(cy + Math.sin(a) * len)}" stroke="${col}" stroke-width="${fmt(r.range(8, 15))}" stroke-linecap="round"/>`;
  }
  return { w, h, body: out };
};

// --- registry ---------------------------------------------------------------

interface Family { key: string; name: string; gen: Gen }

export const FAMILIES: Record<ThemeId, Family[]> = {
  herbarium: [
    { key: 'leaf', name: 'Leaf', gen: leaf },
    { key: 'fern', name: 'Fern', gen: fern },
    { key: 'flower', name: 'Flower head', gen: flower },
    { key: 'seedpod', name: 'Seed pod', gen: seedpod },
    { key: 'branch', name: 'Branch', gen: branch },
    { key: 'tag', name: 'Specimen tag', gen: specimenTag },
  ],
  cartography: [
    { key: 'coastline', name: 'Coastline', gen: coastline },
    { key: 'contour', name: 'Contours', gen: contour },
    { key: 'compass', name: 'Compass rose', gen: compass },
    { key: 'gridtile', name: 'Sheet', gen: gridtile },
    { key: 'route', name: 'Route', gen: route },
    { key: 'archipelago', name: 'Archipelago', gen: archipelago },
  ],
  ephemera: [
    { key: 'ticket', name: 'Ticket', gen: ticket },
    { key: 'stamp', name: 'Stamp', gen: stamp },
    { key: 'label', name: 'Label', gen: label },
    { key: 'tape', name: 'Tape', gen: tape },
    { key: 'pagecorner', name: 'Torn page', gen: pagecorner },
    { key: 'envelope', name: 'Envelope', gen: envelope },
  ],
  typography: [
    { key: 'letter', name: 'Letterform', gen: letterform },
    { key: 'numeral', name: 'Numeral', gen: numeral },
    { key: 'rule', name: 'Ornament rule', gen: ornamentRule },
    { key: 'wordblock', name: 'Set line', gen: wordblock },
    { key: 'dropcap', name: 'Drop cap', gen: dropcap },
  ],
  cosmos: [
    { key: 'planet', name: 'Planet', gen: planet },
    { key: 'starburst', name: 'Star', gen: starburst },
    { key: 'orbit', name: 'Orbit', gen: orbit },
    { key: 'moonphase', name: 'Moon phase', gen: moonphase },
    { key: 'craterfield', name: 'Crater field', gen: craterfield },
    { key: 'satellite', name: 'Satellite tile', gen: satellitetile },
  ],
  marginalia: [
    { key: 'manicule', name: 'Manicule', gen: manicule },
    { key: 'arrow', name: 'Arrow', gen: curvedArrow },
    { key: 'blot', name: 'Blot', gen: blot },
    { key: 'ribbon', name: 'Ribbon', gen: ribbon },
    { key: 'scallop', name: 'Scallop', gen: scallop },
    { key: 'asterism', name: 'Asterism', gen: asterism },
  ],
};

/** A fragment id is its whole seed, so the same id always yields the same art. */
export function fragmentId(theme: ThemeId, family: string, n: number): string {
  return `${theme}.${family}.${n}`;
}

export function generateFragment(id: string): FragmentSpec {
  const [theme, familyKey] = id.split('.');
  const fams = FAMILIES[theme as ThemeId];
  if (!fams) throw new Error(`unknown theme in fragment id: ${id}`);
  const fam = fams.find((f) => f.key === familyKey);
  if (!fam) throw new Error(`unknown family in fragment id: ${id}`);
  const r = rand(id);
  const ink = THEME_INKS[theme as ThemeId];
  const paper = THEME_PAPER[theme as ThemeId];
  const { w, h, body } = fam.gen({ r, ink, paper });
  // No box, no overlay: a pre-cut fragment is its silhouette and nothing
  // else. Surface texture is the material verb's job, applied inside the
  // shape, never as a rectangle over it.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<g>${body}</g>` +
    `</svg>`;
  return { id, theme: theme as ThemeId, family: familyKey!, name: fam.name, w, h, svg };
}

/** A themed, finite tray (PRD §8.2). Deterministic for a given theme+seed, so
 *  the pool can be pre-warmed and cached rather than generated per user. */
export function generateTray(theme: ThemeId, count = 60, generation = 0): FragmentSpec[] {
  const fams = FAMILIES[theme];
  const out: FragmentSpec[] = [];
  for (let i = 0; i < count; i++) {
    const fam = fams[i % fams.length]!;
    out.push(generateFragment(fragmentId(theme, fam.key, generation * 1000 + Math.floor(i / fams.length))));
  }
  return out;
}

/** "More like this" — one action per item (PRD §8.2). Same family, new seeds. */
export function variantsOf(id: string, n = 4, salt = 0): FragmentSpec[] {
  const [theme, family, num] = id.split('.');
  const base = Number(num ?? 0);
  return Array.from({ length: n }, (_, i) =>
    generateFragment(fragmentId(theme as ThemeId, family!, base + 7919 * (salt + 1) + i + 1)));
}
