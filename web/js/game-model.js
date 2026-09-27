import { readSave, writeSave, normalizeSave, UPGRADE_DEFS, upgradeCost, purchaseUpgrade, settleRun, checkpointRun, recordScore, getHighScores } from './progression.js';
import { MenuScreen } from './ui/screens/menu.js';
import { HudScreen } from './ui/screens/hud.js';
import { PauseScreen, DefeatScreen, CompleteScreen, LoadingScreen } from './ui/screens/overlays.js';
import { WorkshopScreen, ScoresScreen, SettingsScreen, AboutScreen } from './ui/screens/sheets.js';
import { bind, bindCoop, DEFAULT_BINDINGS, clone } from './bindings.js';
import { ConsoleScreen } from './ui/screens/console.js';
import { createAutopilot, autopilotStep } from './autopilot.js';
import { execute } from './debug-commands.js';
import { SpeedrunTimer, SPLIT_PARTS, categoryKey } from './speedrun.js';

const PART_NAMES = ['Briefing', 'Smurf Village I', 'Briefing', 'Smurf Village II', 'Briefing', 'Duck Hunt', 'Briefing', 'Care Bears I', 'Briefing', 'Care Bears II', 'Care Bears III', 'Briefing', 'Snorks I', 'Snorks II', 'Briefing', 'Lemmings', 'Briefing', 'Video Game World', 'Briefing', 'Mario and Luigi', 'Briefing', 'The Final Battle'];
const newRunId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

// Everything the interface reads and every action it can take. Screens never
// touch the engine or storage directly.
export class GameModel {
  constructor({ engine, renderer, input, touch, ui, gameCanvas }) {
    Object.assign(this, { engine, renderer, input, touch, ui, gameCanvas });
    this.save = readSave();
    this.mode = this.save.mode;
    this.hero = 0; this.players = 1;
    this.state = {};
    this.playing = false; this.paused = false; this.ended = false;
    this.upgradeDefs = UPGRADE_DEFS;
    this.coarse = matchMedia('(any-pointer: coarse)');
    this.coarse.addEventListener('change', () => this.touch.releaseAll());
    this.startAttempt = 0;
    this.menu = new MenuScreen(this);
    this.hud = new HudScreen(this, touch);
    this.loading = new LoadingScreen(this);
    this.engineLog = [];
    this.showFps = false; this.showOverlay = false; this.autopilot = null;
    this.applySettings();
  }

  // ---------- debug console ----------
  log(message) { this.engineLog.push(message); if (this.engineLog.length > 200) this.engineLog.shift(); }

  toggleConsole() { if (this.console && this.ui.has(this.console)) this.closeConsole(); else this.openConsole(); }
  openConsole() {
    this.console ??= new ConsoleScreen(this, document.querySelector('#console-input'));
    if (this.ui.has(this.console)) return;
    // The world freezes while the console is open, without the pause menu.
    this.consolePaused = this.playing && !this.paused && !this.ended;
    if (this.consolePaused) { this.paused = true; this.input.enable(false); this.touch.releaseAll(); this.engine.pause(true); }
    this.ui.push(this.console);
  }
  closeConsole() {
    if (!this.console || !this.ui.has(this.console)) return;
    this.ui.remove(this.console);
    if (this.consolePaused && this.playing && !this.ended) { this.paused = false; this.engine.pause(false); this.input.enable(true); this.gameCanvas.focus(); }
    this.consolePaused = false;
  }

  debugWorld() { const m = this.engine.module; return m && this.state.inGame ? JSON.parse(m.UTF8ToString(m._bb_debug_world_json())) : null; }

  setAutoplay(on) {
    clearInterval(this.autopilot?.timer);
    this.autopilot = null;
    this.input.clear('autopilot');
    if (!on) return;
    const memory = createAutopilot();
    this.autopilot = { memory, timer: setInterval(() => {
      if (!this.playing || this.paused || this.ended) return;
      let world = null;
      try { world = this.state.inGame && this.state.frameIsGameplay ? this.debugWorld() : null; } catch {}
      this.input.set('autopilot', autopilotStep(memory, this.state, world));
    }, 40) };
  }

  // Scripting entry point for tests and the browser devtools console:
  // blipBlop.debug.run('test 16') returns the printed lines.
  // ---------- speedrun ----------
  get speedrunCategory() { return categoryKey({ mode: this.mode, difficulty: this.save.difficulty, players: this.players }); }

  startSpeedrun(resumed) {
    const category = this.speedrunCategory;
    this.speedrun = new SpeedrunTimer({ category, pb: this.save.speedrun.pbs[category] ?? null, golds: this.save.speedrun.golds[category] ?? {}, now: performance.now() });
    if (resumed) this.speedrun.invalidate('continued from a checkpoint');
    this.lastSplit = null;
  }

