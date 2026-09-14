import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryObjectStore } from './store.ts';
import type { ClipObject, Creation } from './schema.ts';
import { objectIdsOf } from './schema.ts';

function object(id: string, clippedBy = 'iris'): ClipObject {
  const t = new Date(Date.now() + Number(id.replace(/\D/g, ''))).toISOString();
  return {
    id,
    title: id,
    attributes: {},
    originalImage: {
      blobKey: `objects/${id}/original`,
      width: 1,
      height: 1,
      type: 'image/png',
    },
    cutout: { status: 'none' },
    source: {
      url: 'https://x.example/' + id,
      host: 'x.example',
      methods: ['dom'],
      clippedAt: t,
    },
    clippedBy,
    createdAt: t,
    updatedAt: t,
  };
}

function creation(id: string, objects: string[], ownerId = 'iris'): Creation {
  const t = new Date(Date.now() + Number(id.replace(/\D/g, ''))).toISOString();
  return {
    id,
    title: id,
    ownerId,
    pieces: objects.map((o, i) => ({
      id: `${id}-${i}`,
      product: 'object',
      object: o,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      r: 0,
    })),
    objectIds: [],
    createdAt: t,
    updatedAt: t,
  };
}

test('objectIdsOf dedupes and sorts', () => {
  const c = creation('c1', ['b', 'a', 'b']);
  assert.deepEqual(objectIdsOf(c.pieces), ['a', 'b']);
});

test('objects round-trip and list newest first, filtered by clipper', async () => {
  const s = new MemoryObjectStore();
  await s.putObject(object('o1'));
  await s.putObject(object('o2'));
  await s.putObject(object('o3', 'someone-else'));
  assert.equal((await s.getObject('o1'))?.title, 'o1');
  assert.deepEqual(
    (await s.listObjects()).map((o) => o.id),
    ['o3', 'o2', 'o1'],
  );
  assert.deepEqual(
    (await s.listObjects({ clippedBy: 'iris' })).map((o) => o.id),
    ['o2', 'o1'],
  );
  await s.deleteObject('o1');
  assert.equal(await s.getObject('o1'), undefined);
});

test('used_in is derived from creations, so counts cannot drift', async () => {
  const s = new MemoryObjectStore();
  await s.putObject(object('lamp'));
  await s.putObject(object('chair'));
  await s.putCreation(creation('c1', ['lamp']));
  await s.putCreation(creation('c2', ['lamp', 'chair', 'lamp']));
  await s.putCreation(creation('c3', []));
  assert.deepEqual(await s.usageCounts(['lamp', 'chair', 'ghost']), [
    { objectId: 'lamp', creations: 2 },
    { objectId: 'chair', creations: 1 },
    { objectId: 'ghost', creations: 0 },
  ]);
  assert.deepEqual(
    (await s.usedIn('lamp')).map((c) => c.id),
    ['c2', 'c1'],
  );

  // Taking the lamp off c2 updates the count on the next query.
  await s.putCreation(creation('c2', ['chair']));
  assert.deepEqual(await s.usageCounts(['lamp']), [
    { objectId: 'lamp', creations: 1 },
  ]);
  const stored = await s.getCreation('c2');
  assert.deepEqual(stored?.objectIds, ['chair']);
});

test('blobs are stored by key', async () => {
  const s = new MemoryObjectStore();
  await s.putBlob('k', new Blob(['hi'], { type: 'text/plain' }));
  assert.equal(await (await s.getBlob('k'))?.text(), 'hi');
  await s.deleteBlob('k');
  assert.equal(await s.getBlob('k'), undefined);
});
