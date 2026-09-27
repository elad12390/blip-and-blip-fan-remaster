import { C } from '../paint.js';
import { iconButton } from '../components.js';
import { execute, complete } from '../../debug-commands.js';

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

// Drop-down debug console. A hidden text field receives typing so phones show
// their keyboard; the console itself is drawn on the interface canvas.
export class ConsoleScreen {
  constructor(model, input) {
    this.model = model; this.input = input; this.modal = true;
    this.lines = [{ text: 'BLIP & BLOP DEBUG CONSOLE — type "help". Cheats disable scores and shards for this run.', color: C.gold }];
    this.history = []; this.historyIndex = -1;
    this.scroll = 0;
    this.onKey = e => this.key(e);
  }

  enter() {
    this.input.value = '';
    this.input.addEventListener('keydown', this.onKey);
    setTimeout(() => this.input.focus(), 0);
  }
  leave() { this.input.removeEventListener('keydown', this.onKey); this.input.blur(); }
  back() { this.model.closeConsole(); }

  print(text, color = C.lilac) {
    for (const line of String(text).split('\n')) this.lines.push({ text: line, color });
    if (this.lines.length > 400) this.lines.splice(0, this.lines.length - 400);
    this.scroll = 0;
  }
  clear() { this.lines = []; }

  run(line) {
    if (!line.trim()) return;
    this.history.unshift(line); this.history.length = Math.min(this.history.length, 50); this.historyIndex = -1;
    this.print(`> ${line}`, C.cream);
    try { for (const out of execute(this.model.debugApi(this), line)) this.print(out); }
    catch (error) { this.print(error.message, '#ff9b7e'); }
  }

  key(e) {
    if (e.key === 'Enter') { e.preventDefault(); const line = this.input.value; this.input.value = ''; this.run(line); }
    else if (e.key === 'Escape' || e.key === '`') { e.preventDefault(); this.model.closeConsole(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.historyIndex = Math.min(this.history.length - 1, this.historyIndex + 1); this.input.value = this.history[this.historyIndex] ?? ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.historyIndex = Math.max(-1, this.historyIndex - 1); this.input.value = this.historyIndex < 0 ? '' : this.history[this.historyIndex]; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const matches = complete(this.input.value.trim());
      if (matches.length === 1) this.input.value = `${matches[0]} `;
      else if (matches.length) this.print(matches.join('  '), C.muted);
    } else if (e.key === 'PageUp') this.scroll += 8;
    else if (e.key === 'PageDown') this.scroll = Math.max(0, this.scroll - 8);
  }

  draw(ui, dt, now) {
    const p = ui.paint, g = ui.ctx;
    const h = Math.min(ui.height * .62, Math.max(260, ui.height * .5)), w = ui.width;
    g.fillStyle = '#0b0814aa'; g.fillRect(0, 0, w, ui.height);
    p.rr(-6, -20, w + 12, h + 20, 22); g.fillStyle = '#0e0b17f2'; g.fill(); g.lineWidth = 4; g.strokeStyle = C.ink; g.stroke();
    p.hazard(0, h - 6, w, 10);
    const size = w < 520 ? 11 : 13, lineH = size * 1.45, pad = 14 + (this.model.safeArea().left || 0);
    // Tapping the console focuses the text field (phones open their keyboard).
    ui.region('console-area', { x: 0, y: 0, w, h }, { onDown: () => this.input.focus(), focusable: false });
    iconButton(ui, 'console-close', w - 30, 30, 18, 'close', () => this.model.closeConsole(), { top: '#ff7b62', bottom: C.bandanaDark, color: C.cream, focusable: false });
    g.save();
    g.beginPath(); g.rect(0, 0, w - 60, h - 40); g.clip();
    g.font = `600 ${size}px ${MONO}`; g.textBaseline = 'middle';
    const visible = Math.floor((h - 60) / lineH);
    const end = Math.max(0, this.lines.length - this.scroll), start = Math.max(0, end - visible);
    this.lines.slice(start, end).forEach((line, i) => { g.fillStyle = line.color; g.fillText(line.text, pad, 16 + i * lineH); });
    g.restore();
    g.font = `700 ${size + 1}px ${MONO}`; g.textBaseline = 'middle';
    const prompt = `> ${this.input.value}`, caret = Math.floor(now / 500) % 2 ? '' : '▌';
    g.fillStyle = C.goldLight; g.fillText(prompt + caret, pad, h - 24);
  }
}
