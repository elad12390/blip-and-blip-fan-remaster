import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../web/js/input.js';
import { Engine } from '../web/js/engine.js';

// This harness supplies browser event delivery only. All input state transitions
// and engine lifecycle behavior under test come from the production modules.
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    dispatch(type, fields = {}) {
      const event = {
        target: { tagName: 'CANVAS' },
        repeat: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...fields,
      };
      for (const callback of listeners.get(type) ?? []) callback(event);
      return event;
    },
  };
}

function browserHarness(t) {
  const win = eventTarget();
  const doc = eventTarget();
  const scripts = [];
  const frames = [];
  const nativeCanvas = {};
  let pads = [], dialogOpen = false;
  Object.assign(doc, {
    hidden: false,
    querySelectorAll: () => [],
    querySelector(selector) {
      if (selector === '#native-screen') return nativeCanvas;
      if (selector === 'dialog[open]') return dialogOpen ? {} : null;
      return null;
    },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { removed: false, remove() { this.removed = true; } };
    },
    head: { append(script) { scripts.push(script); } },
  });
  for (const [name, value] of Object.entries({
    window: win,
    document: doc,
    navigator: { getGamepads: () => pads },
    requestAnimationFrame(callback) { frames.push(callback); },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    });
  }
  return {
    win, doc, scripts, nativeCanvas,
    setPads(value) { pads = value; },
    setDialogOpen(value) { dialogOpen = value; },
    frame() {
      const callbacks = frames.splice(0);
      assert.ok(callbacks.length, 'Input scheduled a browser frame');
      for (const callback of callbacks) callback();
    },
  };
}

test('keyboard pause releases held controls and the same key resumes while input is disabled', t => {
  const h = browserHarness(t), masks = [];
  let pauses = 0;
  const input = new Input(mask => masks.push(mask), {
    onPause() { pauses++; input.enable(!input.active); },
  });
  input.enable(true);
  h.win.dispatch('keydown', { code: 'ArrowRight' });
  h.win.dispatch('keydown', { code: 'KeyJ' });
  assert.equal(masks.at(-1), 2 | 16);

  assert.equal(h.win.dispatch('keydown', { code: 'Escape' }).defaultPrevented, true);
  assert.equal(input.active, false);
  assert.equal(masks.at(-1), 0, 'pausing clears movement and fire');
  h.win.dispatch('keydown', { code: 'Escape', repeat: true });
  h.win.dispatch('keydown', { code: 'ArrowLeft' });
  assert.equal(pauses, 1, 'holding pause does not toggle repeatedly');
  assert.equal(masks.at(-1), 0, 'gameplay keys stay silent while paused');

  h.win.dispatch('keyup', { code: 'Escape' });
  h.win.dispatch('keydown', { code: 'Escape' });
  assert.equal(pauses, 2);
  assert.equal(input.active, true);
  assert.equal(masks.at(-1), 0, 'resuming does not restore stale held controls');
  h.win.dispatch('keydown', { code: 'KeyJ' });
  assert.equal(masks.at(-1), 16);
  h.win.dispatch('keydown', { code: 'KeyP' });
  h.win.dispatch('keyup', { code: 'KeyP' });
  h.win.dispatch('keydown', { code: 'KeyP' });
  assert.equal(pauses, 4, 'the alternative pause binding resumes too');
  assert.equal(input.active, true);
});

test('keyboard pause does not steal editing or open-dialog keystrokes', t => {
  const h = browserHarness(t);
  let pauses = 0;
  new Input(() => {}, { onPause() { pauses++; } });
  h.win.dispatch('keydown', { code: 'KeyP', target: { tagName: 'INPUT' } });
  h.win.dispatch('keydown', { code: 'Escape', target: { tagName: 'SELECT' } });
  h.setDialogOpen(true);
  h.win.dispatch('keydown', { code: 'Escape' });
  assert.equal(pauses, 0);
  h.setDialogOpen(false);
  h.win.dispatch('keydown', { code: 'Escape' });
  assert.equal(pauses, 1);
});

