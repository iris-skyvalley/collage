import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cutoutFlatBackground,
  crop,
  hasFlatBackground,
  sampleBorder,
  type Pixels,
} from './cutout.ts';

function image(
  w: number,
  h: number,
  paint: (x: number, y: number) => [number, number, number, number],
): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

const white: [number, number, number, number] = [255, 255, 255, 255];
const red: [number, number, number, number] = [200, 30, 40, 255];

test('sampleBorder finds the backdrop colour', () => {
  const p = image(10, 10, (x, y) =>
    x > 2 && x < 7 && y > 2 && y < 7 ? red : white,
  );
  const { color, spread } = sampleBorder(p);
  assert.deepEqual(color, [255, 255, 255]);
  assert.equal(spread, 0);
  assert.equal(hasFlatBackground(p), true);
});

test('cutoutFlatBackground removes the backdrop and keeps the object', () => {
  const p = image(20, 20, (x, y) =>
    x >= 5 && x < 15 && y >= 8 && y < 12 ? red : white,
  );
  const r = cutoutFlatBackground(p, { feather: false });
  assert.ok(r);
  assert.deepEqual(r.bounds, { x: 5, y: 8, w: 10, h: 4 });
  assert.equal(r.coverage, 40 / 400);
  // Background is transparent, object is opaque.
  assert.equal(r.pixels.data[3], 0);
  assert.equal(r.pixels.data[(10 * 20 + 10) * 4 + 3], 255);
  // The input was not touched.
  assert.equal(p.data[3], 255);
});

test('a white patch inside the object stays (only edge-connected background goes)', () => {
  const p = image(20, 20, (x, y) => {
    const inObject = x >= 4 && x < 16 && y >= 4 && y < 16;
    const hole = x >= 9 && x < 11 && y >= 9 && y < 11;
    return inObject && !hole ? red : white;
  });
  const r = cutoutFlatBackground(p, { feather: false });
  assert.ok(r);
  assert.equal(
    r.pixels.data[(9 * 20 + 9) * 4 + 3],
    255,
    'enclosed hole is kept',
  );
});

test('near-white anti-aliased fringe is treated as background', () => {
  const p = image(12, 12, (x, y) => {
    if (x >= 4 && x < 8 && y >= 4 && y < 8) return red;
    if (x >= 3 && x < 9 && y >= 3 && y < 9) return [240, 240, 240, 255];
    return white;
  });
  const r = cutoutFlatBackground(p, { feather: false });
  assert.ok(r);
  assert.deepEqual(r.bounds, { x: 4, y: 4, w: 4, h: 4 });
});

test('feathering softens edge pixels', () => {
  const p = image(10, 10, (x, y) =>
    x >= 3 && x < 7 && y >= 3 && y < 7 ? red : white,
  );
  const r = cutoutFlatBackground(p);
  assert.ok(r);
  const edge = r.pixels.data[(3 * 10 + 3) * 4 + 3];
  const inner = r.pixels.data[(4 * 10 + 4) * 4 + 3];
  assert.ok(edge < 255 && edge > 100, `edge alpha ${edge}`);
  assert.equal(inner, 255);
});

test('busy backgrounds are refused', () => {
  const p = image(16, 16, (x, y) => ((x + y) % 2 ? [0, 0, 0, 255] : white));
  assert.equal(hasFlatBackground(p), false);
  assert.equal(cutoutFlatBackground(p), null);
});

test('an image that is all background yields nothing', () => {
  assert.equal(cutoutFlatBackground(image(8, 8, () => white)), null);
});

test('crop clamps padding to the image', () => {
  const p = image(10, 10, (x, y) => (x === 0 && y === 0 ? red : white));
  const c = crop(p, { x: 0, y: 0, w: 2, h: 2 }, 3);
  assert.equal(c.width, 5);
  assert.equal(c.height, 5);
  assert.deepEqual([...c.data.subarray(0, 4)], red);
});
