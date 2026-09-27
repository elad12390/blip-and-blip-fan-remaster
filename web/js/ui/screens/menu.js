import { C } from '../paint.js';
import { SPRITES } from '../art.js';
import { segmented, iconButton, pill } from '../components.js';

// Shared title backdrop: original forest art, darkened, with a slow sunburst.
// Shared title backdrop: original forest art, darkened, with a slow sunburst.
// The blurred, graded layer is rendered once per size: canvas blur filters are
// very expensive per frame (Firefox runs them on the CPU).
const backdropCache = { key: '', canvas: null };
function backdropLayer(ui, focusY) {
  const w = ui.width, h = ui.height, dpr = ui.dpr, key = `${w}x${h}@${dpr}|${focusY}`;
  if (backdropCache.key === key) return backdropCache.canvas;
  const canvas = backdropCache.canvas ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.night; g.fillRect(0, 0, w, h);
  const image = ui.art.backdrop, sc = Math.max((w + 16) / image.width, (h + 16) / image.height);
  g.save(); g.globalAlpha = .45; g.filter = 'blur(2px) saturate(1.2)';
  g.drawImage(image, (w - image.width * sc) / 2, (h - image.height * sc) / 2, image.width * sc, image.height * sc);
  g.restore();
  const rg = g.createRadialGradient(w / 2, h * focusY, 0, w / 2, h * focusY, Math.max(w, h) * .75);
  rg.addColorStop(0, '#3b1f6b55'); rg.addColorStop(1, '#07050cf0');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  backdropCache.key = key; backdropCache.canvas = canvas;
  return canvas;
}

export function drawBackdrop(ui, now, { focusY = .4 } = {}) {
  const p = ui.paint, w = ui.width, h = ui.height;
  ui.ctx.drawImage(backdropLayer(ui, focusY), 0, 0, w, h);
  p.sunburst(w / 2, h * focusY, Math.max(w, h), C.gold, .05, now / 20000);
  p.halftone(0, h * .62, w, h * .38, '#6a4bb328', { step: 11, maxR: 3, fromTop: false });
}

function heroCard(ui, x, y, w, h, hero, selected, onPick) {
  const p = ui.paint, g = ui.ctx, tilt = hero ? 2 : -2;
  const state = ui.region(`hero-${hero}`, { x, y, w, h }, { onPress: onPick });
  const lift = selected ? -4 : 0;
  p.panel(x, y + lift, w, h, { r: 20, grad: hero ? [C.blopLight, C.blopDark] : [C.blipLight, C.blipDark], ink: selected ? 5 : 4, shadow: selected ? 9 : 5, tilt });
  g.save(); g.translate(x + w / 2, y + lift + h / 2); g.rotate(tilt * Math.PI / 180);
  p.rr(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 16); g.clip();
  const [sx, sy, sw, sh] = hero ? SPRITES.blop : SPRITES.blip;
  const s = Math.min((w - 8) / sw, (h - 44) / sh) * 1.08;
  g.drawImage(ui.art.inter, sx, sy, sw, sh, -sw * s / 2, -h / 2 + 6, sw * s, sh * s);
  if (!selected) { g.fillStyle = '#0b081455'; g.fillRect(-w / 2, -h / 2, w, h); }
  g.restore();
  p.text(hero ? 'BLOP' : 'BLIP', x + w / 2, y + lift + h - 20, Math.min(24, w * .16), { align: 'center' });
  if (selected) { p.badge(x + w - 12, y + lift + 10, 17, '', C.helmet); p.icon('check', x + w - 12, y + lift + 10, 10, C.cream); }
  if (state.focused) p.focusRing(x, y + lift, w, h, 20);
}

export class MenuScreen {
  constructor(model) { this.model = model; this.modal = true; }

  back() {}

  draw(ui, dt, now) {
    const m = this.model, p = ui.paint, w = ui.width, h = ui.height;
    const portrait = h > w * 1.1;
    drawBackdrop(ui, now, { focusY: portrait ? .22 : .42 });
    const hasContinue = m.mode === 'roguelite' && !!m.save.checkpoint;

    const shards = String(m.save.shards);
    const topY = 16 + (m.safeTop ?? 0);
    iconButton(ui, 'settings', w - 36, topY + 22, 22, 'gear', () => m.openSettings());
    iconButton(ui, 'about', w - 88, topY + 22, 22, 'question', () => m.openAbout(), { top: '#9fdcff', bottom: C.skyDark });
    if (m.mode === 'roguelite') pill(ui, 14, topY + 2, 124, 40, 'shard', shards);

    const draw = portrait ? this.portrait : this.landscape;
    draw.call(this, ui, now, hasContinue);
  }

  logo(ui, cx, cy, width, now) {
    const s = width / 640, bob = Math.sin(now / 900) * 4;
    ui.ctx.drawImage(ui.art.logo, cx - width / 2, cy - 240 * s + bob, width, 480 * s);
  }