test('gamepad Start is edge-triggered and can resume after gameplay polling is disabled', t => {
  const h = browserHarness(t), masks = [];
  const pad = { axes: [1, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  h.setPads([pad]);
  let pauses = 0;
  const input = new Input(mask => masks.push(mask), {
    onPause() { pauses++; input.enable(!input.active); },
  });
  input.enable(true);
  h.frame();
  assert.equal(masks.at(-1), 2);
  pad.buttons[9].pressed = true;
  h.frame();
  assert.equal(input.active, false);
  assert.equal(masks.at(-1), 0);
  h.frame();
  assert.equal(pauses, 1, 'holding Start causes only one transition');
  pad.buttons[9].pressed = false;
  h.frame();
  pad.axes[0] = 0;
  pad.buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 2);
  assert.equal(input.active, true);
  assert.equal(masks.at(-1), 0);
  pad.buttons[9].pressed = false;
  pad.buttons[2].pressed = true;
  h.frame();
  assert.equal(masks.at(-1), 16 | 128, 'X fires and confirms briefings');
  h.setPads([]);
  h.frame();
  assert.equal(masks.at(-1), 0, 'disconnecting a firing gamepad releases fire');
});

test('focus loss releases both co-op players independently', t => {
  const h = browserHarness(t), p1 = [], p2 = [];
  const input = new Input(mask => p1.push(mask), { send2: mask => p2.push(mask) });
  input.coop = true;
  input.enable(true);
  h.win.dispatch('keydown', { code: 'KeyD' });
  h.win.dispatch('keydown', { code: 'KeyF' });
  h.win.dispatch('keydown', { code: 'ArrowLeft' });
  h.win.dispatch('keydown', { code: 'KeyJ' });
  assert.equal(p1.at(-1), 2 | 16);
  assert.equal(p2.at(-1), 1 | 16);
  h.win.dispatch('keyup', { code: 'KeyF' });
  assert.equal(p1.at(-1), 2);
  assert.equal(p2.at(-1), 1 | 16);
  h.win.dispatch('blur');
  assert.equal(p1.at(-1), 0);
  assert.equal(p2.at(-1), 0);
});

test('gamepad Start cannot resume a paused game behind an open modal', t => {
  const h = browserHarness(t);
  const pad = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  h.setPads([pad]);
  let pauses = 0;
  const input = new Input(() => {}, {
    onPause() { pauses++; input.enable(!input.active); },
  });
  input.enable(false);
  h.setDialogOpen(true);
  pad.buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 0);
  assert.equal(input.active, false);
  h.setDialogOpen(false);
  h.frame();
  assert.equal(pauses, 0, 'closing the modal does not apply a stale held Start');
  pad.buttons[9].pressed = false;
  h.frame();
  pad.buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 1);
  assert.equal(input.active, true);
});

test('two gamepads keep independent co-op controls and stable slots on disconnect', t => {
  const h = browserHarness(t), p1 = [], p2 = [];
  const pad = () => ({ axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) });
  const first = pad(), second = pad();
  first.axes[0] = 1;
  first.buttons[7].pressed = true;
  second.axes[0] = -1;
  second.buttons[1].pressed = true;
  h.setPads([first, second]);
  const input = new Input(mask => p1.push(mask), { send2: mask => p2.push(mask) });
  input.coop = true;
  input.enable(true);
  h.frame();
  assert.equal(p1.at(-1), 2 | 16);
  assert.equal(p2.at(-1), 1 | 64);
  h.win.dispatch('keydown', { code: 'KeyW' });
  h.win.dispatch('keydown', { code: 'ArrowDown' });
  h.frame();
  assert.equal(p1.at(-1), 2 | 16 | 4, 'gamepad polling preserves P1 keyboard input');
  assert.equal(p2.at(-1), 1 | 64 | 8, 'gamepad polling preserves P2 keyboard input');
  h.setPads([null, second]);
  h.frame();
  assert.equal(p1.at(-1), 4, 'disconnect only clears the gamepad source');
  assert.equal(p2.at(-1), 1 | 64 | 8, 'P2 stays P2 when the first slot becomes empty');
  second.connected = false;
  h.frame();
  assert.equal(p2.at(-1), 8, 'an explicitly disconnected pad releases its controls');
});

