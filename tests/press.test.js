import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onPress } from '../web/js/press.js';

function control() {
  const listeners = new Map(), captures = new Set();
  return {
    classList: { add() {}, remove() {} },
    addEventListener(name, callback) { listeners.set(name, callback); },
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); },
    getBoundingClientRect() { return { left: 0, right: 44, top: 0, bottom: 44 }; },
    fire(type, fields = {}) { listeners.get(type)?.({ pointerId: 2, isPrimary: false, button: 0, clientX: 20, clientY: 20, preventDefault() {}, ...fields }); },
  };
}
test('secondary-thumb HUD presses activate once without a synthesized click', () => {
  const button = control(); let activations = 0;
  onPress(button, () => activations++);
  button.fire('pointerdown'); button.fire('pointerup');
  assert.equal(activations, 1);
  button.fire('click', { detail: 1 });
  assert.equal(activations, 1, 'a synthesized pointer click cannot toggle twice');
  button.fire('click', { detail: 0 });
  assert.equal(activations, 2, 'keyboard and screen-reader activation still works');
});
test('canceled, dragged-away, and unrelated pointers never activate a HUD button', () => {
  const button = control(); let activations = 0;
  onPress(button, () => activations++);
  button.fire('pointerdown'); button.fire('pointerup', { pointerId: 8 });
  assert.equal(activations, 0);
  button.fire('pointercancel'); button.fire('pointerup');
  button.fire('pointerdown'); button.fire('pointerup', { clientX: 90 });
  button.fire('pointerdown'); button.fire('lostpointercapture'); button.fire('pointerup');
  assert.equal(activations, 0);
});
