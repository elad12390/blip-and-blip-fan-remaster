import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Engine } from '../web/js/engine.js';

const BrowserDecompressionStream = globalThis.DecompressionStream;

function fixture(t, { decompression = true, cacheOpenError = false } = {}) {
  const raw = Buffer.concat([Buffer.from([0, 255, 17, 0]), Buffer.from('original level data\n'.repeat(20))]);
  const packed = gzipSync(raw, { mtime: 0 });
  const item = {
    name: 'test level.lvl', bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    compressedName: 'test level.lvl.gz', compressedBytes: packed.length,
  };
  const urls = {
    raw: `data/${encodeURIComponent(item.name)}?sha=${item.sha256}`,
    gzip: `data/${encodeURIComponent(item.compressedName)}?sha=${item.sha256}`,
  };
  const manifest = { version: 1, files: [item], totalBytes: raw.length, totalCompressedBytes: packed.length };
  const requests = [], puts = [], deletes = [], progress = [], entries = new Map(), routes = new Map();
  routes.set(urls.raw, () => new Response(raw));
  routes.set(urls.gzip, () => new Response(packed, { headers: { 'Content-Type': 'application/gzip' } }));
  const cache = {
    async match(url) { return entries.get(url)?.clone(); },
    async put(url, response) { puts.push(url); entries.set(url, response.clone()); },
    async delete(url) { deletes.push(url); return entries.delete(url); },
  };
  const globals = {
    crypto: webcrypto,
    DecompressionStream: decompression ? BrowserDecompressionStream : undefined,
    caches: { async open() { if (cacheOpenError) throw Error('cache denied'); return cache; } },
    fetch: async url => {
      requests.push(url);
      if (url === 'data-manifest.json') return Response.json(manifest);
      assert.ok(routes.has(url), `unexpected offline fetch: ${url}`);
      return routes.get(url)();
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  const module = () => {
    const files = new Map();
    return {
      files,
      FS: {
        mkdirTree(path) { assert.equal(path, '/data'); },
        writeFile(path, bytes) { files.set(path, Buffer.from(bytes)); },
      },
    };
  };
  const engine = new Engine({ onProgress: message => progress.push(message) });
  return { raw, packed, item, urls, manifest, requests, puts, deletes, progress, entries, routes, cache, module, engine };
}

test('actual gzip bytes decode and verify before entering the filesystem and persistent cache', async t => {
  const h = fixture(t), first = h.module();
  await h.engine.loadResources(first);
  assert.deepEqual(first.files.get(`/data/${h.item.name}`), h.raw);
  assert.deepEqual(h.puts, [h.urls.gzip]);
  assert.deepEqual(Buffer.from(await h.entries.get(h.urls.gzip).clone().arrayBuffer()), h.packed);
  assert.equal(h.progress.at(-1), 'Original game data verified. Starting…');

  h.requests.length = 0;
  const warm = h.module();
  await h.engine.loadResources(warm);
  assert.deepEqual(warm.files.get(`/data/${h.item.name}`), h.raw);
  assert.deepEqual(h.requests, ['data-manifest.json'], 'warm loading uses verified cached game data');
});

test('same-length hash-corrupt cached data is evicted and refreshed without poisoning the cache', async t => {
  const h = fixture(t), output = h.module();
  const changed = Buffer.from(h.raw); changed[0] ^= 1;
  h.entries.set(h.urls.gzip, new Response(gzipSync(changed)));
  await h.engine.loadResources(output);
  assert.deepEqual(h.deletes, [h.urls.gzip]);
  assert.deepEqual(h.puts, [h.urls.gzip]);
  assert.deepEqual(h.requests, ['data-manifest.json', h.urls.gzip]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('a cached HTTP error is evicted and retried from the network', async t => {
  const h = fixture(t), output = h.module();
  h.entries.set(h.urls.gzip, new Response('old error', { status: 503 }));
  await h.engine.loadResources(output);
  assert.deepEqual(h.deletes, [h.urls.gzip]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('missing gzip falls back to original bytes and only caches verified raw data', async t => {
  const h = fixture(t), output = h.module();
  h.routes.set(h.urls.gzip, () => new Response('missing', { status: 404 }));
  await h.engine.loadResources(output);
  assert.deepEqual(h.requests, ['data-manifest.json', h.urls.gzip, h.urls.raw]);
  assert.deepEqual(h.puts, [h.urls.raw]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('truncated gzip falls back to the verified raw variant', async t => {
  const h = fixture(t), output = h.module();
  h.routes.set(h.urls.gzip, () => new Response(h.packed.subarray(0, 12)));
  await h.engine.loadResources(output);
  assert.deepEqual(h.puts, [h.urls.raw]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('already HTTP-decoded gzip responses are accepted only after original-file verification', async t => {
  const h = fixture(t), output = h.module();
  h.routes.set(h.urls.gzip, () => new Response(h.raw, { headers: { 'Content-Encoding': 'gzip' } }));
  await h.engine.loadResources(output);
  assert.deepEqual(h.requests, ['data-manifest.json', h.urls.gzip]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('browsers without DecompressionStream fetch and verify original files directly', async t => {
  const h = fixture(t, { decompression: false }), output = h.module();
  await h.engine.loadResources(output);
  assert.deepEqual(h.requests, ['data-manifest.json', h.urls.raw]);
  assert.deepEqual(h.puts, [h.urls.raw]);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('cache read/write failures are optional and never block verified loading', async t => {
  const h = fixture(t), output = h.module();
  h.cache.match = async () => { throw Error('storage read failed'); };
  h.cache.put = async () => { throw Error('storage quota exceeded'); };
  await h.engine.loadResources(output);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('cache-open denial still allows a verified uncached download', async t => {
  const h = fixture(t, { cacheOpenError: true }), output = h.module();
  await h.engine.loadResources(output);
  assert.equal(h.puts.length, 0);
  assert.deepEqual(output.files.get(`/data/${h.item.name}`), h.raw);
});

test('corrupt gzip and same-length corrupt raw fallback cannot enter the filesystem or cache', async t => {
  const h = fixture(t), output = h.module();
  const changed = Buffer.from(h.raw); changed[1] ^= 1;
  h.routes.set(h.urls.gzip, () => new Response(gzipSync(changed)));
  h.routes.set(h.urls.raw, () => new Response(changed));
  await assert.rejects(h.engine.loadResources(output), /verification failed/);
  assert.equal(output.files.size, 0);
  assert.equal(h.entries.size, 0);
  assert.equal(h.puts.length, 0);
  assert.notEqual(h.progress.at(-1), 'Original game data verified. Starting…');
});