test('either co-op gamepad can confirm a briefing with A or X while retaining its own action', t => {
  const h = browserHarness(t), p1 = [], p2 = [];
  const first = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  const second = { axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) };
  h.setPads([first, second]);
  const input = new Input(mask => p1.push(mask), { send2: mask => p2.push(mask) });
  input.coop = true;
  input.enable(true);
  first.buttons[0].pressed = true;
  h.frame();
  assert.equal(p1.at(-1), 32 | 128);
  assert.equal(p2.at(-1), 0);
  first.buttons[0].pressed = false;
  second.buttons[2].pressed = true;
  h.frame();
  assert.equal(p1.at(-1), 128, 'P2 forwards only the shared briefing confirmation to P1');
  assert.equal(p2.at(-1), 16 | 128, 'P2 X still fires P2, not P1');
  second.buttons[2].pressed = false;
  second.buttons[0].pressed = true;
  h.frame();
  assert.equal(p1.at(-1), 128);
  assert.equal(p2.at(-1), 32 | 128);
  h.setPads([first]);
  h.frame();
  assert.equal(p1.at(-1), 0, 'disconnect clears shared confirm');
  assert.equal(p2.at(-1), 0);
});

test('either co-op Start pauses and resumes, simultaneous edges toggle only once', t => {
  const h = browserHarness(t);
  const pads = Array.from({ length: 2 }, () => ({ axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) }));
  h.setPads(pads);
  let pauses = 0;
  const input = new Input(() => {}, { onPause() { pauses++; input.enable(!input.active); } });
  input.coop = true;
  input.enable(true);
  pads[0].buttons[9].pressed = pads[1].buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 1);
  assert.equal(input.active, false);
  h.frame();
  assert.equal(pauses, 1);
  pads[1].buttons[9].pressed = false;
  h.frame();
  pads[1].buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 2, 'P2 can resume while P1 still holds Start');
  assert.equal(input.active, true);
});

test('gamepad polling cannot reassert either player while blurred, hidden or behind a modal', t => {
  const h = browserHarness(t), p1 = [], p2 = [];
  const pads = Array.from({ length: 2 }, () => ({ axes: [1, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false })) }));
  h.setPads(pads);
  let pauses = 0;
  const input = new Input(mask => p1.push(mask), { send2: mask => p2.push(mask), onPause() { pauses++; } });
  input.coop = true;
  input.enable(true);
  h.frame();
  h.win.dispatch('blur');
  pads[1].buttons[9].pressed = true;
  h.frame();
  assert.equal(p1.at(-1), 0);
  assert.equal(p2.at(-1), 0);
  assert.equal(pauses, 0);
  h.win.dispatch('focus');
  h.frame();
  assert.equal(pauses, 0, 'focus restoration does not apply Start held in the background');
  assert.equal(p1.at(-1), 2);
  assert.equal(p2.at(-1), 2);
  h.doc.hidden = true;
  h.doc.dispatch('visibilitychange');
  h.frame();
  assert.equal(p1.at(-1), 0);
  assert.equal(p2.at(-1), 0);
  h.doc.hidden = false;
  h.doc.dispatch('visibilitychange');
  h.setDialogOpen(true);
  pads[1].buttons[9].pressed = false;
  h.frame();
  pads[1].buttons[9].pressed = true;
  h.frame();
  assert.equal(pauses, 0);
  assert.equal(p1.at(-1), 0);
  assert.equal(p2.at(-1), 0);
  h.setDialogOpen(false);
  h.frame();
  assert.equal(pauses, 0, 'closing a modal does not apply the second pad held Start');
});

test('the second gamepad stays inactive in solo mode', t => {
  const h = browserHarness(t), p1 = [], p2 = [];
  const second = { axes: [1, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: true })) };
  h.setPads([null, second]);
  let pauses = 0;
  const input = new Input(mask => p1.push(mask), { send2: mask => p2.push(mask), onPause() { pauses++; } });
  input.enable(true);
  h.frame();
  assert.equal(p1.at(-1), 0);
  assert.equal(p2.at(-1), 0);
  assert.equal(pauses, 0);
});

test('an engine script download failure can retry with a new module and script', async t => {
  const h = browserHarness(t);
  const engine = new Engine({});
  // Real manifest/filesystem loading is covered by the browser integration run.
  engine.loadResources = async () => {};
  const first = engine.load();
  const firstModule = h.win.Module;
  const failed = assert.rejects(first, /could not be downloaded/);
  h.scripts[0].onerror();
  await failed;
  assert.equal(engine.ready, false);
  assert.equal(engine.module, null);
  assert.equal(h.scripts[0].removed, true);

  const second = engine.load();
  assert.equal(h.scripts.length, 2);
  assert.notEqual(h.win.Module, firstModule);
  assert.equal(h.win.Module.canvas, h.nativeCanvas);
  await h.win.Module.onRuntimeInitialized();
  assert.equal(await second, engine);
  assert.equal(engine.ready, true);
  assert.equal(engine.module, h.win.Module);
});

