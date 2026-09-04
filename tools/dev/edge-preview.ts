/** Dev-only: a contact sheet of every edge style at three roughnesses. */
import { writeFileSync, readFileSync } from 'node:fs';
import { launch } from './browser.ts';
import { rasterise } from './raster.ts';
import { encodePng } from './png.ts';
import { applyEdge } from '../../web/src/verbs/edge.ts';
import { EDGE_STYLES } from '../../shared/src/constants.ts';

const SP = process.env['SP'] ?? '.';
const CELL = 300;
const frag = process.argv[2] ?? 'herbarium.leaf.0';
const svg = readFileSync(`web/public/fragments/${frag.split('.')[0]}/${frag}.svg`, 'utf8');

const browser = await launch();
const src = await rasterise(browser, svg, CELL, CELL);
await browser.close();

const roughs = [0.15, 0.5, 0.95];
const W = CELL * EDGE_STYLES.length, H = CELL * roughs.length;
const sheet = new Uint8ClampedArray(W * H * 4);
// Mid-grey ground so both the cut alpha and the pale fibre core are visible.
for (let i = 0; i < W * H; i++) {
  sheet[i * 4] = 120; sheet[i * 4 + 1] = 118; sheet[i * 4 + 2] = 112; sheet[i * 4 + 3] = 255;
}

for (let ri = 0; ri < roughs.length; ri++) {
  for (let si = 0; si < EDGE_STYLES.length; si++) {
    const bmp = { data: new Uint8ClampedArray(src), width: CELL, height: CELL };
    const t0 = performance.now();
    applyEdge(bmp, { style: EDGE_STYLES[si]!, roughness: roughs[ri]!, seed: 42 });
    if (ri === 0) console.log(`${EDGE_STYLES[si]}: ${(performance.now() - t0).toFixed(1)}ms @${CELL}px`);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const s = (y * CELL + x) * 4;
        const d = ((ri * CELL + y) * W + si * CELL + x) * 4;
        const a = bmp.data[s + 3]! / 255;
        for (let c = 0; c < 3; c++) sheet[d + c] = bmp.data[s + c]! * a + sheet[d + c]! * (1 - a);
      }
    }
  }
}
writeFileSync(`${SP}/edge.png`, encodePng(sheet, W, H));
console.log(`edge sheet → ${SP}/edge.png  (columns: ${EDGE_STYLES.join(', ')})`);
