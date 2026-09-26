import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureViewport, fitFrame } from '../web/js/viewport.js';
import { Engine } from '../web/js/engine.js';

test('phone rotation changes the world camera and keeps native vertical scale', () => {
  const portrait = measureViewport(390, 570, 3);
  const landscape = measureViewport(844, 330, 3);
  assert.equal(portrait.nativeHeight, 480);
  assert.equal(landscape.nativeHeight, 480);
  assert.ok(portrait.nativeWidth < 640, 'portrait shows a narrower camera, not a tiny 4:3 game');
  assert.ok(landscape.nativeWidth > 640, 'landscape reveals additional horizontal world');
  for (const viewport of [portrait, landscape]) {
    assert.ok(Math.abs(viewport.nativeWidth / 480 - viewport.cssWidth / viewport.cssHeight) < 1 / 480);
    const fit = fitFrame(viewport.nativeWidth, 480, viewport.pixelWidth, viewport.pixelHeight);
    assert.ok(fit.x < 1 && fit.y < 1, 'adaptive gameplay fills the play area to rounding precision');
    assert.equal(fit.width / viewport.nativeWidth, fit.height / 480, 'sprites retain equal X/Y scale');
  }
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
});
