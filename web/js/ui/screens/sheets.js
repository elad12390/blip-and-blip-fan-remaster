import { C } from '../paint.js';
import { sheet, segmented, settingRow, toggle, slider } from '../components.js';

const close = (ui, screen) => () => { ui.remove(screen); screen.onClose?.(); };

export class WorkshopScreen {
  constructor(model, { onClose } = {}) { this.model = model; this.modal = true; this.onClose = onClose; }
  back(ui) { close(ui, this)(); }
  draw(ui) {
    const m = this.model, p = ui.paint, g = ui.ctx;
    const defs = m.upgradeDefs, compact = ui.height < 520;
    const rowH = compact ? 70 : 92;
    const box = sheet(ui, { title: 'WORKSHOP', width: 520, height: 150 + defs.length * (rowH + 10) + (compact ? 0 : 20), onClose: close(ui, this) });
    p.icon('shard', box.x + 14, box.y + 16, 12);
    p.text(`${m.save.shards} SHARDS`, box.x + 34, box.y + 17, 18, { color: C.purpleDark, outline: false });
    if (!compact) p.body('Spend shards earned in Roguelite runs. Upgrades never affect Classic.', box.x, box.y + 44, { size: 12, color: '#6a5a44', shadow: false, maxWidth: box.w });
    let y = box.y + (compact ? 38 : 66);
    for (const def of defs) {
      const rank = m.save.upgrades[def.id], cost = m.upgradeCost(def.id), maxed = rank >= def.max, affordable = m.save.shards >= cost;
      p.panel(box.x, y, box.w, rowH, { r: 16, grad: ['#fffaf0', '#f3dfb6'], ink: 3, shadow: 3, gloss: false });
      p.text(def.name, box.x + 14, y + 20, compact ? 17 : 19, { color: C.ink, outline: false });
      if (!compact) p.body(def.description, box.x + 14, y + 44, { size: 11, color: '#6a5a44', shadow: false, maxWidth: box.w - 150, weight: 700 });
      for (let i = 0; i < def.max; i++) {
        g.beginPath(); g.arc(box.x + 22 + i * 20, y + rowH - 16, 7, 0, Math.PI * 2);
        g.fillStyle = i < rank ? C.gold : '#d8c7a5'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke();
      }
      const bw = 112, bx = box.x + box.w - bw - 12, by = y + rowH / 2 - 22;
      const state = ui.region(`buy-${def.id}`, { x: bx, y: by, w: bw, h: 44 }, { onPress: () => m.buy(def.id), disabled: maxed || !affordable, focusable: !maxed && affordable });
      p.button(bx, by, bw, 44, maxed ? 'MAXED' : `${cost}`, { top: maxed ? '#d8c7a5' : C.purple, bottom: maxed ? '#a8977a' : C.purpleDark, size: 18, disabled: !maxed && !affordable, pressed: state.pressed, focused: state.focused, icon: maxed ? null : (ix, iy, r) => p.icon('shard', ix, iy, r * .7) });
      y += rowH + 10;
    }
    if (m.workshopReturnsToRun) {
      const state = ui.region('workshop-return', { x: box.x, y: box.y + box.h - 52, w: box.w, h: 48 }, { onPress: () => { ui.remove(this); m.retry(); }, primary: true });
      p.button(box.x, box.y + box.h - 52, box.w, 48, 'BACK TO THE FIGHT', { top: '#9dff72', bottom: '#23801e', size: 18, pressed: state.pressed, focused: state.focused });
    }
  }
}

export class ScoresScreen {
  constructor(model) { this.model = model; this.modal = true; this.tab = model.mode; }
  back(ui) { ui.remove(this); }
  draw(ui) {
    const m = this.model, p = ui.paint;
    const box = sheet(ui, { title: 'HALL OF STEEL', width: 480, height: 470, onClose: () => ui.remove(this) });
    segmented(ui, 'scores-tab', box.x, box.y, box.w, 48, [{ value: 'original', label: 'CLASSIC' }, { value: 'roguelite', label: 'ROGUELITE' }], this.tab, v => { this.tab = v; });
    const rows = m.highScores(this.tab);
    const rowH = Math.min(38, (box.h - 90) / 8);
    if (!rows.length) p.body('Your first score goes here.', box.x + box.w / 2, box.y + 110, { size: 15, color: '#6a5a44', align: 'center', shadow: false });
    rows.slice(0, 8).forEach((entry, i) => {
      const y = box.y + 70 + i * rowH;
      p.text(`${i + 1}`, box.x + 12, y + rowH / 2, 18, { color: i === 0 ? C.goldDark : C.ink, outline: false });
      p.body(`${entry.name}${entry.players === 2 ? ' · co-op' : ''}${entry.completed ? ' ★' : ''}`, box.x + 44, y + rowH / 2, { size: 14, color: C.ink, shadow: false, maxWidth: box.w - 170 });
      p.text(String(entry.score).padStart(6, '0'), box.x + box.w - 8, y + rowH / 2, 18, { align: 'right', color: C.purpleDark, outline: false });
    });
    p.body('Runs resumed from a checkpoint are unranked.', box.x + box.w / 2, box.y + box.h - 8, { size: 11, color: '#6a5a44', align: 'center', shadow: false });
  }
}

