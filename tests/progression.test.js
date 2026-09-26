import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshSave, normalizeSave, settleRun, checkpointRun, purchaseUpgrade, readSave, writeSave, recordScore, getHighScores, HIGH_SCORE_LIMIT, scoreName } from '../web/js/progression.js';
test('Original mode never receives progression or checkpoints', () => {
  const save = freshSave();
  assert.equal(settleRun(save, { id: 'one', mode: 'original', score: 90000 }), 0);
  assert.equal(checkpointRun(save, { mode: 'original', part: 1 }), false);
  assert.deepEqual(save, freshSave());
});
test('a run reward is paid exactly once across reloads', () => {
  const save = freshSave();
  const run = { id: 'one', mode: 'roguelite', score: 4000, kills: 25 };
  assert.equal(settleRun(save, run), 9);
  const reloaded = normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(settleRun(reloaded, run), 0);
  assert.equal(reloaded.shards, 9);
});
test('upgrades require sufficient funds and obey caps', () => {
  const save = freshSave();
  assert.equal(purchaseUpgrade(save, 'armor'), false);
  save.shards = 1000;
  assert.equal(purchaseUpgrade(save, 'fake'), false);
  for (let i = 0; i < 3; i++) assert.equal(purchaseUpgrade(save, 'armor'), true);
  assert.equal(purchaseUpgrade(save, 'armor'), false);
  assert.equal(save.shards, 928);
});
test('checkpoint survives storage and malformed data is contained', () => {
  const save = freshSave();
  checkpointRun(save, { mode: 'roguelite', part: 7, player: 0 });
  let value;
  const storage = { getItem: () => value, setItem: (_, v) => { value = v; } };
  assert.equal(writeSave(save, storage), true);
  assert.equal(readSave(storage).checkpoint.part, 7);
  value = '{broken';
  assert.deepEqual(readSave(storage), freshSave());
  assert.equal(normalizeSave({ version: 1, upgrades: { armor: 999, supply: -4 } }).upgrades.armor, 3);
  assert.equal(normalizeSave({ version: 1, checkpoint: {mode:'roguelite',part:49} }).checkpoint, null);
  assert.equal(normalizeSave({ version: 1, checkpoint: {mode:'roguelite',part:2} }).checkpoint, null);
  assert.equal(normalizeSave({ version: 1, shards:'Infinity' }).shards, 0);
  assert.equal(writeSave(save, { setItem() { throw Error('quota'); } }), false);
});

test('high scores keep native point totals and separate Original from Roguelite', () => {
  const save = freshSave();
  const original = recordScore(save, { id: 'classic-run', mode: 'original', score: 12345, player: 0 });
  const rogue = recordScore(save, { id: 'rogue-run', mode: 'roguelite', score: 87654, player: 1, completed: true });
  assert.equal(original.accepted, true);
  assert.equal(original.rank, 1);
  assert.equal(original.entry.score, 12345);
  assert.equal(original.entry.name, 'Blip');
  assert.equal(rogue.entry.name, 'Blop');
  assert.equal(rogue.entry.completed, true);
  assert.deepEqual(getHighScores(save, 'original').map(entry => entry.score), [12345]);
  assert.deepEqual(getHighScores(save, 'roguelite').map(entry => entry.score), [87654]);
  assert.equal(save.shards, 0, 'recording a score does not also award progression');
  assert.equal(save.deaths, 0);
});

test('terminal score callbacks cannot duplicate or inflate a run across storage reloads', () => {
  const save = freshSave();
  recordScore(save, { id: 'one-run', mode: 'original', score: 12000, name: 'Elad' });
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  writeSave(save, storage);
  const reloaded = readSave(storage);
  const duplicate = recordScore(reloaded, { id: 'one-run', mode: 'original', score: 999999, completed: true });
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(getHighScores(reloaded, 'original').length, 1);
  assert.equal(getHighScores(reloaded, 'original')[0].score, 12000);
  assert.equal(getHighScores(reloaded, 'original')[0].name, 'Elad');
  assert.equal(recordScore(reloaded, { id: 'one-run', mode: 'roguelite', score: 500 }).accepted, true, 'run identity is scoped by mode');
});

