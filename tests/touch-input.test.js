import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TouchController } from '../web/js/ui/touch.js';
import { computeLayout } from '../web/js/ui/layout.js';

// Real controller logic with the input aggregation reduced to a source map.
function controller(options) {
  const sources = new Map();
  const touch = new TouchController({ set: (id, bits) => sources.set(id, bits), clear: id => sources.delete(id) });
  if (options) touch.configure(options);
  const layout = computeLayout({ width: 844, height: 390, touch: true });
  touch.setZones({ stick: layout.stick, buttons: Object.values(layout.buttons) });
  const mask = () => [...sources.values()].reduce((a, b) => a | b, 0);
  return { touch, layout, mask };
}

test('floating joystick starts under the thumb anywhere in its zone and covers all eight directions', () => {
  const { touch, layout, mask } = controller();
  const x = layout.stick.x + layout.stick.w * .6, y = layout.stick.y + layout.stick.h * .5;
  assert.equal(touch.down(1, x, y), true);
  assert.equal(touch.stick.originX, x, 'origin follows the thumb');
  assert.equal(mask(), 0, 'touching down alone does not move');
  const expected = [2, 2 | 8, 8, 1 | 8, 1, 1 | 4, 4, 2 | 4];
  for (let sector = 0; sector < 8; sector++) {
    const a = sector * Math.PI / 4;
    touch.releasePointer(1); touch.down(1, x, y);
    touch.move(1, x + Math.cos(a) * 40, y + Math.sin(a) * 40);
    assert.equal(mask(), expected[sector], `sector ${sector}`);
  }
  touch.up(1);
  assert.equal(mask(), 0);
});

test('one pointer owns movement while fire, jump and cow stay independent simultaneous actions', () => {
  const { touch, layout, mask } = controller();
  const { fire, jump, cow } = layout.buttons;
  touch.down(1, layout.stick.restX, layout.stick.restY);
  touch.move(1, layout.stick.restX + 50, layout.stick.restY);
  touch.down(2, fire.x, fire.y);
  touch.down(3, jump.x, jump.y);
  assert.equal(mask(), 2 | 16 | 32);
  touch.down(4, layout.stick.restX + 10, layout.stick.restY - 10);
  touch.move(4, layout.stick.restX - 80, layout.stick.restY);
  assert.equal(mask(), 2 | 16 | 32, 'a second thumb in the stick zone cannot steal movement');
  touch.up(3);
  touch.down(5, cow.x, cow.y);
  assert.equal(mask(), 2 | 16 | 64);
  assert.deepEqual([...touch.pressed].sort(), ['cow', 'fire']);
});

test('two fingers on fire stay held until the last one lifts', () => {
  const { touch, layout, mask } = controller();
  const { fire } = layout.buttons;
  touch.down(1, fire.x - 5, fire.y); touch.down(2, fire.x + 5, fire.y);
  touch.up(1);
  assert.equal(mask(), 16);
  touch.up(2);
  assert.equal(mask(), 0);
});

test('contacts outside the controls are not claimed and buttons have forgiving hit slop', () => {
  const { touch, layout, mask } = controller();
  assert.equal(touch.down(1, layout.width * .7, 40), false, 'upper right belongs to the HUD / world');
  const { jump } = layout.buttons;
  assert.equal(touch.down(2, jump.x + jump.r * 1.1, jump.y), true);
  assert.equal(mask(), 32);
});

test('deadzone and hysteresis suppress resting-thumb and sector-boundary jitter', () => {
  const { touch, layout, mask } = controller();
  const x = layout.stick.restX, y = layout.stick.restY, radius = 58;
  touch.down(1, x, y);
  touch.move(1, x + radius * .15, y);
  assert.equal(mask(), 0, 'inside the deadzone');
  touch.move(1, x + 40, y);
  assert.equal(mask(), 2);
  const near = Math.PI / 8 + .05; // just past the right/down-right boundary
  touch.move(1, x + Math.cos(near) * 40, y + Math.sin(near) * 40);
  assert.equal(mask(), 2, 'small drift across a boundary keeps the current sector');
  touch.move(1, x + Math.cos(Math.PI / 4) * 40, y + Math.sin(Math.PI / 4) * 40);
  assert.equal(mask(), 2 | 8);
});