  invalidateSpeedrun(reason) { this.speedrun?.invalidate(reason); }

  // Called every interface frame: the clock only runs during live play (not
  // paused, not in menus, not after the run ended, not while downloading).
  tickSpeedrun(now) {
    const run = this.speedrun;
    if (!run || run.finished) return;
    if (this.playing && !this.paused && !this.ended && this.engine.ready && !document.hidden) run.resume(now); else run.pause(now);
    if (this.state.cheated) run.invalidate('cheats were used');
  }

  splitSpeedrun(part) {
    const entry = this.speedrun?.split(part, performance.now());
    if (entry) this.lastSplit = { ...entry, shownAt: performance.now() };
  }

  saveSpeedrun() {
    if (!this.speedrun || this.speedrun.invalid) return;
    this.save.speedrun = this.speedrun.record(this.save.speedrun, new Date().toISOString().slice(0, 10));
  }

  runDebug(line) {
    this.invalidateSpeedrun('the debug console was used');
    const lines = [];
    const screen = { clear: () => {} };
    for (const out of execute(this.debugApi(screen), line)) lines.push(out);
    return lines;
  }

  debugApi(screen) {
    const m = this.engine.module;
    this.invalidateSpeedrun('the debug console was used');
    return {
      speed: percent => m._bb_debug_speed(percent),
      autoplay: on => { if (on === undefined) return !!this.autopilot; this.setAutoplay(on); return on; },
      entity: (index, field, value) => { const r = m._bb_debug_entity(index, field, value); this.state = { ...this.state, cheated: true }; return r; },
      spawn: (id, x, y, dir) => m._bb_debug_spawn(id, x, y, dir),
      flag: (i, v) => m._bb_debug_flag(i, v),
      unlock: () => m._bb_debug_unlock(),
      toggleOverlay: () => (this.showOverlay = !this.showOverlay),
      speedrun: () => this.speedrun && { invalid: this.speedrun.invalid, time: this.speedrun.time(performance.now()), pb: this.speedrun.pb, splits: this.speedrun.splits },
      inGame: () => !!this.state.inGame && !!m,
      state: () => this.state,
      world: () => this.debugWorld(),
      cheat: (op, a, b) => { const result = m._bb_cheat(op, a, b); this.state = { ...this.state, cheated: true }; this.engine.refreshState?.(); return result; },
      warp: part => { this.closeConsole(); this.warp(part); },
      setDifficulty: level => { this.setDifficulty(level); this.engine.module?._bb_set_difficulty?.(level); },
      setShards: n => { this.save.shards = n; this.persist(); },
      toggleFps: () => (this.showFps = !this.showFps),
      engineLog: () => this.engineLog.slice(-40),
      clear: () => screen.clear(),
    };
  }

  warp(part) {
    if (!this.engine.ready) return;
    this.startSpeedrun(true); this.invalidateSpeedrun('warped to a stage');
    this.playing = true; this.paused = false; this.ended = false; this.resumed = true; this.runId = newRunId();
    this.ui.replace(this.hud);
    this.input.coop = this.players === 2;
    this.engine.start({ mode: this.mode, player: this.hero, part, upgrades: this.save.upgrades, players: this.players, difficulty: this.save.difficulty });
    this.engine.pause(false); this.input.enable(true); this.playStartedAt = performance.now();
  }

  // ---------- derived ----------
  get checkpointLabel() { const part = this.save.checkpoint?.part; return part ? `· ${PART_NAMES[part] ?? ''}`.toUpperCase() : ''; }
  coarsePointer() { return this.coarse.matches; }
  touchVisible() { const t = this.save.settings.touch; return t === 'on' || (t === 'auto' && this.coarse.matches && !this.gamepadActive()); }
  upgradeCost(id) { return upgradeCost(this.save, id); }
  highScores(kind) { return getHighScores(this.save, kind); }
  safeArea() {
    const css = getComputedStyle(document.documentElement);
    const read = name => parseFloat(css.getPropertyValue(name)) || 0;
    return { top: read('--safe-top'), right: read('--safe-right'), bottom: read('--safe-bottom'), left: read('--safe-left') };
  }
  get safeTop() { return this.safeArea().top; }
  get safeBottom() { return this.safeArea().bottom; }

  persist() { if (!writeSave(this.save)) this.ui.toast('Browser storage is unavailable. Export your progress from the About screen.'); }

