import { C } from '../paint.js';
import { sheet, segmented, settingRow, toggle, slider } from '../components.js';
import { ACTIONS, PAD_ACTIONS, LABELS, keyName, buttonName } from '../../bindings.js';
import { formatTime, categoryName, SPLIT_PARTS } from '../../speedrun.js';

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
    segmented(ui, 'scores-tab', box.x, box.y, box.w, 48, [{ value: 'original', label: 'CLASSIC' }, { value: 'roguelite', label: 'ROGUELITE' }, { value: 'speedrun', label: 'SPEEDRUN' }], this.tab, v => { this.tab = v; });
    if (this.tab === 'speedrun') { this.speedrunTab(ui, box); return; }
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

ScoresScreen.prototype.speedrunTab = function (ui, box) {
  const m = this.model, p = ui.paint, g = ui.ctx, s = m.save.settings;
  settingRow(ui, box.x, box.y + 62, box.w, 'TIMER', 'In-game time with splits', (cx, cy, cw, ch) => toggle(ui, 'speedrun-timer', cx, cy, cw, ch, s.speedrunTimer, v => m.setSetting('speedrunTimer', v)));
  const entries = Object.entries(m.save.speedrun.pbs).sort(([, a], [, b]) => a.total - b.total);
  let y = box.y + 134;
  if (!entries.length) p.body('Finish the campaign to set a personal best. Pauses do not count; cheats, the console, warps and checkpoints make a run unranked.', box.x, y + 10, { size: 12, color: '#6a5a44', shadow: false, maxWidth: box.w });
  for (const [key, pb] of entries.slice(0, 5)) {
    const golds = m.save.speedrun.golds[key] ?? {}, parts = SPLIT_PARTS.map(part => golds[part]);
    const sob = parts.every(Number.isFinite) ? parts.reduce((a, b) => a + b, 0) : null;
    p.body(categoryName(key), box.x, y + 10, { size: 13, color: C.ink, shadow: false });
    p.text(formatTime(pb.total), box.x + box.w - 4, y + 10, 18, { align: 'right', color: C.purpleDark, outline: false });
    p.body(`${pb.date || ''}${sob ? `   ·   sum of best ${formatTime(sob)}` : ''}`, box.x, y + 30, { size: 11, color: '#6a5a44', shadow: false });
    g.fillStyle = '#14101822'; g.fillRect(box.x, y + 44, box.w, 2);
    y += 52;
  }
};