test('fixed joystick centres on its rest position, and reconfiguring releases held touches', () => {
  const { touch, layout, mask } = controller({ joystick: 'fixed' });
  touch.down(1, layout.stick.x + 5, layout.stick.y + layout.stick.h - 5);
  assert.equal(touch.stick.originX, layout.stick.restX);
  touch.move(1, layout.stick.restX, layout.stick.restY - 50);
  assert.equal(mask(), 4);
  touch.configure({ joystick: 'floating' });
  assert.equal(mask(), 0);
  assert.equal(touch.stick, null);
});

test('buttons that disappear, like Continue once gameplay resumes, never stay held', () => {
  const { touch, mask } = controller();
  touch.setZones({ buttons: [{ id: 'confirm', bit: 128, x: 400, y: 300, r: 60 }] });
  touch.down(1, 400, 300);
  assert.equal(mask(), 128);
  touch.setZones({ buttons: [] });
  assert.equal(mask(), 0);
  touch.down(2, 10, 300);
  touch.releaseAll();
  assert.equal(mask(), 0);
});

test('layouts keep every control inside the screen and clear of each other, in either hand', () => {
  const sizes = [[320, 568], [390, 844], [430, 932], [568, 320], [667, 375], [844, 390], [932, 430], [768, 1024], [1024, 768]];
  for (const [width, height] of sizes) for (const handedness of ['right', 'left']) for (const large of [false, true]) {
    const l = computeLayout({ width, height, touch: true, handedness, large, safe: { bottom: 20, top: 30 } });
    const name = `${width}x${height} ${handedness}${large ? ' large' : ''}`;
    const circles = [...Object.values(l.buttons), { id: 'stick', x: l.stick.restX, y: l.stick.restY, r: l.stick.radius }, { id: 'pause', ...l.pause }];
    for (const c of circles) {
      assert.ok(c.x - c.r >= -1 && c.x + c.r <= width + 1 && c.y - c.r >= -1 && c.y + c.r <= height - 19, `${name}: ${c.id} on screen`);
    }
    for (let i = 0; i < circles.length; i++) for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - 2, `${name}: ${a.id} overlaps ${b.id}`);
    }
    if (handedness === 'left') assert.ok(l.buttons.fire.x < width / 2 && l.stick.restX > width / 2, `${name}: mirrored`);
    else assert.ok(l.buttons.fire.x > width / 2 && l.stick.restX < width / 2, `${name}: right-handed`);
    if (height > width * 1.05) assert.ok(l.deck && l.game.h + l.deck.h === height, `${name}: portrait deck under the world`);
    else assert.equal(l.game.h, height, `${name}: landscape world fills the screen`);
  }
});

test('desktop layout has no touch controls and keeps inventory off the floor', () => {
  const l = computeLayout({ width: 1440, height: 900, touch: false });
  assert.equal(l.buttons, undefined);
  assert.equal(l.deck, null);
  assert.ok(l.weapon.y < 120, 'inventory sits in the top bar');
  assert.ok(l.weapon.x + 238 * l.weapon.scale < l.pause.x - l.pause.r, 'inventory does not cover pause');
});

test('narrow keyboard windows stack the inventory under the status block instead of over it', () => {
  const l = computeLayout({ width: 390, height: 844, touch: false });
  assert.ok(l.weapon.y > l.hud.y + 60 * l.hud.scale, 'below the portrait and health');
  assert.ok(l.weapon.x + 238 * l.weapon.scale <= 390, 'on screen');
});
