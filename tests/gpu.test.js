import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OP, decodeCommands } from '../web/js/gpu/commands.js';
import { ShelfAtlas } from '../web/js/gpu/atlas.js';
import { convertRegion, reliefMap } from '../web/js/gpu/surface-pixels.js';

// A 3x2 ABGR8888 surface with 4 bytes of row padding, colour key magenta.
function surface({ keyed = true } = {}) {
  const pitch = 16, heap = new Uint8Array(8 + pitch * 2).fill(0xEE);
  const px = [[10, 20, 30], [255, 0, 255], [40, 50, 60], [70, 80, 90], [100, 110, 120], [255, 0, 255]];
  px.forEach(([r, g, b], i) => heap.set([r, g, b, 255], 8 + Math.floor(i / 3) * pitch + (i % 3) * 4));
  return { heap, info: { ptr: 8, width: 3, height: 2, pitch, keyed, key: 0xFF00FF | 0xFF000000 } };
}

test('command stream decodes every opcode with unsigned pointers and colours', () => {
  const words = new Int32Array([
    OP.UPLOAD, 7, -2147483648, 3, 2, 16, 1, -1, 0, 0, 3, 2,
    OP.BLIT, 7, 1, 0, 2, 2, -5, 12,
    OP.FILL, 0, 0, 640, 480, 0xFF000000 | 0,
    OP.WARP, 42, 5,
    OP.SHADE, 100, 740, 24, 143,
  ]);
  const seen = [];
  decodeCommands(words, {
    upload: info => seen.push(['upload', info.id, info.ptr, info.key, info.dirty.width]),
    blit: (...a) => seen.push(['blit', ...a]),
    fill: (...a) => seen.push(['fill', ...a]),
    warp: (...a) => seen.push(['warp', ...a]),
    shade: (...a) => seen.push(['shade', ...a]),
  });
  assert.deepEqual(seen, [
    ['upload', 7, 2147483648, 0xFFFFFFFF, 3],
    ['blit', 7, 1, 0, 2, 2, -5, 12],
    ['fill', 0, 0, 640, 480, 0xFF000000],
    ['warp', 42, 5],
    ['shade', 100, 740, 24, 143],
  ]);
});

test('a truncated or unknown command is rejected instead of misreading later words', () => {
  assert.throws(() => decodeCommands(new Int32Array([OP.BLIT, 1, 2]), {}), /Corrupt/);
  assert.throws(() => decodeCommands(new Int32Array([99]), {}), /Corrupt/);
});

test('colour-keyed texels become transparent and the one-texel padding repeats edges', () => {
  const { heap, info } = surface();
  const { rgba, depth } = convertRegion(heap, info, { x: -1, y: -1, width: 5, height: 4 }, reliefMap(heap, info));
  const at = (x, y) => [...rgba.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)];
  assert.deepEqual(at(1, 1), [10, 20, 30, 255]);
  assert.deepEqual(at(0, 0), [10, 20, 30, 255], 'corner padding repeats the corner texel');
  assert.deepEqual(at(2, 1), [0, 0, 0, 0], 'key colour is premultiplied transparent');
  assert.deepEqual(at(4, 2), [0, 0, 0, 0], 'padding beside a keyed edge stays transparent');
  assert.equal(depth[1 * 5 + 2], 0, "transparent texels carry no relief");
  assert.ok(depth[1 * 5 + 1] > 54, 'opaque sprite texels carry relief');
});

test('opaque scenery relief follows brightness and matches the former CPU material', () => {
  const { heap, info } = surface({ keyed: false });
  const relief = reliefMap(heap, info);
  const lum = (54 * 10 + 183 * 20 + 19 * 30) >> 8;
  assert.equal(relief[0], 80 + Math.floor(lum * 85 / 255));
  const { depth } = convertRegion(heap, info, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(depth[0], relief[0], 'per-texel relief without a precomputed map is identical');
});

test('atlas packs shelves, reports full pages and restarts after a reset', () => {
  const atlas = new ShelfAtlas(64, 2);
  const a = atlas.allocate(40, 20), b = atlas.allocate(20, 10), c = atlas.allocate(30, 30);
  assert.deepEqual([a.page, a.x, a.y], [0, 0, 0]);
  assert.deepEqual([b.page, b.x, b.y], [0, 40, 0], 'shares the first shelf');
  assert.deepEqual([c.page, c.y], [0, 20]);
  assert.equal(atlas.allocate(64, 64).page, 1, 'spills to a second page');
  assert.equal(atlas.allocate(64, 64), null, 'maximum pages reached');
  const generation = atlas.generation;
  atlas.reset();
  assert.equal(atlas.generation, generation + 1, 'resident slots from the old layout are invalidated');
  assert.deepEqual(atlas.allocate(64, 64), { page: 0, x: 0, y: 0 });
  assert.throws(() => atlas.allocate(65, 1), RangeError);
});
