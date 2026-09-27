import { readSave, writeSave, normalizeSave, UPGRADE_DEFS, upgradeCost, purchaseUpgrade, settleRun, checkpointRun, recordScore, getHighScores } from './progression.js';
import { MenuScreen } from './ui/screens/menu.js';
import { HudScreen } from './ui/screens/hud.js';
import { PauseScreen, DefeatScreen, CompleteScreen, LoadingScreen } from './ui/screens/overlays.js';
import { WorkshopScreen, ScoresScreen, SettingsScreen, AboutScreen } from './ui/screens/sheets.js';

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
    this.applySettings();
  }

  // ---------- derived ----------
  get checkpointLabel() { const part = this.save.checkpoint?.part; return part ? `· ${PART_NAMES[part] ?? ''}`.toUpperCase() : ''; }
  coarsePointer() { return this.coarse.matches; }
  touchVisible() { const t = this.save.settings.touch; return t === 'on' || (t === 'auto' && this.coarse.matches); }
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
  setHero(hero) { this.hero = hero; }
  setPlayers(players) { this.players = players; }
  setSetting(key, value) { this.save.settings[key] = value; this.persist(); this.applySettings(); }
  applySettings() {
    const s = this.save.settings;
    this.renderer.mode = s.graphics; this.renderer.present();
    this.renderer.reducedMotion = s.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.input.setAutoFire(s.autoFire);
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
      this.engine.start({ mode: this.mode, player: this.hero, part: checkpoint?.part ?? 0, upgrades: this.save.upgrades, players: this.players });
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

  togglePause() { if (this.paused) this.resume(); else this.pause(); }

  quit() {
    this.startAttempt++;
    this.engine.stop(); this.input.enable(false); this.touch.releaseAll();
    this.playing = false; this.paused = false; this.ended = false;
    this.gameCanvas.style.cssText = '';
    this.showTitle();
  }

  retry() { this.ui.replace(this.hud); this.start(true); }

  // ---------- engine callbacks ----------
  onState(state) {
    const previousPart = this.state.part, wasGameplay = this.state.inGame && this.state.frameIsGameplay;
    this.state = state;
    const gameplay = state.inGame && state.frameIsGameplay;
    if (gameplay && (!wasGameplay || state.part !== previousPart) && PART_NAMES[state.part] && PART_NAMES[state.part] !== 'Briefing' && state.part !== this.bannerPart) {
      this.bannerPart = state.part; this.hud.showBanner(PART_NAMES[state.part]);
    }
  }

  onCheckpoint(state) {
    if (this.mode !== 'roguelite') return;
    checkpointRun(this.save, { ...state, part: state.part ?? 0, player: this.hero, players: this.players, mode: this.mode, runId: this.runId });
    this.persist();
    this.ui.toast('Checkpoint saved.');
  }

  onDeath(state) {
    recordScore(this.save, { ...state, id: this.runId, mode: this.mode, player: this.hero, resumed: this.resumed });
    const gained = settleRun(this.save, { ...state, id: this.runId, mode: this.mode });
    this.persist();
    this.end();
    const reward = this.mode === 'roguelite' ? `You earned ${gained} shards. Your checkpoint and upgrades are safe.` : 'Ready for another try?';
    this.ui.push(new DefeatScreen(this, { reward, score: state.score ?? 0 }));
  }

  onComplete(state) {
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