export class SettingsScreen {
  constructor(model) { this.model = model; this.modal = true; this.tab = model.touchVisible() ? 'touch' : model.gamepad ? 'controls' : 'display'; this.table = model.gamepad ? 'pad' : 'solo'; }
  back(ui) { if (ui.capture) ui.endCapture(null); else ui.remove(this); }
  draw(ui) {
    const m = this.model, s = m.save.settings, p = ui.paint;
    const compact = ui.height < 520, rowH = compact ? 52 : 60;
    const box = sheet(ui, { title: 'OPTIONS', width: 580, height: 140 + rowH * 4 + (compact ? 0 : 20), onClose: () => { if (ui.capture) ui.endCapture(null); ui.remove(this); } });
    segmented(ui, 'settings-tab', box.x, box.y, box.w, 46, [{ value: 'touch', label: 'TOUCH' }, { value: 'display', label: 'DISPLAY' }, { value: 'controls', label: 'CONTROLS' }], this.tab, v => { if (ui.capture) ui.endCapture(null); this.tab = v; });
    if (this.tab === 'controls') { this.controls(ui, box, compact); return; }
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

// Remapping grid, added to SettingsScreen below.
function drawControls(ui, box, compact) {
  const m = this.model, p = ui.paint, g = ui.ctx, b = m.bindings;
  const tables = [{ value: 'solo', label: 'KEYS' }, { value: 'coop1', label: 'P1 CO-OP' }, { value: 'coop2', label: 'P2 CO-OP' }, { value: 'pad', label: 'PAD' }];
  const y0 = box.y + 56;
  segmented(ui, 'bind-table', box.x, y0, box.w, compact ? 38 : 42, tables, this.table, v => { if (ui.capture) ui.endCapture(null); this.table = v; });
  const pad = this.table === 'pad';
  const actions = pad ? PAD_ACTIONS : ACTIONS;
  const cols = 2, rows = Math.ceil(actions.length / cols), gap = 10;
  const top = y0 + (compact ? 48 : 56), bottomReserve = compact ? 44 : 52;
  const cellH = Math.min(48, (box.y + box.h - bottomReserve - top) / rows - 6);
  const cellW = (box.w - gap) / cols;
  actions.forEach((action, i) => {
    const cx = box.x + (i % cols) * (cellW + gap), cy = top + Math.floor(i / cols) * (cellH + 6);
    const list = pad ? b.pad[action] : b[this.table][action];
    const listening = this.listening === `${this.table}:${action}`;
    p.text(LABELS[action], cx, cy + cellH / 2, Math.min(14, cellH * .32), { color: C.ink, outline: false });
    const bw = cellW * .52, bx = cx + cellW - bw;
    const state = ui.region(`bind-${action}`, { x: bx, y: cy, w: bw, h: cellH }, {
      onPress: () => {
        this.listening = `${this.table}:${action}`;
        const table = this.table;
        ui.startCapture(pad ? 'button' : 'key', value => {
          this.listening = null;
          if (value !== null && value !== undefined) m.rebind(table, action, value);
        }, { allowEscape: action === 'pause' });
      },
    });
    const label = listening ? (pad ? 'PRESS BUTTON' : 'PRESS KEY') : (pad ? list.map(buttonName) : list.map(keyName)).join(' / ') || '—';
    const pulse = listening ? .6 + .4 * Math.sin(performance.now() / 150) : 1;
    g.save(); g.globalAlpha = pulse;
    p.button(bx, cy, bw, cellH, label, { top: listening ? C.goldLight : '#f4f0ff', bottom: listening ? C.goldDark : '#a79fc4', size: Math.min(15, cellH * .34, bw / Math.max(6, label.length) * 1.5), r: 12, pressed: state.pressed, focused: state.focused });
    g.restore();
  });
  const ry = box.y + box.h - (compact ? 38 : 44), rw = 150;
  const reset = ui.region('bind-reset', { x: box.x + box.w - rw, y: ry, w: rw, h: compact ? 36 : 40 }, { onPress: () => m.resetBindings(this.table) });
  p.button(box.x + box.w - rw, ry, rw, compact ? 36 : 40, 'RESET', { top: '#ff7b62', bottom: C.bandanaDark, size: 15, r: 12, pressed: reset.pressed, focused: reset.focused });
  p.body(pad ? 'Move with the left stick or D-pad. Fire or Jump continues dialogue.' : 'Tap a slot, then press a key. Enter always continues dialogue.', box.x, ry + (compact ? 18 : 20), { size: 11, color: '#6a5a44', shadow: false, maxWidth: box.w - rw - 16 });
}
SettingsScreen.prototype.controls = drawControls;

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
    const cw = 120, con = ui.region('open-console', { x: box.x + box.w - cw, y: box.y - 30, w: cw, h: 34 }, { onPress: () => { ui.remove(this); m.openConsole(); } });
    p.button(box.x + box.w - cw, box.y - 30, cw, 34, 'CONSOLE', { top: '#3a3350', bottom: '#1c1729', size: 13, r: 10, pressed: con.pressed, focused: con.focused });
    const src = ui.region('source', { x: box.x, y: by + 60, w: box.w, h: 42 }, { onPress: () => window.open('https://github.com/benkaraban/blip-blop', '_blank', 'noopener') });
    p.button(box.x, by + 60, box.w, 42, 'ORIGINAL SOURCE CODE', { top: '#e8dcc3', bottom: '#b9a680', color: C.cream, size: 14, pressed: src.pressed, focused: src.focused });
  }
}
