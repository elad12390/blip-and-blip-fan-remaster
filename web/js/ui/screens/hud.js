import { C } from '../paint.js';
import { SPRITES } from '../art.js';
import { computeLayout } from '../layout.js';
import { iconButton } from '../components.js';

// Gameplay HUD and touch controls. Not modal: gameplay input passes through.
export class HudScreen {
  constructor(model, touch) { this.model = model; this.touch = touch; this.modal = false; this.layoutKey = ''; this.banner = null; this.banks = new Map(); }

  // Dialogue portrait banks: rows of 100x100 heads, loaded on first use.
  bank(name) {
    if (!name) return null;
    let image = this.banks.get(name);
    if (!image) { image = new Image(); image.src = `assets/ui/rpg/${name.replace(/\.gfx$/i, '')}.png`; this.banks.set(name, image); }
    return image.complete && image.naturalWidth ? image : null;
  }

  showBanner(text) { this.banner = { text, born: performance.now() }; }

  layoutFor(ui) {
    const m = this.model, s = m.save.settings;
    const layout = computeLayout({ width: ui.width, height: ui.height, touch: m.touchVisible(), handedness: s.handedness, large: s.controlSize === 'large', coop: m.players === 2, safe: m.safeArea() });
    const key = JSON.stringify([layout.game, layout.touch, layout.mirror, layout.portraitDeck, s.controlSize]);
    if (key !== this.layoutKey) { this.layoutKey = key; m.applyLayout(layout); }
    return layout;
  }

  draw(ui, dt, now) {
    const m = this.model, state = m.state ?? {}, layout = this.layoutFor(ui);
    const dialogue = state.inGame && state.dialogue ? state.dialogue : null;
    // Controls belong to the hero only while nobody is talking.
    const gameplay = !!state.inGame && state.frameIsGameplay !== false && !dialogue;
    if (layout.deck) this.deck(ui, layout);
    if (gameplay) this.goArrow(ui, layout, state, now);
    if (gameplay) this.threats(ui, layout, state, now);
    if (gameplay) this.status(ui, layout, state);
    if (dialogue) this.dialogue(ui, layout, dialogue, now);
    iconButton(ui, 'hud-pause', layout.pause.x, layout.pause.y, layout.pause.r, 'pause', null, { onDown: () => m.pause(), focusable: false });
    if (layout.touch) this.touchControls(ui, layout, state, gameplay);
    else if (gameplay) this.keyHints(ui, layout, now);
    this.drawBanner(ui, now);
    this.syncTouchZones(layout, gameplay);
  }

  syncTouchZones(layout, gameplay) {
    if (!layout.touch) { this.touch.setZones({}); return; }
    const buttons = gameplay ? Object.values(layout.buttons) : [];
    if (!gameplay) buttons.push({ id: 'confirm', bit: 128, x: layout.confirm.x + layout.confirm.w / 2, y: layout.confirm.y + layout.confirm.h / 2, r: layout.confirm.w / 2 });
    this.touch.setZones({ stick: gameplay ? layout.stick : null, buttons });
  }

  deck(ui, layout) {
    const p = ui.paint, g = ui.ctx, d = layout.deck;
    g.fillStyle = '#1c1629'; g.fillRect(d.x, d.y, d.w, d.h);
    p.halftone(d.x, d.y, d.w, d.h, '#3b2f5c', { step: 10, maxR: 3, fromTop: true });
    p.hazard(0, d.y - 4, d.w, 14);
  }

