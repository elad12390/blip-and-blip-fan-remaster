// Drawing primitives for the Blip & Blop interface: chunky cartoon panels and
// buttons with thick ink outlines, the original beveled menu font, and small
// comic textures. Expensive results (outlined text, halftone) are cached.

export const C = Object.freeze({
  ink: '#141018', cream: '#fff4d6', paper: '#f0cf8d',
  blip: '#2b57e8', blipDark: '#1631a0', blipLight: '#8fb0ff',
  blop: '#e2694b', blopDark: '#a43a24', blopLight: '#ff9b7e',
  helmet: '#3fa33c', helmetDark: '#1c6a19', bandana: '#e2262a', bandanaDark: '#b3141a',
  gold: '#ffd23a', goldLight: '#fff08a', goldDark: '#d58a12',
  purple: '#7b3fd1', purpleDark: '#43208a', sky: '#3aa5d9', skyDark: '#1b5f86',
  night: '#15111f', dusk: '#2b2440', lilac: '#e6ddff', muted: '#9e93c0', aqua: '#9ff7ff',
});
export const BODY_FONT = "ui-rounded, 'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif";

const TEXT_CACHE_LIMIT = 400;

export class Painter {
  constructor(ctx, art) {
    this.ctx = ctx;
    this.art = art;
    this.dpr = 1;
    this.textCache = new Map();
    this.tintCache = new Map();
    this.patternCache = new Map();
  }

  setScale(dpr) {
    if (dpr !== this.dpr) { this.dpr = dpr; this.textCache.clear(); this.patternCache.clear(); }
  }

