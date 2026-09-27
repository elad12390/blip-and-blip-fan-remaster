import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeedrunTimer, formatTime, normalizeSpeedrun, categoryKey, SPLIT_PARTS } from '../web/js/speedrun.js';

test('the clock excludes pauses and splits record segments, deltas and golds', () => {
  const t = new SpeedrunTimer({ category: 'original|1|1', now: 0 });
  t.pause(10_000); t.resume(60_000);           // 50 s in a pause menu do not count
  const first = t.split(1, 70_000);
  assert.equal(first.time, 20_000);
  assert.equal(first.gold, true, 'first ever segment is a gold');
  assert.equal(t.split(1, 80_000), null, 'a stage splits once');
  const second = t.split(3, 100_000);
  assert.equal(second.segment, 30_000);
  assert.equal(second.delta, null, 'no PB to compare against yet');
});

test('a finished valid run becomes the PB, keeps golds, and later runs compare against it', () => {
  let store = normalizeSpeedrun(null);
  const a = new SpeedrunTimer({ category: 'original|1|1', now: 0 });
  for (const [i, part] of SPLIT_PARTS.entries()) a.split(part, (i + 1) * 60_000);
  const result = a.finish(12 * 60_000);
  assert.equal(result.isPb, true);
  store = a.record(store, '2026-09-28');
  assert.equal(store.pbs['original|1|1'].total, 720_000);
  const b = new SpeedrunTimer({ category: 'original|1|1', pb: store.pbs['original|1|1'], golds: store.golds['original|1|1'], now: 0 });
  const split = b.split(1, 50_000);
  assert.equal(split.delta, -10_000, 'ten seconds ahead of PB');
  assert.equal(split.gold, true);
  b.invalidate('cheats were used');
  for (const part of SPLIT_PARTS.slice(1)) b.split(part, 60_000 * (SPLIT_PARTS.indexOf(part) + 1) - 20_000);
  assert.equal(b.finish(600_000).isPb, false, 'invalid runs never set a PB');
  assert.equal(b.record(store, 'x'), store, 'nor any golds');
});

test('records are validated and formatted for display', () => {
  const store = normalizeSpeedrun({ pbs: { 'original|1|1': { total: 83_400, splits: [{ part: 1, time: 1000 }, { part: 99, time: 5 }] }, 'hack|9|9': { total: 1, splits: [] } }, golds: { 'original|1|1': { 1: 1000, 2: 50 } } });
  assert.deepEqual(Object.keys(store.pbs), ['original|1|1']);
  assert.deepEqual(store.pbs['original|1|1'].splits, [{ part: 1, time: 1000 }]);
  assert.deepEqual(store.golds['original|1|1'], { 1: 1000 });
  assert.equal(formatTime(83_400), '1:23.4');
  assert.equal(formatTime(3_723_000), '1:02:03.0');
  assert.equal(formatTime(-2_500, { sign: true }), '-0:02.5');
  assert.equal(categoryKey({ mode: 'roguelite', difficulty: 3, players: 2 }), 'roguelite|3|2');
});