  status(ui, layout, state) {
    const m = this.model, p = ui.paint, g = ui.ctx, s = layout.hud.scale, x = layout.hud.x, y = layout.hud.y;
    const hero = m.hero, pr = 30 * s, px = x + pr, py = y + pr;
    // Portrait medallion with the hero's own dialogue head.
    g.beginPath(); g.arc(px + 2, py + 5, pr + 3, 0, Math.PI * 2); g.fillStyle = '#0009'; g.fill();
    g.save(); g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.clip();
    g.fillStyle = hero ? C.helmet : C.blip; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    // The 100px dialogue head fills the medallion without cropping the face.
    const [sx, sy, sw, sh] = SPRITES.portrait[hero];
    g.drawImage(ui.art.portraits, sx, sy, sw, sh, px - pr * 1.08, py - pr * 1.02, pr * 2.16, pr * 2.16);
    g.restore();
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.lineWidth = 4.5; g.strokeStyle = C.ink; g.stroke();
    g.beginPath(); g.arc(px, py, pr - 4, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = hero ? C.helmet : C.bandana; g.stroke();
    p.badge(px + pr * .78, py + pr * .8, 11 * s, `X${Math.max(0, state.lives ?? 0)}`, C.ink);
    const bx = px + pr + 8 * s;
    p.text(hero ? 'BLOP' : 'BLIP', bx, y + 14 * s, 17 * s, { color: hero ? C.blopLight : C.blipLight });
    const maxHp = Math.max(1, state.maxHp ?? 5), hp = Math.max(0, Math.min(maxHp, state.hp ?? 0));
    const pipW = Math.min(18 * s, 110 * s / maxHp);
    p.pips(bx, y + 28 * s, maxHp, hp, pipW, 14 * s, 4 * s);
    const score = String(Math.max(0, state.score ?? 0)).padStart(6, '0');
    const compact = layout.portraitDeck || ui.width < 560;
    if (compact) p.text(score, bx, y + 58 * s, 17 * s, { color: C.gold });
    else {
      const sw2 = 150 * s, sx2 = (ui.width - sw2) / 2;
      p.panel(sx2, y + 2 * s, sw2, 40 * s, { r: 14 * s, grad: [C.dusk, C.night], ink: 3.5, shadow: 4 });
      p.text(score, sx2 + sw2 / 2, y + 23 * s, 22 * s, { align: 'center', color: C.gold });
    }
    const seconds = Math.max(0, Math.ceil(state.bonusTimer ?? 0));
    if (seconds > 0) {
      const tx = compact ? ui.width / 2 - 50 * s : (ui.width + 150 * s) / 2 + 12 * s, ty = compact ? y + 2 * s : y + 2 * s;
      p.panel(tx, ty, 100 * s, 40 * s, { r: 14 * s, grad: seconds <= 10 ? ['#ff7b62', C.bandanaDark] : [C.dusk, C.night], ink: 3.5, shadow: 4 });
      p.text(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, tx + 50 * s, ty + 21 * s, 20 * s, { align: 'center', color: C.cream });
    }
    if (m.players === 2 && state.player2) this.partner(ui, layout, state.player2, maxHp);
    this.weaponChip(ui, layout.weapon, state);
  }

  partner(ui, layout, p2, maxHp) {
    const p = ui.paint, s = layout.hud.scale, x = layout.hud.x, y = layout.hud.y + (layout.portraitDeck || ui.width < 560 ? 78 : 70) * s;
    p.panel(x, y, 190 * s, 36 * s, { r: 12 * s, grad: ['#2a3350', '#161b2c'], ink: 3, shadow: 3 });
    p.text('P2', x + 10 * s, y + 18 * s, 14 * s, { color: C.blopLight });
    p.pips(x + 40 * s, y + 11 * s, maxHp, Math.max(0, p2.hp ?? 0), Math.min(12 * s, 80 * s / maxHp), 11 * s, 3 * s);
    p.text(`X${Math.max(0, p2.lives ?? 0)}`, x + 182 * s, y + 18 * s, 13 * s, { align: 'right', color: C.cream });
  }

  weaponChip(ui, chip, state) {
    if (!chip) return;
    const p = ui.paint, s = chip.scale, weapon = Math.max(0, Math.min(4, state.weapon ?? 0));
    p.panel(chip.x, chip.y, 132 * s, 46 * s, { r: 14 * s, grad: ['#3a3350', '#1c1729'], ink: 3.5, shadow: 4 });
    const [sx, sy, sw, sh] = SPRITES.weapons[weapon], scale = Math.min(64 * s / sw, 26 * s / sh);
    p.sprite(ui.art.misc, [sx, sy, sw, sh], chip.x + 10 * s, chip.y + 23 * s - sh * scale / 2, scale, { outline: 1.5 });
    p.text(weapon ? String(Math.max(0, state.ammo ?? 0)) : 'INF', chip.x + 122 * s, chip.y + 24 * s, 17 * s, { align: 'right', color: C.gold });
    if (!this.model.touchVisible()) {
      const cx = chip.x + 142 * s;
      p.panel(cx, chip.y, 96 * s, 46 * s, { r: 14 * s, grad: ['#3a3350', '#1c1729'], ink: 3.5, shadow: 4 });
      p.sprite(ui.art.misc, SPRITES.cow, cx + 8 * s, chip.y + 6 * s, s * .98, { outline: 1.5 });
      p.text(`X${Math.max(0, state.cows ?? 0)}`, cx + 88 * s, chip.y + 24 * s, 17 * s, { align: 'right', color: C.gold });
    }
  }

  // In-level conversations over the live world: the top speaker on the left,
  // the bottom speaker on the right, as in the original screens.
  dialogue(ui, layout, dialogue, now) {
    const p = ui.paint, g = ui.ctx, m = this.model, game = layout.game;
    g.fillStyle = '#0b081466'; g.fillRect(game.x, game.y, game.w, game.h);
    const w = Math.min(game.w - 24, 760), x = game.x + (game.w - w) / 2;
    const portrait = Math.max(64, Math.min(116, game.h * .24, w * .2));
    const panelH = portrait + 24;
    const topY = game.y + Math.max(layout.pause.y + layout.pause.r + 12, game.h * .1);
    const bottomLimit = layout.touch && !layout.deck ? layout.confirm.y - 16 : game.y + game.h - 18;
    const bottomY = Math.max(topY + panelH + 14, bottomLimit - panelH);
    dialogue.panels.forEach((panel, i) => {
      if (!panel) return;
      const y = i === 0 ? topY : bottomY, left = i === 0;
      const image = this.bank(panel.who === 'hero' ? 'rpg_bb.gfx' : dialogue.bank);
      p.panel(x, y, w, panelH, { r: 20, grad: left ? [C.cream, C.paper] : ['#dfe8ff', '#aebfee'], ink: 4, shadow: 6, tilt: left ? -.6 : .6 });
      const px = left ? x + 12 : x + w - 12 - portrait, py = y + 12;
      p.rr(px, py, portrait, portrait, 14); g.fillStyle = panel.who === 'hero' ? C.blipDark : C.purpleDark; g.fill();
      if (image && panel.image >= 0) {
        g.save(); p.rr(px, py, portrait, portrait, 14); g.clip();
        g.drawImage(image, 1 + panel.image * 102, 1, 100, 100, px, py, portrait, portrait);
        g.restore();
      }
      p.rr(px, py, portrait, portrait, 14); g.lineWidth = 3.5; g.strokeStyle = C.ink; g.stroke();
      const tx = left ? px + portrait + 16 : x + 18, tw = w - portrait - 46;
      const size = Math.max(13, Math.min(24, panelH / 5.2, w / 34));
      p.body(panel.text, tx, y + 24, { size, color: C.ink, shadow: false, maxWidth: tw, weight: 800, lineHeight: 1.3 });
    });
    if (!layout.touch) {
      const pulse = .55 + .45 * Math.sin(now / 260);
      g.save(); g.globalAlpha = pulse;
      const lastY = dialogue.panels[1] ? bottomY : topY;
      p.text('ENTER  CONTINUE', x + w - 8, lastY + panelH + 22, 15, { align: 'right', color: C.goldLight });
      g.restore();
    }
    // Skip the whole conversation (the original Escape behaviour; Escape now pauses).
    const sw = 92, sx = x + w - sw, sy = topY - 50;
    const skip = ui.region('dialogue-skip', { x: sx, y: sy, w: sw, h: 38 }, { onDown: () => m.skipDialogue(), focusable: false });
    p.button(sx, sy, sw, 38, 'SKIP', { top: '#e8dcc3', bottom: '#b9a680', size: 15, r: 12, pressed: skip.pressed });
  }

  // Narrow displays see part of the play window: pulse red chevrons at the
  // edge an off-screen enemy is on, with a count.
  threats(ui, layout, state, now) {
    const [left = 0, right = 0] = state.threats ?? [];
    const p = ui.paint, g = ui.ctx, game = layout.game, pulse = .65 + .35 * Math.sin(now / 160);
    const s = Math.max(.8, Math.min(1.3, game.h / 420)), y = game.y + game.h * .58;
    for (const [count, side] of [[left, -1], [right, 1]]) {
      if (!count) continue;
      const x = side < 0 ? game.x + 16 * s : game.x + game.w - 16 * s;
      g.save(); g.globalAlpha = pulse; g.translate(x, y); g.scale(side * s, s);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -20); g.lineTo(-18, 20); g.closePath();
      g.fillStyle = C.bandana; g.fill(); g.lineWidth = 3.5; g.strokeStyle = C.ink; g.stroke();
      g.restore();
      p.badge(x - side * 30 * s, y, 12 * s, String(count), C.ink);
    }
  }