  // ---------- shapes ----------
  rr(x, y, w, h, r) { const g = this.ctx; g.beginPath(); g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))); }

  gradient(y, h, colors) {
    const lg = this.ctx.createLinearGradient(0, y, 0, y + h);
    colors.forEach((c, i) => lg.addColorStop(i / (colors.length - 1), c));
    return lg;
  }

  panel(x, y, w, h, { r = 18, fill = C.cream, grad, ink = 4, shadow = 6, tilt = 0, gloss = true } = {}) {
    const g = this.ctx;
    g.save();
    if (tilt) { g.translate(x + w / 2, y + h / 2); g.rotate(tilt * Math.PI / 180); g.translate(-(x + w / 2), -(y + h / 2)); }
    if (shadow) { this.rr(x + shadow * .4, y + shadow, w, h, r); g.fillStyle = '#0009'; g.fill(); }
    this.rr(x, y, w, h, r);
    g.fillStyle = grad ? this.gradient(y, h, grad) : fill;
    g.fill();
    if (ink) { g.lineWidth = ink; g.strokeStyle = C.ink; g.stroke(); }
    if (gloss) { g.save(); this.rr(x, y, w, h, r); g.clip(); g.fillStyle = '#ffffff38'; this.rr(x + ink, y + ink, w - ink * 2, h * .42, r * .8); g.fill(); g.restore(); }
    g.restore();
  }

  button(x, y, w, h, label, { top = C.gold, bottom = C.goldDark, color = C.cream, size = h * .42, icon, r = h * .32, pressed = false, focused = false, disabled = false } = {}) {
    const g = this.ctx, lip = pressed ? 2 : 6, dy = pressed ? 4 : 0;
    g.save();
    if (disabled) g.globalAlpha = .45;
    this.rr(x, y + lip, w, h, r); g.fillStyle = C.ink; g.fill();
    this.rr(x, y + dy, w, h, r); g.fillStyle = this.gradient(y + dy, h, [top, bottom]); g.fill();
    g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    g.save(); this.rr(x, y + dy, w, h, r); g.clip(); g.fillStyle = '#ffffff4a'; this.rr(x + 6, y + dy + 4, w - 12, h * .38, r * .7); g.fill(); g.restore();
    let tx = x + w / 2;
    if (icon) { icon(x + h * .52, y + dy + h / 2, h * .26); if (label) tx += h * .22; }
    if (label) this.text(label, tx, y + dy + h / 2, size, { color, align: 'center' });
    g.restore();
    if (focused) this.focusRing(x, y + dy, w, h, r);
  }

  roundButton(cx, cy, r, { top, bottom, label, icon, labelSize = r * .34, pressed = false, focused = false, alpha = 1 } = {}) {
    const g = this.ctx, dy = pressed ? 3 : 0;
    g.save(); g.globalAlpha = alpha;
    g.beginPath(); g.arc(cx, cy + 5, r, 0, Math.PI * 2); g.fillStyle = C.ink; g.fill();
    g.beginPath(); g.arc(cx, cy + dy, r, 0, Math.PI * 2);
    const rg = g.createRadialGradient(cx - r * .3, cy + dy - r * .4, r * .1, cx, cy + dy, r);
    rg.addColorStop(0, top); rg.addColorStop(1, bottom); g.fillStyle = rg; g.fill();
    g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    if (pressed) { g.fillStyle = '#ffffff30'; g.fill(); }
    g.beginPath(); g.ellipse(cx - r * .1, cy + dy - r * .45, r * .62, r * .3, -.2, 0, Math.PI * 2); g.fillStyle = '#ffffff50'; g.fill();
    icon?.(cx, cy + dy - (label ? r * .12 : 0), r);
    if (label) this.text(label, cx, cy + dy + r * .5, labelSize, { align: 'center' });
    g.restore();
    if (focused) { g.save(); g.beginPath(); g.arc(cx, cy + dy, r + 7, 0, Math.PI * 2); this.focusStroke(); g.restore(); }
  }

  focusStroke() {
    const g = this.ctx, pulse = .6 + .4 * Math.sin(performance.now() / 180);
    g.lineWidth = 4; g.strokeStyle = `rgba(255, 240, 138, ${pulse})`; g.setLineDash([10, 6]); g.lineDashOffset = -performance.now() / 40; g.stroke(); g.setLineDash([]);
  }
  focusRing(x, y, w, h, r) { this.ctx.save(); this.rr(x - 7, y - 7, w + 14, h + 14, r + 7); this.focusStroke(); this.ctx.restore(); }

  badge(cx, cy, r, label, fill = C.bandana) {
    const g = this.ctx;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke();
    if (label) this.text(label, cx, cy + 1, r * 1.05, { align: 'center' });
  }

  // Health pips: rounded capsules, lit green for remaining health.
  pips(x, y, count, filled, w, h, gap) {
    const g = this.ctx;
    for (let i = 0; i < count; i++) {
      const px = x + i * (w + gap);
      this.rr(px, y + 2, w, h, h * .35); g.fillStyle = '#0008'; g.fill();
      this.rr(px, y, w, h, h * .35);
      g.fillStyle = this.gradient(y, h, i < filled ? (filled <= Math.ceil(count * .35) ? ['#ffb08a', '#d4432c'] : ['#9dff72', '#2f9e27']) : ['#4a3b3b', '#2a2020']);
      g.fill(); g.lineWidth = 2.5; g.strokeStyle = C.ink; g.stroke();
      if (i < filled) { g.fillStyle = '#ffffff70'; this.rr(px + h * .2, y + h * .15, w - h * .4, h * .3, 3); g.fill(); }
    }
  }

  // ---------- textures ----------
  pattern(key, w, h, draw) {
    const id = `${key}|${Math.round(w)}x${Math.round(h)}`;
    let canvas = this.patternCache.get(id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(w * this.dpr)); canvas.height = Math.max(1, Math.ceil(h * this.dpr));
      const c = canvas.getContext('2d'); c.scale(this.dpr, this.dpr); draw(c, w, h);
      if (this.patternCache.size > 24) this.patternCache.clear();
      this.patternCache.set(id, canvas);
    }
    this.ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h);
  }

  halftone(x, y, w, h, color, { step = 10, maxR = 2.8, fromTop = true } = {}) {
    this.ctx.save(); this.ctx.translate(x, y);
    this.pattern(`halftone|${color}|${step}|${maxR}|${fromTop}`, w, h, (c) => {
      c.fillStyle = color;
      for (let yy = 0; yy < h; yy += step) for (let xx = (yy / step % 2) * step / 2; xx < w; xx += step) {
        const t = fromTop ? 1 - yy / h : yy / h, r = maxR * t;
        if (r < .3) continue;
        c.beginPath(); c.arc(xx, yy, r, 0, Math.PI * 2); c.fill();
      }
    });
    this.ctx.restore();
  }

  hazard(x, y, w, h) {
    const g = this.ctx;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = C.gold; g.fillRect(x, y, w, h); g.fillStyle = C.ink;
    for (let i = -h; i < w + h; i += h * 1.6) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h * .8, y + h); g.lineTo(x + i + h * 1.6, y); g.lineTo(x + i + h * .8, y); g.fill(); }
    g.restore(); g.lineWidth = 3; g.strokeStyle = C.ink; g.strokeRect(x, y, w, h);
  }

  sunburst(cx, cy, radius, color, alpha, spin = 0) {
    const g = this.ctx;
    g.save(); g.translate(cx, cy); g.rotate(spin); g.globalAlpha = alpha; g.fillStyle = color;
    for (let i = 0; i < 24; i++) { g.rotate(Math.PI / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(radius, -radius * .1); g.lineTo(radius, radius * .1); g.fill(); }
    g.restore();
  }

  // Cover-fit an image into a rect (backdrops).
  cover(image, x, y, w, h, [sx, sy, sw, sh] = [0, 0, image.width, image.height]) {
    const s = Math.max(w / sw, h / sh), dw = sw * s, dh = sh * s;
    this.ctx.drawImage(image, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  sprite(image, [sx, sy, sw, sh], x, y, scale = 1, { outline = 0 } = {}) {
    const g = this.ctx;
    if (outline) {
      const sil = this.silhouette(image, sx, sy, sw, sh);
      for (let a = 0; a < 8; a++) g.drawImage(sil, x + Math.cos(a * Math.PI / 4) * outline, y + Math.sin(a * Math.PI / 4) * outline, sw * scale, sh * scale);
    }
    g.drawImage(image, sx, sy, sw, sh, x, y, sw * scale, sh * scale);
  }

  silhouette(image, sx, sy, sw, sh) {
    const key = `${image.src ?? 'canvas'}|${sx},${sy}`;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const q = c.getContext('2d'); q.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
      q.globalCompositeOperation = 'source-in'; q.fillStyle = C.ink; q.fillRect(0, 0, sw, sh);
      this.tintCache.set(key, c);
    }
    return c;
  }

  // ---------- text ----------
  // The original beveled menu font, recoloured, with a thick ink outline and a
  // drop shadow. Rendered strings are cached at device resolution.
  text(str, x, y, size, { color = C.cream, align = 'left', outline = true } = {}) {
    const entry = this.textEntry(String(str).toUpperCase(), size, color, outline);
    const left = align === 'center' ? x - entry.width / 2 : align === 'right' ? x - entry.width : x;
    this.ctx.drawImage(entry.canvas, left - entry.pad, y - entry.height / 2 - entry.pad, entry.canvas.width / this.dpr, entry.canvas.height / this.dpr);
    return entry.width;
  }

  measure(str, size) { return this.textEntry(String(str).toUpperCase(), size, C.cream, true).width; }

  textEntry(str, size, color, outline) {
    const key = `${str}|${size.toFixed(2)}|${color}|${outline}`;
    let entry = this.textCache.get(key);
    if (entry) return entry;
    const { glyphs, spaceWidth } = this.art.fontMeta;
    const s = size / 24, spacing = 1;
    const glyphFor = ch => glyphs[ch] ?? glyphs[{ ':': ';', '?': '!', '&': '+', '…': '.' }[ch]];
    const advance = ch => ch === ' ' ? spaceWidth * s : ((glyphFor(ch)?.[2] ?? 12) + spacing) * s;
    const width = [...str].reduce((sum, ch) => sum + advance(ch), 0);
    const o = outline ? Math.max(1.5, size * .1) : 0, pad = Math.ceil(o * 2 + 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil((width + pad * 2) * this.dpr));
    canvas.height = Math.max(1, Math.ceil((size + pad * 2) * this.dpr));
    const c = canvas.getContext('2d');
    c.scale(this.dpr, this.dpr);
    const tinted = this.tintedFont(color), silhouette = this.tintedFont(C.ink, true);
    const pass = (dx, dy, source) => {
      let px = pad;
      for (const ch of str) {
        const glyph = glyphFor(ch);
        if (glyph) { const [gx, gy, gw, gh] = glyph; c.drawImage(source, gx, gy, gw, gh, px + dx, pad + dy, gw * s, gh * s); }
        px += advance(ch);
      }
    };
    if (outline) { pass(o * .6, o * 1.5, silhouette); for (let a = 0; a < 8; a++) pass(Math.cos(a * Math.PI / 4) * o, Math.sin(a * Math.PI / 4) * o, silhouette); }
    pass(0, 0, tinted);
    entry = { canvas, width, height: size, pad };
    if (this.textCache.size > TEXT_CACHE_LIMIT) this.textCache.delete(this.textCache.keys().next().value);
    this.textCache.set(key, entry);
    return entry;
  }

  tintedFont(color, solid = false) {
    const key = `font|${color}|${solid}`;
    let c = this.tintCache.get(key);
    if (!c) {
      const font = this.art.font;
      c = document.createElement('canvas'); c.width = font.width; c.height = font.height;
      const q = c.getContext('2d');
      q.drawImage(font, 0, 0);
      q.globalCompositeOperation = solid ? 'source-in' : 'multiply';
      q.fillStyle = color; q.fillRect(0, 0, c.width, c.height);
      if (!solid) { q.globalCompositeOperation = 'destination-in'; q.drawImage(font, 0, 0); }
      this.tintCache.set(key, c);
    }
    return c;
  }

  // Readable small text (descriptions, settings) in a bold rounded face.
  body(str, x, y, { size = 13, color = C.lilac, align = 'left', weight = 800, maxWidth = Infinity, lineHeight = 1.35, shadow = true } = {}) {
    const g = this.ctx;
    g.save();
    g.font = `${weight} ${size}px ${BODY_FONT}`;
    g.textAlign = align; g.textBaseline = 'middle';
    const lines = [];
    for (const paragraph of String(str).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    lines.forEach((line, i) => {
      const ly = y + i * size * lineHeight;
      if (shadow) { g.fillStyle = '#000a'; g.fillText(line, x + 1, ly + 2); }
      g.fillStyle = color; g.fillText(line, x, ly);
    });
    g.restore();
    return lines.length * size * lineHeight;
  }

  // ---------- icons (centre, radius) ----------
  icon(name, cx, cy, r, color = C.ink) {
    const g = this.ctx;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color; g.fillStyle = color;
    switch (name) {
      case 'crosshair':
        g.lineWidth = r * .16; g.beginPath(); g.arc(cx, cy, r * .5, 0, Math.PI * 2);
        for (const [a, b, c2, d] of [[0, -1, 0, -.25], [0, .25, 0, 1], [-1, 0, -.25, 0], [.25, 0, 1, 0]]) { g.moveTo(cx + a * r, cy + b * r); g.lineTo(cx + c2 * r, cy + d * r); }
        g.stroke(); break;
      case 'jump':
        g.fillStyle = C.cream; g.strokeStyle = C.ink; g.lineWidth = 3.5; g.beginPath();
        g.moveTo(cx, cy - r); g.lineTo(cx + r * .85, cy); g.lineTo(cx + r * .35, cy); g.lineTo(cx + r * .35, cy + r * .8); g.lineTo(cx - r * .35, cy + r * .8); g.lineTo(cx - r * .35, cy); g.lineTo(cx - r * .85, cy); g.closePath(); g.fill(); g.stroke(); break;
      case 'pause':
        this.rr(cx - r * .5, cy - r * .6, r * .34, r * 1.2, 3); g.fill(); this.rr(cx + r * .16, cy - r * .6, r * .34, r * 1.2, 3); g.fill(); break;
      case 'gear':
        g.translate(cx, cy);
        for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-r * .18, -r * .95, r * .36, r * .5); }
        g.beginPath(); g.arc(0, 0, r * .62, 0, Math.PI * 2); g.fill(); g.fillStyle = C.gold; g.beginPath(); g.arc(0, 0, r * .25, 0, Math.PI * 2); g.fill(); break;
      case 'back':
        g.lineWidth = r * .28; g.beginPath(); g.moveTo(cx + r * .45, cy - r * .7); g.lineTo(cx - r * .35, cy); g.lineTo(cx + r * .45, cy + r * .7); g.stroke(); break;
      case 'close':
        g.lineWidth = r * .28; g.beginPath(); g.moveTo(cx - r * .55, cy - r * .55); g.lineTo(cx + r * .55, cy + r * .55); g.moveTo(cx + r * .55, cy - r * .55); g.lineTo(cx - r * .55, cy + r * .55); g.stroke(); break;
      case 'check':
        g.lineWidth = r * .3; g.beginPath(); g.moveTo(cx - r * .6, cy); g.lineTo(cx - r * .15, cy + r * .5); g.lineTo(cx + r * .65, cy - r * .5); g.stroke(); break;
      case 'play':
        g.beginPath(); g.moveTo(cx - r * .45, cy - r * .7); g.lineTo(cx + r * .75, cy); g.lineTo(cx - r * .45, cy + r * .7); g.closePath(); g.fill(); break;
      case 'fullscreen':
        g.lineWidth = r * .22;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(cx + sx * r * .75, cy + sy * r * .25); g.lineTo(cx + sx * r * .75, cy + sy * r * .75); g.lineTo(cx + sx * r * .25, cy + sy * r * .75); g.stroke(); }
        break;
      case 'shard':
        g.translate(cx, cy); g.rotate(Math.PI / 4); g.fillStyle = '#6ff0ff'; g.strokeStyle = C.ink; g.lineWidth = 3; g.fillRect(-r * .6, -r * .6, r * 1.2, r * 1.2); g.strokeRect(-r * .6, -r * .6, r * 1.2, r * 1.2); break;
      case 'trophy':
        g.lineWidth = r * .18; g.beginPath(); g.moveTo(cx - r * .55, cy - r * .7); g.lineTo(cx + r * .55, cy - r * .7); g.lineTo(cx + r * .4, cy + r * .05); g.quadraticCurveTo(cx, cy + r * .35, cx - r * .4, cy + r * .05); g.closePath(); g.fill();
        g.fillRect(cx - r * .12, cy + r * .2, r * .24, r * .35); g.fillRect(cx - r * .4, cy + r * .55, r * .8, r * .18); break;
      case 'question':
        g.lineWidth = r * .26; g.beginPath(); g.arc(cx, cy - r * .3, r * .38, Math.PI * 1.1, Math.PI * 2.3); g.lineTo(cx, cy + r * .2); g.stroke(); g.beginPath(); g.arc(cx, cy + r * .62, r * .14, 0, Math.PI * 2); g.fill(); break;
      case 'wrench':
        g.lineWidth = r * .32; g.beginPath(); g.moveTo(cx - r * .55, cy + r * .55); g.lineTo(cx + r * .2, cy - r * .2); g.stroke();
        g.beginPath(); g.arc(cx + r * .35, cy - r * .35, r * .4, Math.PI * .9, Math.PI * 2.6); g.lineWidth = r * .22; g.stroke(); break;
    }
    g.restore();
  }
}