  // ---------- settings ----------
  setMode(mode) { this.mode = mode; this.save.mode = mode; this.persist(); }
  get difficulty() { return this.save.difficulty; }
  setDifficulty(level) { this.save.difficulty = level; this.persist(); }
  get bindings() { return this.save.bindings; }
  rebind(table, action, input) {
    this.save.bindings = table === 'pad' ? bind(this.save.bindings, 'pad', action, input) : bindCoop(this.save.bindings, table, action, input);
    this.persist(); this.input.setBindings(this.save.bindings);
  }
  resetBindings(table) {
    const next = clone(this.save.bindings); next[table] = clone(DEFAULT_BINDINGS[table]);
    this.save.bindings = next; this.persist(); this.input.setBindings(next);
  }
  // A connected controller replaces touch controls in Automatic mode.
  gamepadActive() { return !!this.gamepad && this.input.lastDevice !== 'keyboard'; }
  onGamepad(pad) {
    const had = !!this.gamepad; this.gamepad = pad;
    if (pad && !had) { this.input.lastDevice = 'gamepad'; this.ui.toast('Controller connected.'); }
    else if (!pad && had) this.ui.toast('Controller disconnected.');
  }
  setHero(hero) { this.hero = hero; }
  setPlayers(players) { this.players = players; }
  setSetting(key, value) { this.save.settings[key] = value; this.persist(); this.applySettings(); }
  applySettings() {
    const s = this.save.settings;
    this.renderer.mode = s.graphics; this.renderer.present();
    this.renderer.reducedMotion = s.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.input.setAutoFire(s.autoFire);
    this.input.setBindings(this.save.bindings);
    this.touch.configure({ joystick: s.joystick, radius: s.controlSize === 'large' ? 64 : 58 });
    this.engine.volume(s.volume);
  }

  // The HUD computes the layout; the game view occupies layout.game.
  applyLayout(layout) {
    const { x, y, w, h } = layout.game, style = this.gameCanvas.style;
    style.left = `${x}px`; style.top = `${y}px`; style.width = `${w}px`; style.height = `${h}px`;
    this.touch.releaseAll();
    requestAnimationFrame(() => this.renderer.resize());
  }

  // ---------- flow ----------
  showTitle() { this.ui.replace(this.menu); }

  openWorkshop(fromDefeat = false) { this.workshopReturnsToRun = fromDefeat && this.playing; this.ui.push(new WorkshopScreen(this)); }
  openScores() { this.ui.push(new ScoresScreen(this)); }
  openSettings() { this.ui.push(new SettingsScreen(this)); }
  openAbout() { this.ui.push(new AboutScreen(this)); }

  buy(id) { if (purchaseUpgrade(this.save, id)) { this.persist(); this.ui.toast('Upgrade installed.'); } }

  async start(continueRun = false) {
    const attempt = ++this.startAttempt;
    const checkpoint = continueRun && this.mode === 'roguelite' ? this.save.checkpoint : null;
    this.resumed = !!checkpoint;
    if (checkpoint) { this.hero = checkpoint.player ?? this.hero; this.players = checkpoint.players ?? this.players; }
    this.runId = newRunId();
    this.playing = true; this.paused = false; this.ended = false;
    this.state = { inGame: false, hp: 5, maxHp: 5, lives: 5, players: this.players };
    this.ui.replace(this.hud);
    try {
      if (!this.engine.ready) { this.loading.error = null; this.ui.push(this.loading); await this.engine.load(); }
      if (attempt !== this.startAttempt || !this.playing) return;
      this.ui.remove(this.loading);
      this.input.coop = this.players === 2;
      this.startSpeedrun(!!checkpoint);
      this.engine.start({ mode: this.mode, player: this.hero, part: checkpoint?.part ?? 0, upgrades: this.save.upgrades, players: this.players, difficulty: this.save.difficulty });
      this.engine.volume(this.save.settings.volume);
      this.engine.pause(false);
      this.input.enable(true);
      this.playStartedAt = performance.now();
      this.gameCanvas.focus();
    } catch (error) {
      if (attempt === this.startAttempt && this.playing) this.fail(error);
    }
  }

  fail(error) {
    console.error(error);
    this.input.enable(false);
    this.loading.error = error?.message || 'The game engine could not start. Return to the title and try again.';
    if (!this.ui.has(this.loading)) this.ui.push(this.loading);
  }

  pause() {
    if (!this.playing || this.paused || this.ended) return;
    this.paused = true; this.input.enable(false); this.touch.releaseAll(); this.engine.pause(true);
    this.ui.push(new PauseScreen(this));
  }

  resume() {
    if (!this.playing || this.ended) return;
    while (this.ui.top && this.ui.top !== this.hud) this.ui.pop();
    this.paused = false; this.engine.pause(false); this.input.enable(true); this.gameCanvas.focus();
  }

  pressConfirm() {
    this.input.set('confirm-tap', 128);
    setTimeout(() => this.input.clear('confirm-tap'), 160);
  }