  // The original GO arrow sprite, sliding in at the right edge of the game view
  // and bouncing like the original, whenever the engine asks the player to move on.
  goArrow(ui, layout, state, now) {
    if (state.go && !this.goSince) this.goSince = now;
    if (!state.go) { this.goSince = 0; return; }
    const g = ui.ctx, frames = SPRITES.go, frame = frames[Math.floor(now / 70) % frames.length];
    const s = Math.max(.9, Math.min(1.6, layout.game.h / 300)), w = frame[2] * s, h = frame[3] * s;
    const enter = Math.min(1, (now - this.goSince) / 350);
    const bounce = Math.abs(Math.sin(now / 230)) * 22 * s;
    const right = layout.game.x + layout.game.w - 18 * s - (layout.mirror ? 0 : 0);
    const x = right - w - bounce + (1 - enter) * (w + 40), y = layout.game.y + layout.game.h * .42 - h / 2;
    g.save(); g.shadowColor = '#000a'; g.shadowBlur = 8; g.shadowOffsetY = 4;
    g.drawImage(ui.art.misc, frame[0], frame[1], frame[2], frame[3], x, y, w, h);
    g.restore();
  }

  keyHints(ui, layout, now) {
    // Shown for the first moments of play, then out of the way.
    const since = now - (this.model.playStartedAt ?? now);
    const alpha = since < 9000 ? 1 : Math.max(0, 1 - (since - 9000) / 800);
    if (alpha <= 0) return;
    const p = ui.paint, g = ui.ctx, u = layout.hints.scale, coop = this.model.players === 2;
    g.save(); g.globalAlpha = alpha;
    const keys = coop ? [['F', 'FIRE'], ['G', 'JUMP'], ['H', 'COW'], ['ESC', 'PAUSE']] : [['J', 'FIRE'], ['SPACE', 'JUMP'], ['L', 'COW'], ['ESC', 'PAUSE']];
    let kx = layout.hints.x;
    for (const [key, label] of keys.reverse()) {
      const lw = p.text(label, kx, layout.hints.y, 13 * u, { align: 'right', color: C.lilac });
      kx -= lw + 10 * u;
      const kw = Math.max(34, key.length * 13 + 16) * u;
      p.button(kx - kw, layout.hints.y - 17 * u, kw, 34 * u, key, { top: '#f4f0ff', bottom: '#a79fc4', size: 13 * u, r: 9 * u });
      kx -= kw + 26 * u;
    }
    g.restore();
  }

