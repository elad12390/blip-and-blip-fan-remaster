// Screen layout for the in-game interface, in CSS pixels. Pure: no DOM.
//
// - Portrait with touch controls: the world sits above a control deck.
// - Landscape / desktop: the world fills the screen and the HUD floats over it.
// Handedness mirrors the stick and action buttons; "large" enlarges controls.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function computeLayout({ width, height, touch = false, handedness = 'right', large = false, coop = false, safe = {} }) {
  const inset = { top: safe.top ?? 0, right: safe.right ?? 0, bottom: safe.bottom ?? 0, left: safe.left ?? 0 };
  const portraitDeck = touch && height > width * 1.05;
  const unit = touch ? clamp(Math.min(width, height) / 390, .82, 1.45) : clamp(height / 820, .9, 1.45);
  const controls = (large ? 1.12 : 1) * unit;
  const pad = 12 * unit;

  const deckHeight = portraitDeck ? Math.round(clamp(height * .36, 230 * controls, 360 * controls)) + inset.bottom : 0;
  const game = { x: 0, y: 0, w: width, h: height - deckHeight };
  const deck = portraitDeck ? { x: 0, y: game.h, w: width, h: deckHeight } : null;

  const hudScale = touch ? unit * (portraitDeck ? 1 : .88) : unit * 1.15;
  const hud = { x: inset.left + pad, y: inset.top + pad * .9, scale: hudScale };
  const pauseR = 24 * hudScale;
  const pause = { x: width - inset.right - pad - pauseR, y: inset.top + pad * .9 + pauseR + 2, r: pauseR };

  const mirror = handedness === 'left';
  const flip = x => mirror ? width - x : x;

  const layout = { width, height, unit, touch, portraitDeck, game, deck, hud, pause, inset, mirror, coop };

  // Inventory sits beside the pause button, clear of the floor the heroes walk on.
  const topRightChip = (scale, extra) => ({ x: pause.x - pause.r - 14 * unit - (132 + extra) * scale, y: pause.y - 23 * scale, scale });
  if (!touch) {
    layout.weapon = topRightChip(hudScale, 106);
    layout.hints = { x: width - inset.right - 24 * unit, y: height - inset.bottom - 44 * unit, scale: unit };
    return layout;
  }

  const fireR = 48 * controls, jumpR = 37 * controls, cowR = 29 * controls;
  // Action cluster anchored to the bottom (right unless left-handed).
  const bottom = (deck ? deck.y + deck.h - inset.bottom : height - inset.bottom) - 18 * controls;
  const edge = (mirror ? inset.left : inset.right) + 18 * controls;
  const fire = { id: 'fire', bit: 16, x: flip(width - edge - fireR), y: bottom - fireR, r: fireR };
  const jump = { id: 'jump', bit: 32, x: flip(width - edge - fireR * 2 - 12 * controls - jumpR), y: bottom - jumpR, r: jumpR };
  const cow = { id: 'cow', bit: 64, x: flip(width - edge - fireR * 1.55 - cowR * .3), y: bottom - fireR * 2 - cowR - 8 * controls, r: cowR };
  layout.buttons = { fire, jump, cow };

  // Stick zone: the opposite half, below the HUD.
  const stickRadius = 58 * controls;
  const zoneTop = deck ? deck.y + 40 * controls : height * .32;
  const zoneBottom = deck ? deck.y + deck.h - inset.bottom : height - inset.bottom;
  const zoneWidth = width * (deck ? .5 : .44);
  const zoneX = mirror ? width - zoneWidth : 0;
  const restX = flip((mirror ? inset.right : inset.left) + 30 * controls + stickRadius);
  const restY = zoneBottom - 22 * controls - stickRadius;
  layout.stick = { x: zoneX, y: zoneTop, w: zoneWidth, h: zoneBottom - zoneTop, restX, restY, radius: stickRadius };

  const chipScale = unit * (deck ? 1 : .9);
  layout.weapon = deck
    ? { x: flip(inset.left + 16 * unit) - (mirror ? 132 * chipScale : 0), y: deck.y + 26 * unit, scale: chipScale }
    : topRightChip(chipScale, 0);
  const autoW = 118 * unit, autoH = 40 * unit;
  layout.autoFire = deck
    ? { x: mirror ? inset.left + 16 * unit : width - inset.right - 16 * unit - autoW, y: deck.y + 26 * unit, w: autoW, h: autoH }
    : { x: mirror ? width - inset.right - 18 * unit - autoW : inset.left + 18 * unit, y: hud.y + 96 * hudScale, w: autoW, h: autoH };
  const confirmW = 200 * unit, confirmH = 56 * unit;
  layout.confirm = { x: width / 2 - confirmW / 2, y: (deck ? deck.y - confirmH - 18 * unit : height - inset.bottom - confirmH - 24 * unit), w: confirmW, h: confirmH };
  return layout;
}
