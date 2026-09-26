import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../web/js/renderer.js';

// Simulate the canvas contract that matters here: resizing discards pixels,
// and native memory can be released without another simulation frame. Shader
// compilation, actual pixels and context restoration have a real-browser test.
function fallbackRenderer(t) {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  const screen = { drawn: null, fillRect() { this.drawn = null; }, drawImage(source) { this.drawn = [...source.context.pixels]; } };
  const source = { context: { createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }, putImageData(image) { this.pixels = [...image.data]; } }, getContext() { return this.context; } };
  const box = { width: 390, height: 580 };
  let width = 300, height = 150;
  const canvas = {
    get width() { return width; }, set width(value) { width = value; screen.drawn = null; },
    get height() { return height; }, set height(value) { height = value; screen.drawn = null; },
    getBoundingClientRect: () => box,
    getContext: kind => kind === 'webgl' ? null : screen,
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { createElement: () => source };
  const renderer = new Renderer(canvas);
  t.after(() => { renderer.destroy(); globalThis.window = originalWindow; globalThis.document = originalDocument; });
  return { renderer, canvas, box, screen };
}

test('a paused DPR-only resize re-presents the last frame after native memory is released', t => {
  const { renderer, canvas, screen } = fallbackRenderer(t);
  const heap = new Uint8Array([0,0,0,0,222,113,41,255,80,90,100,255]);
  renderer.draw({ HEAPU8: heap }, 4, 2, 1);
  const expected = [...screen.drawn];
  heap.fill(0);
  window.devicePixelRatio = 2;
  renderer.resize();
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1160);
  assert.deepEqual(screen.drawn, expected, 'resize clears the display, then replays owned pixels');
  assert.equal(renderer.frames, 1, 'a resize does not advance simulation');
});

test('a viewport callback that supplies a replacement native surface wins over the older retained frame', t => {
  const { renderer, box, screen } = fallbackRenderer(t);
  renderer.draw({ HEAPU8: new Uint8Array([0,0,0,0,222,113,41,255]) }, 4, 1, 1);
  renderer.onViewportChange = () => renderer.draw({ HEAPU8: new Uint8Array([0,0,0,0,80,90,100,255]) }, 4, 1, 1);
  box.width = 844; box.height = 330;
  renderer.resize();
  assert.deepEqual(screen.drawn, [80,90,100,255]);
});

test('padded rows and retained depth survive a resize and a paused graphics-mode change', t => {
  const { renderer, screen } = fallbackRenderer(t);
  const heap = new Uint8Array(36);
  heap.set([10,20,30,255,9,9,9,9,40,50,60,255,9,9,9,9],4);
  heap.set([100,100,100,255,200,200,200,255],24);
  renderer.draw({ HEAPU8: heap }, 4, 1, 2, 8, 24);
  assert.deepEqual(screen.drawn, [10,20,30,255,40,50,60,255]);
  heap.fill(0);
  renderer.mode = 'depth';
  renderer.present();
  assert.deepEqual(screen.drawn, [100,100,100,255,200,200,200,255]);
  window.devicePixelRatio = 2;
  renderer.resize();
  assert.deepEqual(screen.drawn, [100,100,100,255,200,200,200,255]);
});
