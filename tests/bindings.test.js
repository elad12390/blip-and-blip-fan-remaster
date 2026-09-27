import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS, bind, bindCoop, keyMap, padMask, normalizeBindings, keyName, buttonName } from '../web/js/bindings.js';
import { normalizeSave, freshSave } from '../web/js/progression.js';

const pad = pressed => ({ connected: true, axes: [0, 0], buttons: Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i) })) });

test('rebinding a key moves it off any other action and keeps the old key as secondary', () => {
  const next = bind(DEFAULT_BINDINGS, 'solo', 'fire', 'Space');
  assert.deepEqual(next.solo.fire, ['Space', 'KeyJ']);
  assert.deepEqual(next.solo.jump, ['KeyK'], 'Space no longer jumps');
  const map = keyMap(next, 'solo');
  assert.equal(map.Space, 16);
  assert.equal(map.KeyZ, undefined, 'only two keys per action');
});

test('co-op players share one keyboard: a key taken by P1 is removed from P2', () => {
  const next = bindCoop(DEFAULT_BINDINGS, 'coop1', 'fire', 'KeyJ');
  assert.deepEqual(next.coop1.fire, ['KeyJ', 'KeyF']);
  assert.deepEqual(next.coop2.fire, []);
});

test('gamepad buttons are remappable; movement always works from stick and D-pad', () => {
  const b = bind(DEFAULT_BINDINGS, 'pad', 'jump', 5);
  assert.equal(padMask(pad([5]), b), 32 | 128, 'new jump button jumps and continues dialogue');
  assert.equal(padMask(pad([0]), b), 32, 'the previous button stays as the secondary');
  assert.equal(padMask(pad([0]), bind(b, 'pad', 'cow', 0)), 64, 'taking it for another action unbinds it from jump');
  assert.equal(padMask(pad([15, 12]), b), 2 | 4);
  assert.equal(padMask({ ...pad([]), axes: [-.9, 0] }, b), 1);
  assert.equal(padMask(pad([7]), DEFAULT_BINDINGS), 16, 'a held secondary trigger fires without skipping cinematics');
  assert.equal(padMask(pad([2]), DEFAULT_BINDINGS), 16 | 128);
});

test('stored bindings are validated, deduplicated and keep pause reachable', () => {
  const b = normalizeBindings({ solo: { fire: ['KeyQ', 'KeyQ', 'Tab', '<script>'], pause: [] }, pad: { cow: [99, 3], pause: [] } });
  assert.deepEqual(b.solo.fire, ['KeyQ']);
  assert.deepEqual(b.solo.pause, ['Escape']);
  assert.deepEqual(b.pad.cow, [3]);
  assert.deepEqual(b.pad.pause, [9]);
  assert.deepEqual(b.solo.jump, DEFAULT_BINDINGS.solo.jump, 'missing actions keep defaults');
});

test('difficulty and bindings persist through save normalisation', () => {
  const raw = { ...freshSave(), difficulty: 3, bindings: bind(DEFAULT_BINDINGS, 'solo', 'cow', 'KeyE') };
  const save = normalizeSave(JSON.parse(JSON.stringify(raw)));
  assert.equal(save.difficulty, 3);
  assert.deepEqual(save.bindings.solo.cow, ['KeyE', 'KeyL']);
  assert.equal(normalizeSave({ ...freshSave(), difficulty: 9 }).difficulty, 1, 'unknown difficulty falls back to Normal');
});

test('binding names are readable in the interface', () => {
  assert.equal(keyName('KeyJ'), 'J');
  assert.equal(keyName('ArrowLeft'), 'LEFT');
  assert.equal(keyName('Space'), 'SPACE');
  assert.equal(buttonName(0), 'A');
  assert.equal(buttonName(7), 'RT');
});
