import { C } from './paint.js';

// Reusable interface pieces built on the painter and region system.

// Dim the screen, draw a tilted paper card with a red ribbon title and a close
// button. Returns the content box inside the card.
export function sheet(ui, { title, width = 460, height = 520, onClose, tilt = -1 }) {
  const p = ui.paint, g = ui.ctx;
  g.fillStyle = '#0b0814cc'; g.fillRect(0, 0, ui.width, ui.height);
  p.halftone(0, 0, ui.width, ui.height, '#6a4bb330', { step: 12, maxR: 3, fromTop: false });
  const w = Math.min(width, ui.width - 24), h = Math.min(height, ui.height - 44);
  const x = (ui.width - w) / 2, y = (ui.height - h) / 2 + 14;
  p.panel(x, y, w, h, { r: 26, grad: [C.cream, C.paper], ink: 5, shadow: 10, tilt });
  const ribbonW = Math.min(w * .8, Math.max(200, p.measure(title, 26) + 60));
  g.save(); g.translate(ui.width / 2, y + 4); g.rotate(tilt * Math.PI / 180);
  p.panel(-ribbonW / 2, -26, ribbonW, 52, { r: 14, grad: ['#ff6f55', C.bandana], ink: 4.5, shadow: 5 });
  p.text(title, 0, 0, 26, { align: 'center' });
  g.restore();
  if (onClose) {
    const cx = x + w - 8, cy = y + 8, r = 20;
    const state = ui.region('sheet-close', { cx, cy, r: r + 6 }, { onPress: onClose, focusable: false });
    p.roundButton(cx, cy, r, { top: '#ff7b62', bottom: C.bandanaDark, pressed: state.pressed, icon: (ix, iy) => p.icon('close', ix, iy, r * .55, C.cream) });
  }
  return { x: x + 22, y: y + 40, w: w - 44, h: h - 58 };
}

// Row of mutually exclusive options.
export function segmented(ui, id, x, y, w, h, options, value, onChange) {
  const p = ui.paint;
  p.panel(x, y, w, h, { r: h / 2.4, grad: [C.dusk, C.night], ink: 3.5, shadow: 3, gloss: false });
  const segment = (w - 12) / options.length;
  options.forEach((option, i) => {
    const sx = x + 6 + i * segment, selected = option.value === value;
    const state = ui.region(`${id}-${option.value}`, { x: sx, y: y + 5, w: segment, h: h - 10 }, { onPress: () => onChange(option.value) });
    if (selected) p.button(sx, y + 5, segment, h - 11, option.label, { top: C.goldLight, bottom: C.goldDark, size: Math.min(18, (h - 10) * .45), r: (h - 10) / 2.4, pressed: state.pressed, focused: state.focused });
    else {
      p.text(option.label, sx + segment / 2, y + h / 2, Math.min(17, (h - 10) * .42), { align: 'center', color: C.muted });
      if (state.focused) p.focusRing(sx, y + 5, segment, h - 10, (h - 10) / 2.4);
    }
  });
}

// Labelled settings row with its control drawn by `control(x, y, w, h)`.
export function settingRow(ui, x, y, w, label, hint, control) {
  const p = ui.paint;
  p.text(label, x, y + 12, 16, { color: C.ink, outline: false });
  if (hint) p.body(hint, x, y + 32, { size: 11, color: '#6a5a44', weight: 700, shadow: false, maxWidth: w * .52 });
  control(x + w * .54, y, w * .46, 44);
  const g = ui.ctx; g.fillStyle = '#14101822'; g.fillRect(x, y + 54, w, 2);
}

export function toggle(ui, id, x, y, w, h, value, onChange) {
  const p = ui.paint;
  const state = ui.region(id, { x, y, w, h }, { onPress: () => onChange(!value) });
  const tw = Math.min(84, w), tx = x + w - tw, r = h / 2 - 4;
  p.rr(tx, y + 4, tw, h - 8, r); ui.ctx.fillStyle = value ? C.helmet : '#5b4f45'; ui.ctx.fill(); ui.ctx.lineWidth = 3.5; ui.ctx.strokeStyle = C.ink; ui.ctx.stroke();
  const kx = value ? tx + tw - r - 4 : tx + r + 4;
  p.roundButton(kx, y + h / 2, r - 2, { top: '#ffffff', bottom: '#c9c1b0', pressed: state.pressed });
  p.text(value ? 'ON' : 'OFF', value ? tx + 14 : tx + tw - 14, y + h / 2, 13, { align: value ? 'left' : 'right', color: C.cream });
  if (state.focused) p.focusRing(tx, y + 4, tw, h - 8, r);
}

export function slider(ui, id, x, y, w, h, value, onChange) {
  const p = ui.paint, g = ui.ctx;
  const trackY = y + h / 2 - 7, trackX = x + 12, trackW = w - 24;
  const set = px => onChange(Math.max(0, Math.min(1, (px - trackX) / trackW)));
  const state = ui.region(id, { x, y, w, h }, {
    focusable: true,
    onDown: px => set(px),
    onDrag: px => set(px),
    onNudge: dx => onChange(Math.max(0, Math.min(1, Math.round((value + dx * .05) * 20) / 20))),
  });
  p.rr(trackX, trackY, trackW, 14, 7); g.fillStyle = '#3b2f2a'; g.fill(); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke();
  p.rr(trackX, trackY, Math.max(14, trackW * value), 14, 7); g.fillStyle = C.gold; g.fill(); g.stroke();
  p.roundButton(trackX + trackW * value, trackY + 7, 13, { top: '#fff', bottom: '#bbb', pressed: state.pressed });
  if (state.focused) p.focusRing(x, y, w, h, 12);
  return state;
}

// Chunky circular icon button (corner controls).
export function iconButton(ui, id, cx, cy, r, icon, onPress, { top = C.goldLight, bottom = C.goldDark, onDown, focusable = true, color = C.ink } = {}) {
  const state = ui.region(id, { cx, cy, r: r + 6 }, { onPress, onDown, focusable });
  ui.paint.roundButton(cx, cy, r, { top, bottom, pressed: state.pressed, focused: state.focused, icon: (x, y) => ui.paint.icon(icon, x, y, r * .58, color) });
  return state;
}

export function pill(ui, x, y, w, h, icon, label, color = C.aqua) {
  const p = ui.paint;
  p.panel(x, y, w, h, { r: h / 2, grad: ['#3a3350', '#1c1729'], ink: 3.5, shadow: 4 });
  p.icon(icon, x + h * .55, y + h / 2, h * .32);
  p.text(label, x + w - h * .35, y + h / 2 + 1, h * .45, { align: 'right', color });
}
