/**
 * PRD §9 is the one thing in this build that cannot be fixed later: getting it
 * wrong means migrating everything users have made. So it is tested as a
 * contract, not as a serializer.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertVersionContract, ContractError, emptyComposition, orderedLayers, parseComposition,
  type Layer, type Version,
} from '../shared/src/version.ts';
import { MAX_LAYERS } from '../shared/src/constants.ts';

const layer = (over: Partial<Layer> = {}): Layer => ({
  id: 'l1',
  fragment_ref: { source: 'generated', id: 'herbarium.leaf.0', w: 512, h: 512 },
  transform: { x: 10, y: 20, scale: 1, rotation: 0, z: 0 },
  verbs: [],
  ...over,
});

const version = (over: Partial<Version> = {}): Version => ({
  id: 'v1',
  parent_id: null,
  root_id: 'v1',
  created_by: 'sess',
  theme: 'herbarium',
  substrate: { stock: 'cartridge', colour: '#efe7d7', texture: 'grain' },
  palette: 'none',
  layers: [layer()],
  render_hashes: {},
  recipient: null,
  created_at: 0,
  ...over,
});

describe('parent_id and root_id are written from day one', () => {
  test('both fields exist on an empty composition', () => {
    const c = emptyComposition();
    assert.ok('parent_id' in c && 'root_id' in c);
    assert.equal(c.parent_id, null);
    assert.equal(c.root_id, null);
  });

  test('a missing parent_id is rejected rather than defaulted', () => {
    const c = emptyComposition() as Record<string, unknown>;
    delete c['parent_id'];
    assert.throws(() => parseComposition(c), ContractError);
  });

  test('a version with a parent must carry a root', () => {
    assert.throws(() => assertVersionContract(version({ parent_id: 'p1', root_id: null })), ContractError);
    assert.doesNotThrow(() => assertVersionContract(version({ parent_id: 'p1', root_id: 'r1' })));
  });

  test('a rootless version may only be its own root', () => {
    assert.throws(() => assertVersionContract(version({ parent_id: null, root_id: 'other' })), ContractError);
    assert.doesNotThrow(() => assertVersionContract(version({ parent_id: null, root_id: 'v1' })));
  });
});

describe('fragments are referenced, never flattened', () => {
  test('an inlined data URI is rejected at parse', () => {
    const c = { ...emptyComposition(), layers: [layer({ fragment_ref: { source: 'upload', id: 'u1', uri: 'data:image/png;base64,AAAA' } })] };
    assert.throws(() => parseComposition(c), /referenced, not inlined/);
  });

  test('and again at the contract check, for records built by hand', () => {
    assert.throws(
      () => assertVersionContract(version({ layers: [layer({ fragment_ref: { source: 'upload', id: 'u1', uri: 'data:x' } })] })),
      /never flattened/,
    );
  });

  test('a layer with no fragment reference is rejected', () => {
    assert.throws(() => assertVersionContract(version({ layers: [{ ...layer(), fragment_ref: { source: 'generated', id: '' } }] })), ContractError);
  });
});

describe('verbs are stored as parameters, never baked into pixels', () => {
  test('scalar params round-trip', () => {
    const c = { ...emptyComposition(), layers: [layer({ verbs: [{ verb: 'edge', params: { style: 'torn', roughness: 0.6 } }] })] };
    const parsed = parseComposition(c);
    assert.deepEqual(parsed.layers[0]!.verbs[0], { verb: 'edge', params: { style: 'torn', roughness: 0.6 } });
  });

  test('a rendered result smuggled in as a param is rejected', () => {
    const c = { ...emptyComposition(), layers: [layer({ verbs: [{ verb: 'edge', params: { style: 'torn', baked: 'data:image/png;base64,AA' } }] })] };
    assert.throws(() => parseComposition(c), /must not be baked into pixels/);
  });

  test('an unknown verb is rejected rather than carried through', () => {
    const c = { ...emptyComposition(), layers: [layer({ verbs: [{ verb: 'sharpen', params: {} } as unknown as Layer['verbs'][number]] })] };
    assert.throws(() => parseComposition(c), ContractError);
  });

  test('a semantic cut stores a mask reference, not a mask', () => {
    const c = { ...emptyComposition(), layers: [layer({ verbs: [{ verb: 'cut', params: { mode: 'semantic', prompt: 'along the coastline', mask_ref: 'msk_1' } }] })] };
    assert.doesNotThrow(() => parseComposition(c));
  });
});

describe('layer order and timing are retained', () => {
  test('draw order follows z, not array order', () => {
    const c = {
      ...emptyComposition(),
      layers: [
        layer({ id: 'a', transform: { x: 0, y: 0, scale: 1, rotation: 0, z: 2 } }),
        layer({ id: 'b', transform: { x: 0, y: 0, scale: 1, rotation: 0, z: 0 } }),
        layer({ id: 'c', transform: { x: 0, y: 0, scale: 1, rotation: 0, z: 1 } }),
      ],
    };
    assert.deepEqual(orderedLayers(parseComposition(c)).map((l) => l.id), ['b', 'c', 'a']);
  });

  test('ambiguous order is rejected — the replay and the future diff need it', () => {
    const dup = version({
      layers: [
        layer({ id: 'a', transform: { x: 0, y: 0, scale: 1, rotation: 0, z: 1 } }),
        layer({ id: 'b', transform: { x: 0, y: 0, scale: 1, rotation: 0, z: 1 } }),
      ],
    });
    assert.throws(() => assertVersionContract(dup), /not distinct/);
  });

  test('placement timing survives a round trip', () => {
    const c = { ...emptyComposition(), layers: [layer({ placed_at_ms: 4210 })] };
    assert.equal(parseComposition(c).layers[0]!.placed_at_ms, 4210);
  });
});

describe('a version is reconstructable from its record alone', () => {
  test('parse is a fixed point — nothing is lost or invented', () => {
    const c = {
      ...emptyComposition('cosmos'),
      palette: 'cyanotype',
      substrate: { stock: 'kraft', colour: '#e6dcc4', texture: 'foxed' },
      layers: [
        layer({ id: 'a', placed_at_ms: 120, opacity: 0.8, transform: { x: 1, y: 2, scale: 0.5, rotation: 0.3, z: 0, flipX: true },
          verbs: [{ verb: 'edge', params: { style: 'torn', roughness: 0.4 } }, { verb: 'material', params: { material: 'riso', strength: 0.9 } }] }),
        layer({ id: 'b', transform: { x: 3, y: 4, scale: 2, rotation: -0.1, z: 1 } }),
      ],
    };
    const once = parseComposition(c);
    const twice = parseComposition(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(twice, once);
  });

  test('the recipient field is carried even though nothing reads it', () => {
    const c = { ...emptyComposition(), recipient: 'user_42' };
    assert.equal(parseComposition(c).recipient, 'user_42');
  });
});

describe('the format constrains, and says so', () => {
  test('the layer cap is enforced at parse, not just in the editor', () => {
    const layers = Array.from({ length: MAX_LAYERS + 1 }, (_, i) =>
      layer({ id: `l${i}`, transform: { x: 0, y: 0, scale: 1, rotation: 0, z: i } }));
    assert.throws(() => parseComposition({ ...emptyComposition(), layers }), /exceeds the cap/);
  });

  test('a full piece is still valid', () => {
    const layers = Array.from({ length: MAX_LAYERS }, (_, i) =>
      layer({ id: `l${i}`, transform: { x: 0, y: 0, scale: 1, rotation: 0, z: i } }));
    assert.equal(parseComposition({ ...emptyComposition(), layers }).layers.length, MAX_LAYERS);
  });

  test('an unknown substrate or palette is rejected', () => {
    assert.throws(() => parseComposition({ ...emptyComposition(), palette: 'neon' }), ContractError);
    assert.throws(() => parseComposition({ ...emptyComposition(), substrate: { stock: 'silk', colour: '#ffffff', texture: 'grain' } }), ContractError);
  });
});
