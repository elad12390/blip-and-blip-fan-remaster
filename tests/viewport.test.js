import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureViewport, fitFrame, gameplayView, followCameraY } from '../web/js/viewport.js';
import { Engine } from '../web/js/engine.js';

test('phones zoom in for readable heroes while the play window follows the screen shape', () => {
  const portrait = measureViewport(390, 520, 3), landscape = measureViewport(844, 390, 3), desktop = measureViewport(1440, 828, 2);
  for (const viewport of [portrait, landscape, desktop]) assert.equal(viewport.nativeHeight, 480, 'native frames always hold the full level height');
  assert.equal(portrait.visibleHeight, 480, 'narrow portrait keeps the full height rather than a sliver of level');
  assert.ok(portrait.nativeWidth < 640 && portrait.nativeWidth >= 240);
  assert.ok(landscape.visibleHeight < 400, 'short landscape phones zoom in');
  assert.ok(landscape.cssHeight / landscape.visibleHeight >= 1.1, 'heroes drawn at >= 1.1 CSS px per world unit');
  assert.ok(landscape.nativeWidth > 640, 'landscape still shows more of the level ahead than the original');
  assert.equal(desktop.visibleHeight, 480);
  for (const viewport of [landscape, desktop]) {
    assert.ok(Math.abs(viewport.nativeWidth / viewport.visibleHeight - viewport.cssWidth / viewport.cssHeight) < 0.01, 'play window matches the display shape');
  }
  assert.equal(measureViewport(5120, 1080, 1).nativeWidth, 1600, 'ultrawide play width is capped');
});

test('gameplay framing fills the display and never shows beyond the level height', () => {
  const phone = gameplayView(767, 1688, 780);
  assert.ok(Math.abs(phone.width - 1688) < 1e-6 && Math.abs(phone.x) < 1e-6, 'fills the width');
  assert.ok(phone.visibleHeight < 480 && phone.maxCameraY > 0, 'vertical slice with room to follow');
  const arena = gameplayView(640, 780, 1040);
  assert.equal(arena.visibleHeight, 480, 'a locked 640 arena in portrait shows the full height');
  assert.ok(arena.y > 0 && arena.maxCameraY === 0, 'centred with no vertical camera travel');
  assert.ok(Math.abs(arena.width - 780) < 1e-6, 'the whole arena width stays on screen');
});

test('the vertical camera keeps the hero low in view, glides, and stays inside the level', () => {
  const view = gameplayView(767, 1688, 780);
  const snapped = followCameraY(undefined, 450, view, 0);
  assert.equal(snapped, view.maxCameraY, 'standing on the floor shows the bottom of the level');
  const glide = followCameraY(snapped, 100, view, 1 / 60);
  assert.ok(glide < snapped && glide > followCameraY(undefined, 100, view, 0), 'moves part of the way per frame');
  assert.equal(followCameraY(undefined, -500, view, 0), 0);
});

test('DPR sharpens display pixels without changing camera scope and respects mobile GPU budget', () => {
  const standard = measureViewport(390, 570, 1), retina = measureViewport(390, 570, 3);
  assert.equal(standard.nativeWidth, retina.nativeWidth);
  assert.equal(retina.pixelWidth, 780);
  assert.equal(retina.pixelHeight, 1140);
  for (const [width, height] of [[3840,2160],[5120,1440],[7680,4320]]) {
    const viewport = measureViewport(width, height, 3);
    assert.ok(viewport.pixelWidth * viewport.pixelHeight <= 3_000_000);
    assert.ok(Math.abs(viewport.pixelWidth / viewport.pixelHeight - width / height) < .005);
  }
});

test('cinematic fitting shows the entire authored frame without stretching at any display aspect', () => {
  for (const [width, height] of [[390,570],[844,330],[1920,1080],[3440,1440]]) {
    const frame = fitFrame(640, 480, width, height);
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(frame.width <= width + .001 && frame.height <= height + .001);
    assert.equal(frame.width / frame.height, 4 / 3);
    assert.ok(frame.x < .001 || frame.y < .001, 'one dimension fills, only cinematic composition introduces space');
  }
});

test('hidden or invalid layouts never replace a valid native camera request', () => {
  for (const [width, height] of [[0,0],[390,0],[NaN,480],[640,Infinity],[-1,480]]) {
    assert.equal(measureViewport(width, height, 2), null);
  }
  assert.equal(measureViewport(390, 570, NaN).dpr, 1);
  const calls = [], engine = new Engine({});
  engine.setViewport(1120, 480);
  engine.setViewport(0, 0);
  engine.module = { _bb_set_viewport: (...args) => calls.push(args) };
  engine.applyViewport();
  assert.deepEqual(calls, [[1120,480]], 'preload measurement survives until native initialization');
  engine.setViewport(390, 570);
  assert.deepEqual(calls.at(-1), [328,480], 'rotation is forwarded to a loaded engine');
  engine.setViewport(4000, 480);
  assert.deepEqual(calls.at(-1), [1600,480], 'requests are capped at the widest supported play window');
});
