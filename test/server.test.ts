/** The server's job is to keep version records honest and to make anonymous
 *  generation affordable. Both are tested against a live app on a real port. */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { emptyComposition, type Composition } from '../shared/src/version.ts';
import { MAX_LAYERS, CAPS } from '../shared/src/constants.ts';

// The database picks its file up at import time, and ES module imports are
// evaluated before any statement in this file — so setting the variable above
// a static import would silently run these tests against the development
// database. Assign first, then import dynamically.
process.env['DATABASE_FILE'] = ':memory:';
const { createApp } = await import('../server/src/app.ts');
const { db } = await import('../server/src/db.ts');
const { warmPools } = await import('../server/src/providers/generation.ts');

let server: Server;
let base = '';

before(async () => {
  await warmPools(60);
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

after(() => { server.close(); });

const SESSION = 'test-session-0001';

const post = (path: string, body: unknown, session = SESSION): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-collage-session': session },
    body: JSON.stringify(body),
  });

const get = (path: string, session = SESSION): Promise<Response> =>
  fetch(`${base}${path}`, { headers: { 'x-collage-session': session } });

function composition(over: Partial<Composition> = {}): Composition {
  return {
    ...emptyComposition(),
    layers: [{
      id: 'a1',
      fragment_ref: { source: 'generated', id: 'tee.0', uri: '/api/fragment/tee.0.svg', w: 512, h: 512 },
      transform: { x: 400, y: 500, scale: 0.8, rotation: 0.1, z: 0 },
      verbs: [{ verb: 'edge', params: { style: 'torn', roughness: 0.6 } }],
      placed_at_ms: 900,
    }],
    ...over,
  };
}

describe('versions', () => {
  test('a saved piece round-trips as a version, not an image', async () => {
    const res = await post('/api/versions', { composition: composition() });
    assert.equal(res.status, 200);
    const { id, url } = (await res.json()) as { id: string; url: string };
    assert.match(url, /^\/v\/[A-Za-z0-9]{9}$/);

    const got = await (await get(`/api/versions/${id}`)).json() as { version: Record<string, unknown> };
    const v = got.version;
    assert.equal(v['id'], id);
    // Everything needed to re-render is present.
    assert.ok(Array.isArray(v['layers']));
    assert.deepEqual((v['layers'] as { verbs: unknown }[])[0]!.verbs, [{ verb: 'edge', params: { style: 'torn', roughness: 0.6 } }]);
    assert.equal((v['layers'] as { placed_at_ms: number }[])[0]!.placed_at_ms, 900);
    assert.deepEqual(v['substrate'], composition().substrate);
  });

  test('a rootless piece is its own root, and parent_id is written as null', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const { version } = await (await get(`/api/versions/${id}`)).json() as { version: { parent_id: null; root_id: string } };
    assert.equal(version.parent_id, null);
    assert.equal(version.root_id, id);
  });

  test('a child carries its parent and inherits the root — the riff layer’s whole requirement', async () => {
    const { id: rootId } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const { id: childId } = await (await post('/api/versions', {
      composition: composition({ parent_id: rootId, root_id: rootId }),
    })).json() as { id: string };
    const { id: grandchildId } = await (await post('/api/versions', {
      composition: composition({ parent_id: childId, root_id: rootId }),
    })).json() as { id: string };

    const grandchild = (await (await get(`/api/versions/${grandchildId}`)).json() as { version: { parent_id: string; root_id: string } }).version;
    assert.equal(grandchild.parent_id, childId);
    assert.equal(grandchild.root_id, rootId, 'root must survive two generations');

    // And the lineage is queryable from the record alone, which is the point.
    const children = db.prepare('SELECT id FROM versions WHERE parent_id = ?').all(rootId) as { id: string }[];
    assert.deepEqual(children.map((c) => c.id), [childId]);
    const family = db.prepare('SELECT id FROM versions WHERE root_id = ?').all(rootId) as { id: string }[];
    assert.equal(family.length, 3);
  });

  test('a claimed root_id that disagrees with the parent is corrected, not trusted', async () => {
    const { id: rootId } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const { id: childId } = await (await post('/api/versions', {
      composition: composition({ parent_id: rootId, root_id: 'nonsense' }),
    })).json() as { id: string };
    const { version } = await (await get(`/api/versions/${childId}`)).json() as { version: { root_id: string } };
    assert.equal(version.root_id, rootId);
  });

  test('a composition that breaks the contract is refused', async () => {
    const inlined = composition();
    inlined.layers[0]!.fragment_ref.uri = 'data:image/png;base64,AAAA';
    assert.equal((await post('/api/versions', { composition: inlined })).status, 422);

    const overCap = composition({
      layers: Array.from({ length: MAX_LAYERS + 1 }, (_, i) => ({
        ...composition().layers[0]!, id: `l${i}`,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, z: i },
      })),
    });
    assert.equal((await post('/api/versions', { composition: overCap })).status, 422);
  });

  test('an unknown piece is a 404, not an empty version', async () => {
    assert.equal((await get('/api/versions/zzzzzzzzz')).status, 404);
  });

  test('a taken-down piece stops resolving', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    db.prepare('UPDATE versions SET takedown = 1 WHERE id = ?').run(id);
    assert.equal((await get(`/api/versions/${id}`)).status, 404);
  });
});

