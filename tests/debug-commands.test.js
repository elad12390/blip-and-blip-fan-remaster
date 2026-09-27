import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute, complete, CODES, COMMANDS } from '../web/js/debug-commands.js';

function api(overrides = {}) {
  const calls = [];
  return {
    calls,
    inGame: () => true,
    state: () => ({ part: 3, mode: 'original', difficulty: 1, hp: 5, maxHp: 5, lives: 3, weapon: 0, ammo: 0, cows: 1, score: 10, kills: 2, viewportWidth: 640, offset: 4504, locked: true }),
    world: () => ({ god: 0, offset: 4504, levelSize: 8320, scrW: 640, scrollSpeed: 0, holdFire: 0, locked: 1, lock: [4504, 2, 0, 666], flags: [1, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0], enemies: [{ i: 0, type: 'EnnemiSmurfCostaud', x: 4641, y: 437, pv: 0, count: 1 }], players: [{ x: 4400, y: 430, hp: 5, lives: 3 }, null], gens: 0, waiting: 1, nextEvent: 4746 }),
    cheat: (op, a, b) => { calls.push([op, a, b]); return op === 7 ? 3 : a; },
    warp: part => calls.push(['warp', part]),
    setDifficulty: level => calls.push(['difficulty', level]),
    setShards: n => calls.push(['shards', n]),
    toggleFps: () => true,
    engineLog: () => [],
    clear: () => calls.push(['clear']),
    speed: p => { calls.push(['speed', p]); return p; },
    autoplay: on => { if (on !== undefined) calls.push(['autoplay', on]); return false; },
    entity: (i, f, v) => { calls.push(['entity', i, f, v]); return v; },
    spawn: (id, x, y, d) => { calls.push(['spawn', id, x, y, d]); return 1; },
    flag: (i, v) => calls.push(['flag', i, v]),
    unlock: () => 1,
    ...overrides,
  };
}

test('commands validate input and call the engine cheat API with the right operation', () => {
  const a = api();
  assert.deepEqual(execute(a, 'weapon laser 500'), ['Equipped laser.']);
  assert.deepEqual(a.calls.at(-1), [4, 4, 500]);
  execute(a, 'cows 9'); execute(a, 'god on'); execute(a, 'skip');
  assert.deepEqual(a.calls.slice(-3), [[5, 9, 0], [1, 1, 0], [6, 0, 0]]);
  assert.throws(() => execute(a, 'health 0'), /1 to 100/);
  assert.throws(() => execute(a, 'weapon bazooka'), /m16, shotgun/);
  assert.throws(() => execute(a, 'warp 2'), /Not a playable stage/);
  assert.throws(() => execute(a, 'dance'), /Unknown command/);
});

test('world explains why a fight is still locked', () => {
  const lines = execute(api(), 'world');
  assert.ok(lines.some(l => l.includes('until flag 0 = 666')));
  assert.ok(lines.some(l => l.includes('EnnemiSmurfCostaud x1')));
});

test('cheat codes work as single words and gameplay cheats need a running stage', () => {
  const a = api();
  execute(a, 'IDDQD');
  assert.deepEqual(a.calls.at(-1), [1, 1, 0]);
  execute(a, 'ballsofsteel');
  assert.deepEqual(a.calls.slice(-4).map(c => c[0]), [1, 4, 5, 3]);
  const idle = api({ inGame: () => false });
  assert.throws(() => execute(idle, 'iddqd'), /Start a stage/);
  assert.deepEqual(execute(idle, 'stages').length, 12, 'non-gameplay commands still work');
  for (const code of Object.keys(CODES)) assert.ok(!COMMANDS[code], `${code} does not shadow a command`);
});

test('warp, difficulty and completion', () => {
  const a = api();
  execute(a, 'warp 21'); execute(a, 'difficulty insane');
  assert.deepEqual(a.calls.slice(-2), [['warp', 21], ['difficulty', 3]]);
  assert.deepEqual(complete('we'), ['weapon']);
});

test('test mode switches on god, autoplay and fast-forward in one command', () => {
  const a = api();
  execute(a, 'test 16');
  assert.deepEqual(a.calls.slice(-3), [[1, 1, 0], ['autoplay', true], ['speed', 1600]]);
  execute(a, 'test off');
  assert.deepEqual(a.calls.slice(-3), [['autoplay', false], ['speed', 100], [1, 0, 0]]);
  assert.throws(() => execute(a, 'speed 100'), /0.25 and 32/);
});

test('entities can be edited, spawned and removed by index or player', () => {
  const a = api();
  execute(a, 'set p1 x 4000'); execute(a, 'set 0 hp 1'); execute(a, 'spawn costaud 4700 430 left'); execute(a, 'remove 0'); execute(a, 'flag 0 7');
  assert.deepEqual(a.calls.slice(-5), [['entity', -1, 0, 4000], ['entity', 0, 2, 1], ['spawn', 5, 4700, 430, 0], ['entity', 0, 5, 0], ['flag', 0, 7]]);
  assert.throws(() => execute(a, 'set boss hp 1'), /p1, p2 or an enemy index/);
  assert.throws(() => execute(a, 'spawn dragon'), /Unknown enemy/);
});

test('autopilot shoots scripted targets like the Lara weight once ordinary enemies are gone', async () => {
  const { createAutopilot, autopilotStep } = await import('../web/js/autopilot.js');
  const m = createAutopilot();
  const state = { inGame: true, frameIsGameplay: true, dialogue: null };
  const world = { offset: 417, scrW: 640, players: [{ x: 700, y: 440 }], enemies: [
    { i: 0, type: 'EnnemiPoid', x: 565, y: 102, pv: 1000, count: 0 },
    { i: 1, type: 'EnnemiPic', x: 600, y: 366, pv: 1, count: 0 },
  ] };
  const bits = autopilotStep(m, state, world);
  assert.equal(bits & 1, 1, 'walks left to get beside it (it only moves when hit from the left)');
  assert.equal(bits & 16, 16, 'fires');
  world.players[0].x = 447;
  const there = autopilotStep(m, state, world);
  assert.equal(there & (2 | 4), 2 | 4, 'aims diagonally up-right from the left wall');
});

test('autopilot gives up on a target that never takes damage and tries the others', async () => {
  const { createAutopilot, autopilotStep } = await import('../web/js/autopilot.js');
  const m = createAutopilot();
  const state = { inGame: true, frameIsGameplay: true, dialogue: null };
  const world = { offset: 417, scrW: 640, players: [{ x: 850, y: 440 }], enemies: [
    { i: 0, type: 'EnnemiPoid', x: 565, y: 102, pv: 1000, count: 0 },
    { i: 1, type: 'EnnemiLara', x: 933, y: 440, pv: 15000, count: 1 },
  ] };
  for (let i = 0; i < 160; i++) autopilotStep(m, state, world);
  const bits = autopilotStep(m, state, world);
  assert.equal(bits & 1, 1, 'now heading for the weight instead of standing at Lara');
});