  touchControls(ui, layout, state, gameplay) {
    const p = ui.paint, g = ui.ctx, m = this.model;
    if (!gameplay) {
      const c = layout.confirm, pressed = this.touch.pressed.has('confirm');
      p.button(c.x, c.y, c.w, c.h, 'CONTINUE', { top: C.goldLight, bottom: C.goldDark, size: c.h * .36, pressed, icon: (x, y, r) => p.icon('play', x + c.w - c.h * 1.1, y, r * .8) });
      return;
    }
    // Stick: resting ring, or the live ring under the thumb.
    const st = layout.stick, live = this.touch.stick, r = st.radius;
    const ox = live ? live.originX : st.restX, oy = live ? live.originY : st.restY;
    g.save(); g.globalAlpha = live ? .95 : .72;
    g.beginPath(); g.arc(ox, oy + 4, r, 0, Math.PI * 2); g.fillStyle = '#0006'; g.fill();
    g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.fillStyle = '#1a1530aa'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    g.beginPath(); g.arc(ox, oy, r - 6, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = live ? '#fff08a90' : '#ffffff40'; g.stroke();
    for (let a = 0; a < 4; a++) { g.save(); g.translate(ox, oy); g.rotate(a * Math.PI / 2); g.beginPath(); g.moveTo(0, -r + 12); g.lineTo(8, -r + 22); g.lineTo(-8, -r + 22); g.closePath(); g.fillStyle = '#ffffff90'; g.fill(); g.restore(); }
    g.restore();
    p.roundButton(ox + (live?.dx ?? 0), oy + (live?.dy ?? 0), r * .44, { top: '#7fa3ff', bottom: C.blipDark, alpha: live ? 1 : .85 });

    const { fire, jump, cow } = layout.buttons, pressed = this.touch.pressed;
    const autoFire = m.save.settings.autoFire;
    p.roundButton(fire.x, fire.y, fire.r, { top: autoFire ? '#ffd27a' : '#ff7b62', bottom: autoFire ? '#c07010' : C.bandanaDark, label: autoFire ? 'AUTO' : 'FIRE', pressed: pressed.has('fire'), icon: (x, y) => p.icon('crosshair', x, y, fire.r * .36) });
    p.roundButton(jump.x, jump.y, jump.r, { top: '#9dff72', bottom: '#23801e', label: 'JUMP', pressed: pressed.has('jump'), icon: (x, y) => p.icon('jump', x, y, jump.r * .36) });
    p.roundButton(cow.x, cow.y, cow.r, { top: C.cream, bottom: '#c9b98f', pressed: pressed.has('cow'), icon: (x, y) => p.sprite(ui.art.misc, SPRITES.cow, x - 23 * cow.r / 32, y - 17 * cow.r / 32, cow.r / 32) });
    p.badge(cow.x + cow.r * .75, cow.y - cow.r * .7, 11 * layout.unit, String(Math.max(0, state.cows ?? 0)));

    const a = layout.autoFire, auto = ui.region('auto-fire', { x: a.x, y: a.y, w: a.w, h: a.h }, { onDown: () => m.setSetting('autoFire', !autoFire), focusable: false });
    p.panel(a.x, a.y + (auto.pressed ? 2 : 0), a.w, a.h, { r: a.h / 2, grad: autoFire ? ['#8a7426', '#5a4a14'] : ['#2a2340', '#15111f'], ink: 3, shadow: auto.pressed ? 1 : 3, gloss: false });
    p.text(autoFire ? 'AUTO ON' : 'AUTO OFF', a.x + a.w / 2, a.y + a.h / 2 + (auto.pressed ? 2 : 0), a.h * .36, { align: 'center', color: autoFire ? C.goldLight : C.muted });
  }

  drawBanner(ui, now) {
    if (!this.banner) return;
    const age = (now - this.banner.born) / 1000;
    if (age > 3.2) { this.banner = null; return; }
    const p = ui.paint, g = ui.ctx;
    const enter = Math.min(1, age / .35), leave = Math.max(0, (age - 2.6) / .6);
    const size = Math.min(40, ui.width / 14, ui.height / 13), w = p.measure(this.banner.text, size) + 70;
    const x = ui.width / 2 - w / 2 + (1 - enter) * -ui.width + leave * ui.width, y = ui.height * .3;
    g.save(); g.translate(x + w / 2, y); g.rotate(-2 * Math.PI / 180);
    p.panel(-w / 2, -size * .9, w, size * 1.8, { r: 14, grad: ['#ff6f55', C.bandana], ink: 5, shadow: 7 });
    p.text(this.banner.text, 0, 0, size, { align: 'center' });
    g.restore();
  }
}