describe('renders', () => {
  test('are content-addressed and recorded on the version', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const res = await fetch(`${base}/api/versions/${id}/renders/piece`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-collage-session': SESSION },
      body: bytes,
    });
    const { hash, url } = (await res.json()) as { hash: string; url: string };
    assert.match(hash, /^[0-9a-f]{32}$/);

    const { version } = await (await get(`/api/versions/${id}`)).json() as { version: { render_hashes: Record<string, string> } };
    assert.equal(version.render_hashes['piece'], hash);

    const fetched = await fetch(`${base}${url}`);
    assert.equal(fetched.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()), bytes);
  });

  test('another session cannot overwrite a piece’s renders', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const res = await fetch(`${base}/api/versions/${id}/renders/piece`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-collage-session': 'someone-else-9999' },
      body: new Uint8Array([9]),
    });
    assert.equal(res.status, 403);
  });

  test('an unknown render kind is refused', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const res = await fetch(`${base}/api/versions/${id}/renders/gif`, {
      method: 'POST', headers: { 'content-type': 'image/gif', 'x-collage-session': SESSION }, body: new Uint8Array([1]),
    });
    assert.equal(res.status, 400);
  });
});

describe('the tray', () => {
  test('is themed, finite and within the PRD’s range', async () => {
    const res = await get('/api/tray?theme=shoes');
    const { items } = (await res.json()) as { items: { id: string; theme: string }[] };
    assert.ok(items.length >= 40 && items.length <= 80, `tray of ${items.length} is outside 40–80`);
    assert.ok(items.every((i) => i.theme === 'shoes'));
  });

  test('an unknown theme is refused rather than served empty', async () => {
    assert.equal((await get('/api/tray?theme=nonsense')).status, 400);
  });

  test('fragments are immutable and derivable from their id alone', async () => {
    const res = await fetch(`${base}/api/fragment/sneaker.3.svg`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control') ?? '', /immutable/);
    const a = await res.text();
    const b = await (await fetch(`${base}/api/fragment/sneaker.3.svg`)).text();
    assert.equal(a, b, 'the same id must always yield the same art, or nothing caches');
  });
});

describe('caps', () => {
  test('“more like this” is capped per session, and says so in plain words', async () => {
    const session = 'cap-test-session-1';
    let last: Response | undefined;
    for (let i = 0; i <= CAPS.generationsPerSessionPerDay; i++) {
      last = await get(`/api/tray/variants?id=tee.0&salt=${i}`, session);
      if (last.status === 429) break;
    }
    assert.equal(last!.status, 429);
    const { error } = (await last!.json()) as { error: string };
    assert.match(error, /limit/i);
  });

  test('a session that has not spent anything is unaffected', async () => {
    const res = await get('/api/tray/variants?id=tee.1&salt=1', 'fresh-session-2');
    assert.equal(res.status, 200);
    const { items } = (await res.json()) as { items: unknown[] };
    assert.equal(items.length, 4);
  });
});

describe('abuse controls', () => {
  test('every shared piece can be reported', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    assert.equal((await post(`/api/versions/${id}/report`, { reason: 'not ok' })).status, 200);
    const rows = db.prepare('SELECT reason FROM reports WHERE version_id = ?').all(id) as { reason: string }[];
    assert.deepEqual(rows.map((r) => r.reason), ['not ok']);
  });

  test('uploads must be images', async () => {
    const res = await fetch(`${base}/api/uploads/upload.abcd1234`, {
      method: 'POST', headers: { 'content-type': 'application/pdf', 'x-collage-session': SESSION }, body: new Uint8Array([1]),
    });
    assert.equal(res.status, 415);
  });

  test('an oversized upload is cut off rather than stored', async () => {
    const res = await fetch(`${base}/api/uploads/upload.abcd1235`, {
      method: 'POST',
      headers: { 'content-type': 'image/png', 'x-collage-session': SESSION },
      body: new Uint8Array(CAPS.maxUploadBytes + 1024),
    }).catch(() => null);
    assert.ok(!res || res.status === 413, `expected a refusal, got ${res?.status}`);
  });
});

