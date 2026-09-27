import { C } from '../paint.js';
import { sheet, slider } from '../components.js';
import { drawBackdrop } from './menu.js';

// Stack of full-width buttons inside a sheet. items: [id, label, top, bottom, onPress, primary]
function buttonColumn(ui, box, items, { height = 52, gap = 14 } = {}) {
  const p = ui.paint;
  let y = box.y;
  for (const [id, label, top, bottom, onPress, primary] of items) {
    const state = ui.region(id, { x: box.x, y, w: box.w, h: height }, { onPress, primary });
    p.button(box.x, y, box.w, height, label, { top, bottom, size: Math.min(22, height * .42), pressed: state.pressed, focused: state.focused });
    y += height + gap;
  }
  return y;
}

export class PauseScreen {
  constructor(model) { this.model = model; this.modal = true; }
  back() { this.model.resume(); }
  draw(ui) {
    const m = this.model, compact = ui.height < 460;
    const items = [['resume', 'RESUME', '#9dff72', '#23801e', () => m.resume(), true], ['pause-settings', 'OPTIONS', C.blipLight, C.blipDark, () => m.openSettings()]];
    if (m.mode === 'roguelite') items.push(['pause-shop', 'SHOP', C.purple, C.purpleDark, () => m.openWorkshop()]);
    items.push(['quit', 'QUIT TO TITLE', '#ff7b62', C.bandanaDark, () => m.quit()]);
    const bh = compact ? 44 : 54, gap = compact ? 10 : 14;
    const height = 70 + items.length * (bh + gap) + 60;
    const box = sheet(ui, { title: 'PAUSED', width: 400, height });
    const after = buttonColumn(ui, box, items, { height: bh, gap });
    ui.paint.text('VOLUME', box.x, after + 14, 15, { color: C.ink, outline: false });
    slider(ui, 'volume', box.x + 100, after, box.w - 100, 30, m.save.settings.volume, v => m.setSetting('volume', v));
  }
}

export class DefeatScreen {
  constructor(model, { reward, score }) { this.model = model; this.modal = true; this.reward = reward; this.score = score; this.born = performance.now(); }
  back() {}
  draw(ui, dt, now) {
    const m = this.model, p = ui.paint, g = ui.ctx;
    const t = Math.min(1, (now - this.born) / 600);
    g.fillStyle = `rgba(40, 4, 8, ${.55 * t})`; g.fillRect(0, 0, ui.width, ui.height);
    const roguelite = m.mode === 'roguelite';
    const items = [];
    if (roguelite) items.push(['defeat-shop', 'UPGRADE & RETRY', '#9dff72', '#23801e', () => m.openWorkshop(true), true]);
    items.push(['retry', roguelite ? 'RETRY CHECKPOINT' : 'NEW CAMPAIGN', C.goldLight, C.goldDark, () => m.retry(), !roguelite]);
    items.push(['defeat-quit', 'QUIT TO TITLE', '#ff7b62', C.bandanaDark, () => m.quit()]);
    const box = sheet(ui, { title: 'GAME OVER', width: 420, height: 140 + items.length * 66, tilt: 1.2 });
    p.body(this.reward, box.x + box.w / 2, box.y + 22, { size: 15, color: C.ink, align: 'center', maxWidth: box.w, shadow: false });
    p.text(String(this.score).padStart(6, '0'), box.x + box.w / 2, box.y + 60, 26, { align: 'center', color: C.gold });
    buttonColumn(ui, { ...box, y: box.y + 92 }, items);
  }
}

export class CompleteScreen {
  constructor(model, { message }) { this.model = model; this.modal = true; this.message = message; }
  back() {}
  draw(ui, dt, now) {
    drawBackdrop(ui, now);
    const m = this.model, p = ui.paint;
    const box = sheet(ui, { title: 'BALLS. OF. STEEL.', width: 480, height: 300, tilt: -1.5 });
    p.body(this.message, box.x + box.w / 2, box.y + 30, { size: 16, color: C.ink, align: 'center', maxWidth: box.w, shadow: false });
    buttonColumn(ui, { ...box, y: box.y + box.h - 60 }, [['complete-title', 'BACK TO TITLE', C.goldLight, C.goldDark, () => m.quit(), true]]);
  }
}

// Downloading the original data / starting the engine, or a startup failure.
export class LoadingScreen {
  constructor(model) { this.model = model; this.modal = true; this.status = 'Preparing engine…'; this.progress = 0; this.error = null; }
  back() { if (this.error) this.model.quit(); }
  draw(ui, dt, now) {
    drawBackdrop(ui, now, { focusY: .45 });
    const p = ui.paint, g = ui.ctx, w = Math.min(420, ui.width - 40), x = (ui.width - w) / 2, cy = ui.height / 2;
    const logoW = Math.min(ui.width * .8, 420, ui.height * .6);
    g.drawImage(ui.art.logo, ui.width / 2 - logoW / 2, cy - logoW * .75 - 20, logoW, logoW * .75);
    if (this.error) {
      p.text('COULD NOT START', ui.width / 2, cy + 20, 24, { align: 'center', color: '#ff9b7e' });
      p.body(this.error, ui.width / 2, cy + 56, { size: 14, align: 'center', maxWidth: w, color: C.lilac });
      const state = ui.region('loading-back', { x, y: cy + 100, w, h: 52 }, { onPress: () => this.model.quit(), primary: true });
      p.button(x, cy + 100, w, 52, 'BACK TO TITLE', { pressed: state.pressed, focused: state.focused, size: 20 });
      return;
    }
    p.text('LOADING', ui.width / 2, cy + 18, 26, { align: 'center', color: C.gold });
    p.rr(x, cy + 44, w, 22, 11); g.fillStyle = '#2a2340'; g.fill(); g.lineWidth = 3.5; g.strokeStyle = C.ink; g.stroke();
    const fill = this.progress > 0 ? this.progress : (Math.sin(now / 300) * .5 + .5) * .15 + .05;
    p.rr(x + 3, cy + 47, Math.max(16, (w - 6) * Math.min(1, fill)), 16, 8); g.fillStyle = p.gradient(cy + 47, 16, [C.goldLight, C.goldDark]); g.fill();
    p.body(this.status, ui.width / 2, cy + 90, { size: 13, align: 'center', maxWidth: w, color: C.muted });
  }
}