test('checkpoint retries remain unranked and do not alter existing leaderboard entries', () => {
  const save = freshSave();
  recordScore(save, { id: 'full-run', mode: 'roguelite', score: 4000 });
  checkpointRun(save, { mode: 'roguelite', part: 19, player: 1 });
  const before = structuredClone(save);
  const result = recordScore(save, { id: 'late-stage-retry', mode: 'roguelite', score: 999999, completed: true, resumed: true });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'checkpoint');
  assert.deepEqual(save, before);
});

test('leaderboards retain the top ten and remember unranked terminal callbacks', () => {
  const save = freshSave();
  for (let i = 1; i <= HIGH_SCORE_LIMIT + 3; i++) {
    recordScore(save, { id: `run-${i}`, mode: 'original', score: i * 100 });
  }
  const scores = getHighScores(save, 'original');
  assert.equal(scores.length, HIGH_SCORE_LIMIT);
  assert.equal(scores[0].score, 1300);
  assert.equal(scores.at(-1).score, 400);
  const lowScore = recordScore(save, { id: 'low-score', mode: 'original', score: 1 });
  assert.equal(lowScore.accepted, true);
  assert.equal(lowScore.rank, null);
  const reloaded = normalizeSave(JSON.parse(JSON.stringify(save)));
  assert.equal(recordScore(reloaded, { id: 'low-score', mode: 'original', score: 900000 }).reason, 'duplicate');
  scores[0].score = 0;
  assert.equal(getHighScores(save, 'original')[0].score, 1300, 'UI receives copies rather than mutable saved entries');
});

test('optional score names have hero defaults and bounded Unicode-safe length', () => {
  assert.equal(scoreName(undefined, 0), 'Blip');
  assert.equal(scoreName('  \n\t  ', 1), 'Blop');
  assert.equal(scoreName('  אלעד\u202e\n  ', 0), 'אלעד');
  assert.equal(Array.from(scoreName('🙂'.repeat(30))).length, 24);
  const save = freshSave();
  const result = recordScore(save, { id: 'coop', mode: 'original', score: 120, name: '  Friends  ', player: 1, players: 2 });
  assert.equal(result.entry.name, 'Friends');
  assert.equal(result.entry.players, 2);
});

test('old saves gain empty boards and imported records are validated and deduplicated', () => {
  const legacy = normalizeSave({ version: 1, bestScore: 50000, shards: 30 });
  assert.deepEqual(legacy.highScores, { original: [], roguelite: [] });
  assert.equal(legacy.shards, 30);
  const save = normalizeSave({
    version: 1,
    highScores: {
      original: [
        { id: 'kept', score: 600, player: 1, recordedAt: 'bad-date' },
        { id: 'kept', score: 500 },
        { id: 'infinite', score: Infinity },
        { id: 'fraction', score: 4.2 },
        { id: 'negative', score: -1 },
        { id: 'wrong-mode', mode: 'roguelite', score: 99999 },
        { id: 'resumed', resumed: true, score: 99999 },
      ],
      roguelite: 'malformed',
    },
    scoredRuns: { original: ['settled', null, 'settled'] },
  });
  assert.equal(save.highScores.original.length, 1);
  assert.equal(save.highScores.original[0].score, 600);
  assert.equal(save.highScores.original[0].name, 'Blop');
  assert.equal(save.highScores.original[0].recordedAt, null);
  assert.deepEqual(save.highScores.roguelite, []);
  assert.equal(recordScore(save, { id: 'settled', mode: 'original', score: 12000 }).reason, 'duplicate');
  for (const score of [Infinity, NaN, -1, 0.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(recordScore(save, { id: 'invalid', mode: 'original', score }).reason, 'invalid');
  }
  assert.deepEqual(getHighScores(save, 'unknown'), []);
});
