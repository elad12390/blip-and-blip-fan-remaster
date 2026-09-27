import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../web/js/ui/ui.js';

// Minimal browser surface for the canvas interface: events, a recording 2D
// context, gamepads and manual animation frames.
function harness(t) {
  const listeners = new Map(), canvasListeners = new Map(), frames = [];
  let pads = [];
  const on = map => (type, cb) => { if (!map.has(type)) map.set(type, []); map.get(type).push(cb); };
  const ctx = new Proxy({}, { get: (target, key) => target[key] ?? (() => ({ addColorStop() {} })), set: (target, key, value) => { target[key] = value; return true; } });
  const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }), addEventListener: on(canvasListeners), setPointerCapture() {} };
  const globals = {
    window: { addEventListener: on(listeners), devicePixelRatio: 1 },
    navigator: { getGamepads: () => pads },
    requestAnimationFrame: cb => frames.push(cb),
    performance: { now: () => 1000 },
  };
  for (const [name, value] of Object.entries(globals)) {
    const d = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (d) Object.defineProperty(globalThis, name, d); else delete globalThis[name]; });
  }
  const event = fields => ({ preventDefault() {}, target: { tagName: 'CANVAS' }, repeat: false, ...fields });
  return {
    canvas,
    key: code => { for (const cb of listeners.get('keydown') ?? []) cb(event({ code })); for (const cb of listeners.get('keyup') ?? []) cb(event({ code })); },
    pointer: (type, x, y, id = 1) => { for (const cb of canvasListeners.get(type) ?? []) cb(event({ clientX: x, clientY: y, pointerId: id })); },
    frame: () => { for (const cb of frames.splice(0)) cb(1000); },
    setPads: v => { pads = v; },
  };
}

const art = { fontMeta: { glyphs: {}, spaceWidth: 20 } };
const touchStub = () => ({ calls: [], down(id, x, y) { this.calls.push(['down', id, x, y]); return true; }, move() {}, up(id) { this.calls.push(['up', id]); }, releaseAll() { this.calls.push(['releaseAll']); } });

function screen({ modal, regions = [] } = {}) {
  return { modal, backs: 0, back() { this.backs++; }, draw(ui) { for (const [id, shape, options] of regions) ui.region(id, shape, options); } };
}

test('Escape and P pause from gameplay, but only the menu handles them once a menu is open', t => {
  const h = harness(t);
  let pauses = 0;
  const ui = new UI(h.canvas, art, { onPauseKey: () => pauses++, touch: touchStub() });
  ui.push(screen({ modal: false }));
  h.key('Escape'); h.key('KeyP');
  assert.equal(pauses, 2);
  const menu = screen({ modal: true });
  ui.push(menu);
  h.key('Escape');
  assert.equal(pauses, 2, 'gameplay pause key does not fire under a menu');
  assert.equal(menu.backs, 1, 'Escape goes back in menus');
});

test('keyboard focus moves spatially and Enter activates the focused button', t => {
  const h = harness(t), pressed = [];
  const ui = new UI(h.canvas, art, { touch: touchStub() });
  ui.push(screen({ modal: true, regions: [
    ['a', { x: 0, y: 0, w: 100, h: 40 }, { onPress: () => pressed.push('a'), primary: true }],
    ['b', { x: 0, y: 100, w: 100, h: 40 }, { onPress: () => pressed.push('b') }],
    ['c', { x: 200, y: 100, w: 100, h: 40 }, { onPress: () => pressed.push('c') }],
  ] }));
  h.frame();
  h.key('Enter');
  assert.deepEqual(pressed, [], 'the first Enter only reveals focus');
  h.key('Enter');
  assert.deepEqual(pressed, ['a'], 'the primary button is focused first');
  h.key('ArrowDown'); h.key('Enter');
  h.key('ArrowRight'); h.key('Enter');
  assert.deepEqual(pressed, ['a', 'b', 'c']);
});

test('a button activates on release inside it, and not when the pointer slides off', t => {
  const h = harness(t), pressed = [];
  const ui = new UI(h.canvas, art, { touch: touchStub() });
  ui.push(screen({ modal: true, regions: [['go', { x: 0, y: 0, w: 100, h: 40 }, { onPress: () => pressed.push('go') }]] }));
  h.frame();
  h.pointer('pointerdown', 10, 10); h.pointer('pointerup', 300, 300);
  assert.deepEqual(pressed, []);
  h.pointer('pointerdown', 10, 10); h.pointer('pointerup', 20, 20);
  assert.deepEqual(pressed, ['go']);
});

test('game touch controls only receive contacts outside interface buttons and never under a menu', t => {
  const h = harness(t), touch = touchStub();
  const ui = new UI(h.canvas, art, { touch });
  let paused = 0;
  ui.push(screen({ modal: false, regions: [['pause', { cx: 780, cy: 20, r: 20 }, { onDown: () => paused++, focusable: false }]] }));
  h.frame();
  h.pointer('pointerdown', 780, 20, 1);
  h.pointer('pointerdown', 100, 300, 2);
  assert.equal(paused, 1);
  assert.deepEqual(touch.calls.filter(c => c[0] === 'down').map(c => c[1]), [2]);
  h.pointer('pointerup', 100, 300, 2);
  assert.deepEqual(touch.calls.at(-1), ['up', 2]);
  ui.push(screen({ modal: true }));
  h.frame();
  h.pointer('pointerdown', 100, 300, 3);
  assert.equal(touch.calls.filter(c => c[0] === 'down').length, 1, 'menus block the controller');
});

test('gamepad Start is edge triggered: pauses from gameplay and backs out of menus', t => {
  const h = harness(t);
  let pauses = 0;
  const ui = new UI(h.canvas, art, { onPauseKey: () => pauses++, touch: touchStub() });
  ui.push(screen({ modal: false }));
  const pad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  h.setPads([pad]);
  pad.buttons[9].pressed = true;
  h.frame(); h.frame();
  assert.equal(pauses, 1, 'holding Start toggles once');
  const menu = screen({ modal: true });
  ui.push(menu);
  pad.buttons[9].pressed = false; h.frame();
  pad.buttons[9].pressed = true; h.frame();
  assert.equal(pauses, 1);
  assert.equal(menu.backs, 1);
});