test('an engine initialization abort rejects all waiting callers and the next load retries', async t => {
  const h = browserHarness(t);
  const engine = new Engine({});
  engine.loadResources = async () => {};
  const first = engine.load();
  const alsoWaiting = engine.load();
  assert.equal(h.scripts.length, 1, 'concurrent callers share the download');
  const failed = Promise.all([
    assert.rejects(first, /Game engine stopped: invalid wasm/),
    assert.rejects(alsoWaiting, /Game engine stopped: invalid wasm/),
  ]);
  h.win.Module.onAbort('invalid wasm');
  await failed;
  assert.equal(h.scripts[0].removed, true);
  const retry = engine.load();
  assert.equal(h.scripts.length, 2);
  await h.win.Module.onRuntimeInitialized();
  assert.equal(await retry, engine);
  assert.equal(engine.ready, true);
});

test('an abort after initialization resets the completed load so recovery creates a new runtime', async t => {
  const h = browserHarness(t), errors = [];
  const engine = new Engine({ onError: error => errors.push(error) });
  engine.loadResources = async () => {};
  const initialLoad = engine.load();
  await h.win.Module.onRuntimeInitialized();
  await initialLoad;
  const oldModule = engine.module;
  engine.running = true;
  engine.poll = setInterval(() => {}, 60_000);
  t.after(() => clearInterval(engine.poll));
  oldModule.onAbort('runtime failure');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /runtime failure/);
  assert.equal(engine.running, false);
  assert.equal(engine.ready, false);
  assert.equal(engine.module, null);

  const retry = engine.load();
  assert.equal(h.scripts.length, 2);
  assert.notEqual(h.win.Module, oldModule);
  await h.win.Module.onRuntimeInitialized();
  assert.equal(await retry, engine);
  assert.equal(engine.ready, true);
});

test('engine readiness waits for game resources and a resource failure can retry', async t => {
  const h = browserHarness(t);
  const engine = new Engine({});
  const pendingResources = [];
  engine.loadResources = module => new Promise((resolve, reject) => {
    pendingResources.push({ module, resolve, reject });
  });
  const first = engine.load();
  const firstRuntime = h.win.Module.onRuntimeInitialized();
  assert.equal(pendingResources.length, 1);
  assert.notEqual(engine.ready, true, 'WASM initialization alone is not ready');
  assert.equal(pendingResources[0].module, h.win.Module);
  const failed = assert.rejects(first, /Incomplete game file/);
  pendingResources[0].reject(Error('Incomplete game file: snuf1.lvl'));
  await firstRuntime;
  await failed;
  assert.equal(engine.ready, false);
  assert.equal(engine.module, null);

  const retry = engine.load();
  const retryRuntime = h.win.Module.onRuntimeInitialized();
  assert.equal(h.scripts.length, 2);
  assert.equal(engine.ready, false);
  pendingResources[1].resolve();
  await retryRuntime;
  assert.equal(await retry, engine);
  assert.equal(engine.ready, true);
});

test('resources from an aborted load cannot mark a later runtime ready', async t => {
  const h = browserHarness(t);
  const engine = new Engine({});
  const pendingResources = [];
  engine.loadResources = () => new Promise(resolve => pendingResources.push(resolve));
  const oldLoad = engine.load();
  const oldModule = h.win.Module;
  const oldRuntime = oldModule.onRuntimeInitialized();
  const aborted = assert.rejects(oldLoad, /aborted during resource download/);
  oldModule.onAbort('aborted during resource download');
  await aborted;

  const retry = engine.load();
  const newModule = h.win.Module;
  const newRuntime = newModule.onRuntimeInitialized();
  assert.notEqual(newModule, oldModule);
  assert.equal(engine.ready, false);
  pendingResources[0]();
  await oldRuntime;
  const prematureReadiness = engine.ready;
  pendingResources[1]();
  await newRuntime;
  await retry;
  assert.equal(prematureReadiness, false, 'the retry still needed its own game resources');
  assert.equal(engine.ready, true);
  assert.equal(engine.module, newModule);
});
