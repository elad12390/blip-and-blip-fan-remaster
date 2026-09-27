// Multi-touch game controls drawn on the interface canvas. Pure logic: the UI
// forwards pointer events in CSS pixels and draws from `stick` / `pressed`.
//
// - The first contact inside the stick zone owns the stick until it lifts; a
//   second finger there can never steal movement or reverse aim.
// - Each action button is held by the pointers pressing it, independently, so
//   moving, firing and jumping work together.
const DIRECTIONS = [2, 2 | 8, 8, 1 | 8, 1, 1 | 4, 4, 2 | 4];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class TouchController {
  constructor({ set, clear }) {
    this.set = set; this.clear = clear;
    this.options = { joystick: 'floating', radius: 54, deadzone: .18 };
    this.zones = { stick: null, buttons: [] };
    this.stick = null;
    this.buttonPointers = new Map(); // pointer id -> button id
    this.pressed = new Set();
  }

  configure(options = {}) {
    const next = { ...this.options };
    if (options.joystick === 'fixed' || options.joystick === 'floating') next.joystick = options.joystick;
    if (Number.isFinite(options.radius)) next.radius = clamp(options.radius, 32, 90);
    if (Number.isFinite(options.deadzone)) next.deadzone = clamp(options.deadzone, .1, .4);
    const changed = next.joystick !== this.options.joystick || next.radius !== this.options.radius || next.deadzone !== this.options.deadzone;
    this.options = next;
    if (changed) this.releaseAll();
  }

  // stick: {x, y, w, h, restX, restY}; buttons: [{id, bit, x, y, r}] (circles).
  setZones(zones) {
    this.zones = { stick: zones.stick ?? null, buttons: zones.buttons ?? [] };
    // A button that disappeared (for example Continue once gameplay resumes)
    // must not stay held.
    for (const [pointer, id] of this.buttonPointers) if (!this.zones.buttons.some(b => b.id === id)) this.releasePointer(pointer);
  }

  buttonAt(x, y) {
    // Generous hit slop: thumbs land off-centre.
    return this.zones.buttons.find(b => Math.hypot(x - b.x, y - b.y) <= b.r * 1.18) ?? null;
  }

  inStickZone(x, y) {
    const z = this.zones.stick;
    return !!z && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  // Returns true when the contact belongs to the game controls.
  down(pointer, x, y) {
    if (this.buttonPointers.has(pointer) || this.stick?.pointer === pointer) return true;
    const button = this.buttonAt(x, y);
    if (button) {
      this.buttonPointers.set(pointer, button.id);
      this.set(`touch-${pointer}`, button.bit);
      this.refreshPressed();
      return true;
    }
    if (!this.inStickZone(x, y)) return false;
    if (this.stick) return true; // swallowed: the stick already has an owner
    const z = this.zones.stick, fixed = this.options.joystick === 'fixed';
    this.stick = { pointer, originX: fixed ? z.restX : x, originY: fixed ? z.restY : y, dx: 0, dy: 0, sector: null };
    this.move(pointer, x, y);
    return true;
  }

  move(pointer, x, y) {
    const stick = this.stick;
    if (!stick || stick.pointer !== pointer) return;
    const dx = x - stick.originX, dy = y - stick.originY;
    const distance = Math.hypot(dx, dy), radius = this.options.radius, deadzone = radius * this.options.deadzone;
    let bits = 0;
    // Radial and angular hysteresis keep a resting thumb from flickering
    // between neutral, a cardinal direction and a diagonal.
    if (distance > (stick.sector === null ? deadzone : deadzone * .72)) {
      const angle = Math.atan2(dy, dx), step = Math.PI / 4;
      let sector = (Math.round(angle / step) + 8) % 8;
      if (stick.sector !== null) {
        const difference = Math.atan2(Math.sin(angle - stick.sector * step), Math.cos(angle - stick.sector * step));
        if (Math.abs(difference) < step / 2 + Math.PI / 30) sector = stick.sector;
      }
      stick.sector = sector; bits = DIRECTIONS[sector];
    } else stick.sector = null;
    const scale = distance > radius ? radius / distance : 1;
    stick.dx = dx * scale; stick.dy = dy * scale;
    this.set('touch-direction', bits);
  }

  up(pointer) { this.releasePointer(pointer); }

  releasePointer(pointer) {
    if (this.buttonPointers.delete(pointer)) { this.clear(`touch-${pointer}`); this.refreshPressed(); }
    if (this.stick?.pointer === pointer) { this.stick = null; this.clear('touch-direction'); }
  }

  releaseAll() {
    for (const pointer of [...this.buttonPointers.keys()]) this.releasePointer(pointer);
    if (this.stick) this.releasePointer(this.stick.pointer);
  }

  refreshPressed() { this.pressed = new Set(this.buttonPointers.values()); }
}