export class SettingsScreen {
  constructor(model) { this.model = model; this.modal = true; this.tab = model.touchVisible() || model.coarsePointer() ? 'touch' : 'display'; }
  back(ui) { ui.remove(this); }
  draw(ui) {
    const m = this.model, s = m.save.settings, p = ui.paint;
    const compact = ui.height < 520, rowH = compact ? 52 : 60;
    const box = sheet(ui, { title: 'OPTIONS', width: 540, height: 140 + rowH * 4 + (compact ? 0 : 20), onClose: () => ui.remove(this) });
    segmented(ui, 'settings-tab', box.x, box.y, box.w, 46, [{ value: 'touch', label: 'TOUCH' }, { value: 'display', label: 'DISPLAY' }, { value: 'keys', label: 'KEYS' }], this.tab, v => { this.tab = v; });
    const x = box.x, w = box.w;
    let y = box.y + 62;
    const choice = (id, key, options) => (cx, cy, cw, ch) => segmented(ui, id, cx, cy, cw, ch, options, s[key], v => m.setSetting(key, v));
    const row = (label, hint, control) => { settingRow(ui, x, y, w, label, compact ? null : hint, control); y += rowH; };
    if (this.tab === 'touch') {
      row('CONTROLLER', 'Show touch controls', choice('touch', 'touch', [{ value: 'auto', label: 'AUTO' }, { value: 'on', label: 'ON' }, { value: 'off', label: 'OFF' }]));
      row('SIZE', 'More room for thumbs', choice('size', 'controlSize', [{ value: 'comfortable', label: 'NORMAL' }, { value: 'large', label: 'LARGE' }]));
      row('FIRE WITH', 'Mirror the controller', choice('hand', 'handedness', [{ value: 'right', label: 'RIGHT' }, { value: 'left', label: 'LEFT' }]));
      row('STICK', 'Floating starts where you touch', choice('stick', 'joystick', [{ value: 'floating', label: 'FLOAT' }, { value: 'fixed', label: 'FIXED' }]));
    } else if (this.tab === 'display') {
      row('GRAPHICS', 'Lighting, original pixels, or depth', choice('graphics', 'graphics', [{ value: 'enhanced', label: 'LIT' }, { value: 'original', label: 'PIXEL' }, { value: 'depth', label: 'DEPTH' }]));
      row('AUTO FIRE', 'Keep shooting while moving', (cx, cy, cw, ch) => toggle(ui, 'autofire', cx, cy, cw, ch, s.autoFire, v => m.setSetting('autoFire', v)));
      row('GENTLE FX', 'Fewer flashes and less motion', (cx, cy, cw, ch) => toggle(ui, 'motion', cx, cy, cw, ch, s.reducedMotion, v => m.setSetting('reducedMotion', v)));
      row('VOLUME', 'Music and effects', (cx, cy, cw, ch) => slider(ui, 'settings-volume', cx, cy, cw, ch, s.volume, v => m.setSetting('volume', v)));
    } else {
      const lines = m.players === 2
        ? [['P1 MOVE', 'W A S D'], ['P1 FIRE JUMP COW', 'F  G  H'], ['P2 MOVE', 'ARROWS'], ['P2 FIRE JUMP COW', 'J  K  L']]
        : [['MOVE AND AIM', 'ARROWS / WASD'], ['FIRE', 'J / Z'], ['JUMP', 'SPACE / K'], ['COW BOMB', 'L / C']];
      for (const [label, keys] of lines) { settingRow(ui, x, y, w, label, null, (cx, cy, cw) => p.text(keys, cx + cw, cy + 12, 16, { align: 'right', color: C.purpleDark, outline: false })); y += rowH; }
      p.body('Gamepad: stick or D-pad, X / RT fire, A jump, B cow, Start pause. Enter continues dialogue.', x, y + 6, { size: 11, color: '#6a5a44', shadow: false, maxWidth: w });
    }
  }
}

export class AboutScreen {
  constructor(model) { this.model = model; this.modal = true; }
  back(ui) { ui.remove(this); }
  draw(ui) {
    const m = this.model, p = ui.paint, compact = ui.height < 520;
    const box = sheet(ui, { title: 'FROM 2002', width: 540, height: compact ? 350 : 470, onClose: () => ui.remove(this) });
    const text = compact
      ? 'Blip & Blop: Balls of Steel by Loaded Studio, rebuilt from the published C++ source. Roguelite progress lives on this device only.'
      : 'Blip & Blop: Balls of Steel was created by Loaded Studio. This remaster runs the recovered campaign and artwork on the published C++ source, with a new GPU renderer, a play area that fits any screen, and an optional Roguelite mode.\n\nLighting and depth are inferred from the original pixels. Roguelite progress is stored only in this browser: export a backup before clearing site data.';
    p.body(text, box.x, box.y + 10, { size: compact ? 12 : 13, color: C.ink, shadow: false, maxWidth: box.w, lineHeight: 1.45 });
    const by = box.y + box.h - (compact ? 108 : 118), half = (box.w - 14) / 2;
    const exp = ui.region('export', { x: box.x, y: by, w: half, h: 46 }, { onPress: () => m.exportSave() });
    p.button(box.x, by, half, 46, 'EXPORT SAVE', { top: C.helmet, bottom: C.helmetDark, size: 15, pressed: exp.pressed, focused: exp.focused });
    const imp = ui.region('import', { x: box.x + half + 14, y: by, w: half, h: 46 }, { onPress: () => m.importSave() });
    p.button(box.x + half + 14, by, half, 46, 'IMPORT SAVE', { top: C.sky, bottom: C.skyDark, size: 15, pressed: imp.pressed, focused: imp.focused });
    const src = ui.region('source', { x: box.x, y: by + 60, w: box.w, h: 42 }, { onPress: () => window.open('https://github.com/benkaraban/blip-blop', '_blank', 'noopener') });
    p.button(box.x, by + 60, box.w, 42, 'ORIGINAL SOURCE CODE', { top: '#e8dcc3', bottom: '#b9a680', color: C.cream, size: 14, pressed: src.pressed, focused: src.focused });
  }
}