  // The engine's own dialogue skip (original Escape key, bit 256), held briefly.
  skipDialogue() {
    this.input.set('dialogue-skip', 256);
    setTimeout(() => this.input.clear('dialogue-skip'), 160);
  }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  quit() {
    this.setAutoplay(false); this.engine.module?._bb_debug_speed?.(100);
    this.startAttempt++;
    this.engine.stop(); this.input.enable(false); this.touch.releaseAll();
    this.playing = false; this.paused = false; this.ended = false;
    if (this.speedrun && !this.speedrun.finished) { this.saveSpeedrun(); this.persist(); }
    this.speedrun = null;
    this.gameCanvas.style.cssText = '';
    this.showTitle();
  }

  retry() { this.ui.replace(this.hud); this.start(true); }

  // ---------- engine callbacks ----------
  onState(state) {
    const previousPart = this.state.part, wasGameplay = this.state.inGame && this.state.frameIsGameplay;
    this.state = state;
    // A stage is cleared when the campaign moves past it.
    if (SPLIT_PARTS.includes(previousPart) && state.part !== previousPart && state.part > previousPart) this.splitSpeedrun(previousPart);
    const gameplay = state.inGame && state.frameIsGameplay;
    if (gameplay && (!wasGameplay || state.part !== previousPart) && PART_NAMES[state.part] && PART_NAMES[state.part] !== 'Briefing' && state.part !== this.bannerPart) {
      this.bannerPart = state.part; this.hud.showBanner(PART_NAMES[state.part]);
    }
  }

  onCheckpoint(state) {
    if (this.mode !== 'roguelite' || state.cheated) return;
    checkpointRun(this.save, { ...state, part: state.part ?? 0, player: this.hero, players: this.players, mode: this.mode, runId: this.runId });
    this.persist();
    this.ui.toast('Checkpoint saved.');
  }

  onDeath(state) {
    this.speedrun?.pause(performance.now()); this.saveSpeedrun();
    if (state.cheated) { this.end(); this.ui.push(new DefeatScreen(this, { reward: 'Cheats were used, so this run earns no score or shards.', score: state.score ?? 0 })); return; }
    recordScore(this.save, { ...state, id: this.runId, mode: this.mode, player: this.hero, resumed: this.resumed });
    const gained = settleRun(this.save, { ...state, id: this.runId, mode: this.mode });
    this.persist();
    this.end();
    const reward = this.mode === 'roguelite' ? `You earned ${gained} shards. Your checkpoint and upgrades are safe.` : 'Ready for another try?';
    this.ui.push(new DefeatScreen(this, { reward, score: state.score ?? 0 }));
  }

  onComplete(state) {
    const result = this.speedrun?.finish(performance.now());
    if (result) { this.saveSpeedrun(); this.persist(); }
    this.speedrunResult = result ? { ...result, invalid: this.speedrun.invalid } : null;
    if (state.cheated) { this.end(); this.ui.push(new CompleteScreen(this, { message: 'You finished the campaign with cheats on. No score or shards this time.' })); return; }
    recordScore(this.save, { ...state, id: this.runId, mode: this.mode, player: this.hero, completed: true, resumed: this.resumed });
    const gained = settleRun(this.save, { ...state, id: this.runId, mode: this.mode, completed: true });
    if (this.mode === 'roguelite') this.save.checkpoint = null;
    this.persist();
    this.end();
    const message = this.mode === 'roguelite' ? `Campaign complete. You earned ${gained} shards for your next run.` : 'You made it through the original campaign. Thanks for playing.';
    this.ui.push(new CompleteScreen(this, { message }));
  }

  end() {
    this.ended = true; this.paused = true;
    this.input.enable(false); this.touch.releaseAll(); this.engine.pause(true);
  }

  onProgress(message) {
    if (!message) return;
    const match = String(message).match(/\((\d+)\/(\d+)\)/);
    if (match) {
      this.loading.progress = Number(match[1]) / Number(match[2]);
      this.loading.status = `Original game data · ${(Number(match[1]) / 1048576).toFixed(1)} / ${(Number(match[2]) / 1048576).toFixed(1)} MiB`;
    } else this.loading.status = message;
  }

  // ---------- saves ----------
  exportSave() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(this.save, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'blip-blop-save.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  importSave() {
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = 'application/json';
    picker.onchange = async () => {
      try {
        const file = picker.files[0];
        if (!file) return;
        if (file.size > 1_000_000) throw Error('File too large');
        const raw = JSON.parse(await file.text());
        if (raw.version !== 1) throw Error('Unsupported save');
        this.save = normalizeSave(raw); this.mode = this.save.mode;
        this.persist(); this.applySettings();
        this.ui.toast('Progress imported.');
      } catch { this.ui.toast('That file is not a supported Blip & Blop save.'); }
    };
    picker.click();
  }

  reloadSave() { if (!this.playing) { this.save = readSave(); this.mode = this.save.mode; this.applySettings(); } }
}