describe('metrics', () => {
  test('every event is stored with an entry path, so nothing can be read blended', async () => {
    await post('/api/events', {
      events: [
        { name: 'export', entry: 'link', at: Date.now() },
        { name: 'export', entry: 'cold', at: Date.now() },
        { name: 'export', at: Date.now() },
      ],
    });
    const rows = db.prepare("SELECT entry, COUNT(*) AS n FROM events WHERE name = 'export' GROUP BY entry").all() as
      { entry: string; n: number }[];
    const byEntry = Object.fromEntries(rows.map((r) => [r.entry, r.n]));
    assert.equal(byEntry['link'], 1);
    assert.equal(byEntry['cold'], 2, 'an event with no entry path defaults to cold rather than null');
  });

  test('a malformed batch never fails the request', async () => {
    assert.equal((await post('/api/events', { events: 'nope' })).status, 200);
    assert.equal((await post('/api/events', { events: [{ nope: 1 }] })).status, 200);
  });
});

describe('identity comes after value', () => {
  test('a sign-in link claims everything the anonymous session already made', async () => {
    const session = 'claim-session-777';
    const { id } = await (await post('/api/versions', { composition: composition() }, session)).json() as { id: string };
    const { dev_link } = await (await post('/api/claim', { email: 'maker@example.com', version_id: id }, session)).json() as { dev_link?: string };
    assert.ok(dev_link, 'development returns the link so the flow can be walked');

    const res = await fetch(`${base}${dev_link}`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `/v/${id}?claimed=1`);

    const owner = (db.prepare('SELECT created_by FROM versions WHERE id = ?').get(id) as { created_by: string }).created_by;
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('maker@example.com') as { id: string };
    assert.equal(owner, user.id, 'the piece made before signing in belongs to the account after');
  });

  test('a used link cannot be replayed', async () => {
    const { dev_link } = await (await post('/api/claim', { email: 'again@example.com', version_id: null })).json() as { dev_link: string };
    await fetch(`${base}${dev_link}`, { redirect: 'manual' });
    assert.equal((await fetch(`${base}${dev_link}`, { redirect: 'manual' })).status, 410);
  });
});

describe('the OG card', () => {
  test('is a PNG, because the platforms this ships through will not unfurl an SVG', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    const res = await fetch(`${base}/api/versions/${id}/card.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual(Array.from(bytes.slice(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR carries the piece's dimensions, which is what the card tags claim.
    const view = new DataView(bytes.buffer);
    assert.equal(view.getUint32(16), 1080);
    assert.equal(view.getUint32(20), 1350);
  });

  test('a taken-down piece has no card either', async () => {
    const { id } = await (await post('/api/versions', { composition: composition() })).json() as { id: string };
    db.prepare('UPDATE versions SET takedown = 1 WHERE id = ?').run(id);
    assert.equal((await fetch(`${base}/api/versions/${id}/card.png`)).status, 404);
  });
});
