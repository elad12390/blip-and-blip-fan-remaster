import { Painter, C } from './paint.js';

// The interface runtime: a full-screen canvas over the game view.
//
// Screens are drawn every animation frame, bottom to top. While drawing, a
// screen registers interactive regions; pointer, keyboard and gamepad input are
// resolved against the regions of the last frame. Only the top screen is
// interactive. A screen without `modal` lets gameplay input through.
export class UI {
  constructor(canvas, art, { onPauseKey, touch, pauseKeys = () => ['Escape', 'KeyP'], pauseButtons = () => [9], onGamepad, onConsoleKey } = {}) {
    this.pauseKeys = pauseKeys; this.pauseButtons = pauseButtons; this.onGamepad = onGamepad; this.onConsoleKey = onConsoleKey;
    this.capture = null;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.paint = new Painter(this.ctx, art);
    this.art = art;
    this.touch = touch;
    this.onPauseKey = onPauseKey;
    this.stack = [];
    this.regions = [];
    this.nextRegions = [];
    this.focusId = null;
    this.focusVisible = false;
    this.pointers = new Map(); // pointer id -> region id pressed on down, or 'touch'
    this.toasts = [];
    this.padState = { buttons: [], axes: [0, 0], repeatAt: 0 };
    this.time = performance.now();
    this.bindEvents();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  get top() { return this.stack.at(-1) ?? null; }
  get modal() { return !!this.top?.modal; }

  push(screen) { this.stack.push(screen); this.resetFocus(); this.touch?.releaseAll(); screen.enter?.(this); }
  pop() { const screen = this.stack.pop(); screen?.leave?.(this); this.resetFocus(); return screen; }
  replace(...screens) { for (const s of this.stack) s.leave?.(this); this.stack = []; for (const s of screens) this.push(s); }
  remove(screen) { const i = this.stack.indexOf(screen); if (i >= 0) { this.stack.splice(i, 1); screen.leave?.(this); this.resetFocus(); } }
  has(screen) { return this.stack.includes(screen); }
  resetFocus() { this.focusId = null; }

  toast(text, seconds = 3.6) { this.toasts.push({ text, until: performance.now() + seconds * 1000, born: performance.now() }); if (this.toasts.length > 3) this.toasts.shift(); }

  // ---------- regions ----------
  // rect: {x,y,w,h} or circle: {cx,cy,r}. Options: onPress (activate on
  // release inside), onDown (activate on contact, for in-game buttons),
  // focusable (keyboard/gamepad), disabled.
  region(id, shape, options = {}) {
    this.nextRegions.push({ id, shape, focusable: options.focusable ?? !!options.onPress, ...options });
    return { focused: this.focusVisible && this.focusId === id, pressed: [...this.pointers.values()].includes(id) || this.keyPressed === id };
  }

  hit(x, y) {
    for (let i = this.regions.length - 1; i >= 0; i--) {
      const r = this.regions[i], s = r.shape;
      if (r.disabled) continue;
      const inside = s.r !== undefined ? Math.hypot(x - s.cx, y - s.cy) <= s.r : x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
      if (inside) return r;
    }
    return null;
  }

  activate(region) {
    if (!region || region.disabled) return;
    if (region.onPress) region.onPress();
    else if (region.onDown && !region.onDrag) region.onDown();
  }

  // ---------- input ----------
  bindEvents() {
    const point = e => { const b = this.canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    this.canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      const [x, y] = point(e);
      this.focusVisible = false;
      const region = this.hit(x, y);
      if (region) {
        try { this.canvas.setPointerCapture(e.pointerId); } catch {}
        this.pointers.set(e.pointerId, region.id);
        region.onDown?.(x, y);
        return;
      }
      if (!this.modal && this.touch?.down(e.pointerId, x, y)) { this.pointers.set(e.pointerId, 'touch'); try { this.canvas.setPointerCapture(e.pointerId); } catch {} }
    });
    this.canvas.addEventListener('pointermove', e => {
      const owner = this.pointers.get(e.pointerId);
      if (owner === undefined) return;
      const [x, y] = point(e);
      if (owner === 'touch') this.touch.move(e.pointerId, x, y);
      else this.regions.find(r => r.id === owner)?.onDrag?.(x, y);
    });
    const release = (e, cancelled) => {
      const owner = this.pointers.get(e.pointerId);
      if (owner === undefined) return;
      this.pointers.delete(e.pointerId);
      if (owner === 'touch') { this.touch.up(e.pointerId); return; }
      if (cancelled) return;
      const [x, y] = point(e);
      const region = this.hit(x, y);
      if (region?.id === owner && region.onPress) region.onPress();
    };
    this.canvas.addEventListener('pointerup', e => release(e, false));
    this.canvas.addEventListener('pointercancel', e => release(e, true));
    this.canvas.addEventListener('lostpointercapture', e => { if (this.pointers.get(e.pointerId) === 'touch') release(e, true); });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', () => { this.keyPressed = null; });
  }