  // Row heights that fit the available height; returns [sizes, total].
  static sizes(available, hasContinue) {
    const base = { mode: 56, players: 48, difficulty: 44, play: 84, cont: 50, row: 52, gap: 12 };
    const total = z => z.mode + z.players + z.difficulty + z.play + z.row + z.gap * 5 + (hasContinue ? z.cont + z.gap : 0);
    const scale = Math.max(.72, Math.min(1, available / total(base)));
    const z = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * (k === 'gap' ? scale * scale : scale))]));
    return [z, total(z)];
  }

  controls(ui, x, y, w, hasContinue, z) {
    const m = this.model, p = ui.paint;
    let cy = y;
    segmented(ui, 'mode', x, cy, w, z.mode, [{ value: 'original', label: 'CLASSIC' }, { value: 'roguelite', label: 'ROGUELITE' }], m.mode, v => m.setMode(v));
    cy += z.mode + z.gap;
    segmented(ui, 'players', x, cy, w, z.players, [{ value: 1, label: 'SOLO' }, { value: 2, label: '2 PLAYERS' }], m.players, v => m.setPlayers(v));
    cy += z.players + z.gap;
    segmented(ui, 'difficulty', x, cy, w, z.difficulty, [{ value: 0, label: 'EASY' }, { value: 1, label: 'NORMAL' }, { value: 2, label: 'HARD' }, { value: 3, label: 'INSANE' }], m.difficulty, v => m.setDifficulty(v));
    cy += z.difficulty + z.gap;
    const play = ui.region('play', { x, y: cy, w, h: z.play }, { onPress: () => m.start(false), primary: !hasContinue });
    p.button(x, cy, w, z.play, 'PLAY', { size: z.play * .48, pressed: play.pressed, focused: play.focused });
    cy += z.play + z.gap + 4;
    if (hasContinue) {
      const cont = ui.region('continue', { x, y: cy, w, h: z.cont }, { onPress: () => m.start(true), primary: true });
      p.button(x, cy, w, z.cont, `CONTINUE ${m.checkpointLabel ?? ''}`.trim(), { top: '#9dff72', bottom: '#23801e', size: Math.min(18, z.cont * .36), pressed: cont.pressed, focused: cont.focused });
      cy += z.cont + z.gap;
    }
    const bw = (w - 24) / 3;
    [['shop', 'SHOP', C.helmet, C.helmetDark, () => m.openWorkshop()], ['scores', 'SCORES', C.purple, C.purpleDark, () => m.openScores()], ['help', 'HELP', C.sky, C.skyDark, () => m.openSettings()]]
      .forEach(([id, label, top, bottom, onPress], i) => {
        const state = ui.region(id, { x: x + i * (bw + 12), y: cy, w: bw, h: z.row }, { onPress });
        p.button(x + i * (bw + 12), cy, bw, z.row, label, { top, bottom, size: Math.min(17, bw * .15, z.row * .36), pressed: state.pressed, focused: state.focused });
      });
    return cy + z.row;
  }

  portrait(ui, now, hasContinue) {
    const m = this.model, w = ui.width, h = ui.height;
    const margin = 16, cw = Math.min(460, w - margin * 2), x = (w - cw) / 2;
    const bottom = h - 18 - (m.safeBottom ?? 0);
    const [z, controlsHeight] = MenuScreen.sizes(h * .46, hasContinue);
    const controlsY = bottom - controlsHeight;
    const cardH = Math.min(190, Math.max(120, (controlsY - 20) * .32)), cardW = (cw - 16) / 2;
    const cardsY = controlsY - cardH - 22;
    const logoSpace = cardsY - 70;
    this.logo(ui, w / 2, 64 + logoSpace / 2, Math.min(w * 1.02, logoSpace * 1.35, 640), now);
    heroCard(ui, x, cardsY, cardW, cardH, 0, m.hero === 0, () => m.setHero(0));
    heroCard(ui, x + cardW + 16, cardsY, cardW, cardH, 1, m.hero === 1, () => m.setHero(1));
    this.controls(ui, x, controlsY, cw, hasContinue, z);
  }

  landscape(ui, now, hasContinue) {
    const m = this.model, p = ui.paint, w = ui.width, h = ui.height;
    const pw = Math.min(460, w * .4), px = w - pw - Math.max(20, w * .04);
    const top = 66 + (m.safeTop ?? 0), bottom = h - 16 - (m.safeBottom ?? 0);
    const available = bottom - top;
    const [z, controlsHeight] = MenuScreen.sizes(available * .68, hasContinue);
    const titleSpace = available > 520 ? 34 : 0;
    const cardH = Math.max(84, Math.min(260, available - controlsHeight - titleSpace - 20));
    const block = titleSpace + cardH + 20 + controlsHeight;
    const y0 = top + Math.max(0, (available - block) / 2);
    const cardW = (pw - 16) / 2;
    if (titleSpace) p.text('CHOOSE YOUR BALL', px + pw / 2, y0 + 12, 19, { align: 'center', color: C.lilac });
    heroCard(ui, px, y0 + titleSpace, cardW, cardH, 0, m.hero === 0, () => m.setHero(0));
    heroCard(ui, px + cardW + 16, y0 + titleSpace, cardW, cardH, 1, m.hero === 1, () => m.setHero(1));
    this.controls(ui, px, y0 + titleSpace + cardH + 20, pw, hasContinue, z);
    const logoW = Math.min(px - 40, (h - 40) * 1.2, 760);
    this.logo(ui, (px - 10) / 2, h * .5, logoW, now);
  }
}
