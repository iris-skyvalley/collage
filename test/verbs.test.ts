/** The verbs are pure functions on RGBA buffers, so they can be checked here
 *  rather than only by eye. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdge } from '../web/src/verbs/edge.ts';
import { applyMaterial } from '../web/src/verbs/material.ts';
import { applyPalette } from '../web/src/verbs/palette.ts';
import { applyRegionCut } from '../web/src/verbs/cut.ts';
import { applyExtend } from '../web/src/verbs/extend.ts';
import { estimateLight, applyRelight } from '../web/src/verbs/relight.ts';
import { signedDistanceField } from '../web/src/render/sdf.ts';
import { runVerbs } from '../web/src/verbs/pipeline.ts';
import type { Bitmap } from '../web/src/verbs/types.ts';
import { EDGE_STYLES, MATERIALS } from '../shared/src/constants.ts';

/** A filled disc on a transparent ground — a fragment in miniature. */
function disc(size = 128, colour: [number, number, number] = [90, 140, 70]): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4);
  const r = size * 0.36;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = Math.hypot(x - size / 2, y - size / 2) <= r;
      data[i] = colour[0]; data[i + 1] = colour[1]; data[i + 2] = colour[2];
      data[i + 3] = inside ? 255 : 0;
    }
  }
  return { data, width: size, height: size };
}

const opaqueCount = (b: Bitmap): number => {
  let n = 0;
  for (let i = 3; i < b.data.length; i += 4) if (b.data[i]! > 128) n++;
  return n;
};

describe('signed distance field', () => {
  test('is positive inside, negative outside, and zero-crossing at the boundary', () => {
    const b = disc(64);
    const sdf = signedDistanceField(b.data, 64, 64);
    assert.ok(sdf[32 * 64 + 32]! > 20, 'centre is well inside');
    assert.ok(sdf[0]! < 0, 'corner is outside');
    const edge = sdf[32 * 64 + Math.round(32 + 64 * 0.36)]!;
    assert.ok(Math.abs(edge) <= 2, `boundary should be near zero, got ${edge}`);
  });
});

describe('edge', () => {
  test('clean is a no-op', () => {
    const b = disc();
    const before = new Uint8ClampedArray(b.data);
    applyEdge(b, { style: 'clean', roughness: 1 });
    assert.deepEqual(b.data, before);
  });

  test('every style leaves a recognisable fragment behind', () => {
    for (const style of EDGE_STYLES) {
      const b = disc();
      const before = opaqueCount(b);
      applyEdge(b, { style, roughness: 0.6, seed: 3 });
      const after = opaqueCount(b);
      assert.ok(after > before * 0.35, `${style} ate too much: ${after}/${before}`);
      assert.ok(after <= before * 1.02, `${style} grew the silhouette: ${after}/${before}`);
    }
  });

  test('the boundary only recedes — tearing removes material, never invents it', () => {
    const b = disc();
    const original = new Uint8ClampedArray(b.data);
    applyEdge(b, { style: 'torn', roughness: 0.9, seed: 11 });
    let grewOutside = 0;
    for (let i = 3; i < b.data.length; i += 4) {
      // Fibre wisps are the one exception, and they stay close to the edge;
      // nothing may appear far outside the original silhouette.
      if (original[i] === 0 && b.data[i]! > 0) grewOutside++;
    }
    assert.ok(grewOutside < opaqueCount({ data: original, width: 128, height: 128 }) * 0.08,
      `too much invented outside the silhouette: ${grewOutside}px`);
  });

  test('roughness moves the amount of material removed', () => {
    const low = disc(); applyEdge(low, { style: 'torn', roughness: 0.05, seed: 7 });
    const high = disc(); applyEdge(high, { style: 'torn', roughness: 1, seed: 7 });
    assert.ok(opaqueCount(high) < opaqueCount(low), 'rougher should tear away more');
  });

  test('is deterministic for a given seed — a stored record re-renders identically', () => {
    const a = disc(); applyEdge(a, { style: 'torn', roughness: 0.5, seed: 42 });
    const b = disc(); applyEdge(b, { style: 'torn', roughness: 0.5, seed: 42 });
    assert.deepEqual(a.data, b.data);
  });
});

describe('material', () => {
  test('shape is preserved: alpha is never touched', () => {
    for (const material of MATERIALS) {
      const b = disc();
      const alphaBefore = Array.from(b.data.filter((_, i) => i % 4 === 3));
      applyMaterial(b, { material, strength: 1, seed: 5 });
      const alphaAfter = Array.from(b.data.filter((_, i) => i % 4 === 3));
      assert.deepEqual(alphaAfter, alphaBefore, `${material} changed the silhouette`);
    }
  });

  test('strength 0 leaves the colour alone', () => {
    const b = disc();
    const before = new Uint8ClampedArray(b.data);
    applyMaterial(b, { material: 'riso', strength: 0 });
    assert.deepEqual(b.data, before);
  });
});