  // Waits for the next key ('key') or gamepad button ('button') for remapping.
  // Escape cancels a key capture unless `allowEscape`.
  startCapture(kind, resolve, { allowEscape = false } = {}) {
    this.capture = { kind, resolve, allowEscape, since: performance.now() };
    this.padState.captureBase = null;
  }
  endCapture(value) { const c = this.capture; this.capture = null; c?.resolve(value); }

  key(e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)) return;
    if (this.capture) {
      e.preventDefault(); e.stopImmediatePropagation?.();
      if (e.repeat) return;
      if (this.capture.kind === 'key') this.endCapture(e.code === 'Escape' && !this.capture.allowEscape ? null : e.code);
      else if (e.code === 'Escape') this.endCapture(null);
      return;
    }
    if (e.code === 'Backquote') { e.preventDefault(); if (!e.repeat) this.onConsoleKey?.(); return; }
    const top = this.top;
    if (!this.modal) {
      if (this.pauseKeys().includes(e.code)) { e.preventDefault(); if (!e.repeat) this.onPauseKey?.(); }
      return;
    }
    const directions = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], Tab: e.shiftKey ? [-1, 0] : [1, 0] };
    if (directions[e.code]) {
      e.preventDefault();
      const [dx, dy] = directions[e.code], region = this.focused();
      if (region?.onNudge && dy === 0 && e.code !== 'Tab') { region.onNudge(dx); return; }
      this.moveFocus(dx, dy, e.code === 'Tab');
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (e.repeat) return;
      const region = this.focused();
      if (region) { this.keyPressed = region.id; this.activate(region); }
      else { this.focusVisible = true; this.focusFirst(); }
      return;
    }
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); if (!e.repeat) top?.back?.(this); }
  }

  focusable() { return this.regions.filter(r => r.focusable && !r.disabled); }
  focused() { return this.focusVisible ? this.focusable().find(r => r.id === this.focusId) ?? null : null; }
  focusFirst() { const list = this.focusable(); const preferred = list.find(r => r.primary) ?? list[0]; this.focusId = preferred?.id ?? null; }

  centre(r) { const s = r.shape; return s.r !== undefined ? [s.cx, s.cy] : [s.x + s.w / 2, s.y + s.h / 2]; }

  moveFocus(dx, dy, sequential = false) {
    const list = this.focusable();
    if (!list.length) return;
    if (!this.focusVisible || !list.some(r => r.id === this.focusId)) { this.focusVisible = true; this.focusFirst(); return; }
    const current = list.find(r => r.id === this.focusId);
    if (sequential) { const i = list.indexOf(current); this.focusId = list[(i + (dx < 0 ? list.length - 1 : 1)) % list.length].id; return; }
    const [cx, cy] = this.centre(current);
    let best = null, bestScore = Infinity;
    for (const r of list) {
      if (r === current) continue;
      const [x, y] = this.centre(r), vx = x - cx, vy = y - cy;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = r; }
    }
    if (best) this.focusId = best.id;
  }

  pollGamepad(now) {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(p => p?.connected);
    if (!pad) { if (this.padState.id) { this.padState.id = null; this.onGamepad?.(null); } return; }
    if (this.padState.id !== pad.id) { this.padState.id = pad.id; this.onGamepad?.(pad); }
    const was = this.padState.buttons, is = pad.buttons.map(b => b.pressed);
    const edge = i => is[i] && !was[i];
    this.padState.buttons = is;
    if (this.capture) {
      // Ignore buttons already held when capture began (the one that opened it).
      this.padState.captureBase ??= is.slice();
      const pressed = is.findIndex((v, i) => v && !this.padState.captureBase[i]);
      is.forEach((v, i) => { if (!v) this.padState.captureBase[i] = false; });
      if (this.capture.kind === 'button' && pressed >= 0) this.endCapture(pressed);
      else if (this.capture.kind === 'key' && pressed >= 0 && performance.now() - this.capture.since > 250) this.endCapture(null);
      return;
    }
    // Select + Start opens the debug console.
    if (is[8] && edge(9) || is[9] && edge(8)) { this.onConsoleKey?.(); return; }
    if (this.pauseButtons().some(edge)) {
      if (this.modal) this.top?.back?.(this); else this.onPauseKey?.();
    }
    if (!this.modal) return;
    const [ax = 0, ay = 0] = pad.axes;
    const dir = is[12] || ay < -.5 ? [0, -1] : is[13] || ay > .5 ? [0, 1] : is[14] || ax < -.5 ? [-1, 0] : is[15] || ax > .5 ? [1, 0] : null;
    if (dir && now >= this.padState.repeatAt) {
      const region = this.focused();
      if (region?.onNudge && dir[1] === 0) region.onNudge(dir[0]); else this.moveFocus(...dir);
      this.padState.repeatAt = now + (this.padState.held ? 140 : 320); this.padState.held = true; }
    if (!dir) { this.padState.repeatAt = 0; this.padState.held = false; }
    if (edge(0)) { const region = this.focused(); if (region) this.activate(region); else { this.focusVisible = true; this.focusFirst(); } }
    if (edge(1)) this.top?.back?.(this);
  }

  // ---------- frame ----------
  resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.width = box.width; this.height = box.height; this.dpr = dpr;
    this.paint.setScale(dpr);
  }

  frame(now) {
    requestAnimationFrame(this.frame);
    const dt = Math.min(.1, (now - this.time) / 1000); this.time = now;
    this.resize();
    this.pollGamepad(now);
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.width, this.height);
    this.nextRegions = [];
    const top = this.top;
    for (const screen of this.stack) {
      const before = this.nextRegions.length;
      screen.draw(this, dt, now);
      // Only the top screen is interactive; lower screens just render.
      if (screen !== top) this.nextRegions.length = before;
    }
    this.drawToasts(now);
    this.regions = this.nextRegions;
    if (this.focusVisible && !this.focusable().some(r => r.id === this.focusId)) this.focusFirst();
  }

  drawToasts(now) {
    this.toasts = this.toasts.filter(t => t.until > now);
    const p = this.paint;
    this.toasts.forEach((t, i) => {
      const fade = Math.min(1, (now - t.born) / 180, (t.until - now) / 300);
      const w = Math.min(this.width - 32, 460), x = (this.width - w) / 2, y = this.height - 90 - i * 64;
      this.ctx.save(); this.ctx.globalAlpha = fade;
      p.panel(x, y, w, 50, { r: 16, grad: [C.dusk, C.night], ink: 3.5, shadow: 4 });
      p.body(t.text, this.width / 2, y + 25, { size: 14, align: 'center', color: C.cream, maxWidth: w - 28 });
      this.ctx.restore();
    });
  }
}