describe('palette', () => {
  test('an empty ramp is a no-op', () => {
    const b = disc();
    const before = new Uint8ClampedArray(b.data);
    applyPalette(b, { ramp: [] });
    assert.deepEqual(b.data, before);
  });

  test('full strength maps onto the ramp and leaves transparent pixels alone', () => {
    const b = disc(64, [255, 255, 255]);
    applyPalette(b, { ramp: ['#000000', '#ff0000'], strength: 1 });
    const centre = (32 * 64 + 32) * 4;
    assert.equal(b.data[centre], 255);
    assert.equal(b.data[centre + 1], 0);
    assert.equal(b.data[centre + 3], 255);
  });
});

describe('cut', () => {
  test('a region cut removes the run it lands in', () => {
    const b = disc();
    const before = opaqueCount(b);
    applyRegionCut(b, { x: 0.5, y: 0.5, tolerance: 0.2 });
    assert.ok(opaqueCount(b) < before * 0.1, 'the whole flat disc should go');
  });

  test('keep inverts the selection', () => {
    const b = disc();
    applyRegionCut(b, { x: 0.5, y: 0.5, tolerance: 0.2, keep: true });
    assert.ok(opaqueCount(b) > 0, 'the kept region should survive');
  });

  test('a seed on transparent ground does nothing', () => {
    const b = disc();
    const before = opaqueCount(b);
    applyRegionCut(b, { x: 0.02, y: 0.02, tolerance: 0.2 });
    assert.equal(opaqueCount(b), before);
  });
});

describe('extend', () => {
  test('grows the silhouette past its own edge and pads the raster', () => {
    const b = disc();
    const before = opaqueCount(b);
    const out = applyExtend(b, { amount: 30, irregularity: 0.4, seed: 2 });
    assert.ok(out.padLeft > 0 && out.padTop > 0, 'raster should be padded');
    assert.ok(opaqueCount(out.bitmap) > before, 'the fragment should have grown');
  });

  test('an amount below a pixel is a no-op', () => {
    const b = disc();
    const out = applyExtend(b, { amount: 0 });
    assert.equal(out.padLeft, 0);
    assert.equal(out.bitmap, b);
  });
});

describe('relight', () => {
  test('estimates the direction of a fragment’s own gradient', () => {
    const b = disc(96, [128, 128, 128]);
    // Brighten the left half: the light reads as coming from the left.
    for (let y = 0; y < 96; y++) {
      for (let x = 0; x < 48; x++) {
        const i = (y * 96 + x) * 4;
        if (b.data[i + 3]! > 0) { b.data[i] = 220; b.data[i + 1] = 220; b.data[i + 2] = 220; }
      }
    }
    const light = estimateLight(b);
    assert.ok(light.dx < -0.5, `expected light from the left, got dx=${light.dx}`);
    assert.ok(light.strength > 0, 'a modelled fragment has non-zero strength');
  });

  test('amount 0 changes nothing', () => {
    const b = disc();
    const before = new Uint8ClampedArray(b.data);
    applyRelight(b, { dx: 1, dy: 0, strength: 1, amount: 0 });
    assert.deepEqual(b.data, before);
  });
});

describe('pipeline', () => {
  test('evaluates in physical order regardless of the order verbs were added', () => {
    const asAdded = runVerbs(disc(), [
      { verb: 'edge', params: { style: 'torn', roughness: 0.5 } },
      { verb: 'material', params: { material: 'newsprint', strength: 1 } },
    ], { seed: 9 });
    const reversed = runVerbs(disc(), [
      { verb: 'material', params: { material: 'newsprint', strength: 1 } },
      { verb: 'edge', params: { style: 'torn', roughness: 0.5 } },
    ], { seed: 9 });
    assert.deepEqual(asAdded.bitmap.data, reversed.bitmap.data);
  });

  test('the cache key changes when any parameter does', () => {
    const opts = { seed: 1, paper: '#ffffff' };
    const a = runVerbs(disc(), [{ verb: 'edge', params: { style: 'torn', roughness: 0.5 } }], opts);
    const b = runVerbs(disc(), [{ verb: 'edge', params: { style: 'torn', roughness: 0.9 } }], opts);
    assert.notDeepEqual(a.bitmap.data, b.bitmap.data);
  });
});
