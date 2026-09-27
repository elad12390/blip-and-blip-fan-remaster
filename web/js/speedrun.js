// Speedrun timing: in-game time (excluding pauses), per-stage splits, personal
// bests and best segments ("golds"), stored per category in the save.
export const SPLIT_PARTS = [1, 3, 5, 7, 9, 10, 12, 13, 15, 17, 19, 21];
export const SPLIT_NAMES = { 1: 'Smurf Village I', 3: 'Smurf Village II', 5: 'Duck Hunt', 7: 'Care Bears I', 9: 'Care Bears II', 10: 'Care Bears III', 12: 'Snorks I', 13: 'Snorks II', 15: 'Lemmings', 17: 'Video Game World', 19: 'Mario and Luigi', 21: 'The Final Battle' };
const DIFFICULTY = ['Easy', 'Normal', 'Hard', 'Insane'];

export const categoryKey = ({ mode, difficulty, players }) => `${mode}|${difficulty}|${players}`;
export function categoryName(key) {
  const [mode, difficulty, players] = key.split('|');
  return `${mode === 'roguelite' ? 'Roguelite' : 'Classic'} · ${DIFFICULTY[difficulty] ?? '?'}${players === '2' ? ' · Co-op' : ''}`;
}

export function formatTime(ms, { sign = false, tenths = true } = {}) {
  if (!Number.isFinite(ms)) return '—';
  const negative = ms < 0, t = Math.abs(ms);
  const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, d = Math.floor(t / 100) % 10;
  const body = `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}${tenths ? `.${d}` : ''}`;
  return `${negative ? '-' : sign ? '+' : ''}${body}`;
}

export function normalizeSpeedrun(raw) {
  const out = { pbs: {}, golds: {} };
  if (!raw || typeof raw !== 'object') return out;
  const valid = n => Number.isFinite(n) && n > 0 && n < 360000000;
  for (const [key, pb] of Object.entries(raw.pbs ?? {})) {
    if (!/^(original|roguelite)\|[0-3]\|[12]$/.test(key) || !valid(pb?.total) || !Array.isArray(pb.splits)) continue;
    const splits = pb.splits.filter(s => SPLIT_PARTS.includes(s?.part) && valid(s.time));
    out.pbs[key] = { total: pb.total, splits, date: typeof pb.date === 'string' ? pb.date.slice(0, 32) : '' };
  }
  for (const [key, golds] of Object.entries(raw.golds ?? {})) {
    if (!/^(original|roguelite)\|[0-3]\|[12]$/.test(key) || !golds || typeof golds !== 'object') continue;
    out.golds[key] = Object.fromEntries(Object.entries(golds).filter(([p, t]) => SPLIT_PARTS.includes(Number(p)) && valid(t)));
  }
  return out;
}

// One run. `now` is a millisecond clock supplied by the caller.
export class SpeedrunTimer {
  constructor({ category, pb = null, golds = {}, now }) {
    Object.assign(this, { category, pb, golds: { ...golds } });
    this.elapsed = 0; this.runningSince = now; this.splits = []; this.segmentStart = 0;
    this.finished = false; this.invalid = null; this.newGolds = new Set();
  }
  time(now) { return this.elapsed + (this.runningSince === null ? 0 : now - this.runningSince); }
  pause(now) { if (this.runningSince !== null) { this.elapsed += now - this.runningSince; this.runningSince = null; } }
  resume(now) { if (this.runningSince === null && !this.finished) this.runningSince = now; }
  invalidate(reason) { this.invalid ??= reason; }

  // Stage `part` cleared. Returns { time, delta (vs PB split), gold }.
  split(part, now) {
    if (this.finished || !SPLIT_PARTS.includes(part) || this.splits.some(s => s.part === part)) return null;
    const time = this.time(now), segment = time - this.segmentStart;
    this.segmentStart = time;
    const pbSplit = this.pb?.splits.find(s => s.part === part);
    const best = this.golds[part];
    const gold = best === undefined || segment < best;
    if (gold) { this.golds[part] = segment; this.newGolds.add(part); }
    const entry = { part, time, segment, delta: pbSplit ? time - pbSplit.time : null, gold };
    this.splits.push(entry);
    return entry;
  }

  finish(now) {
    if (this.finished) return null;
    this.split(21, now);
    this.pause(now); this.finished = true;
    const total = this.elapsed;
    return { total, delta: this.pb ? total - this.pb.total : null, isPb: !this.invalid && (!this.pb || total < this.pb.total) };
  }

  // Updates the stored records for this category (valid runs only). Best
  // segments are kept even from runs that end early; a PB needs a finish.
  record(store, date) {
    if (this.invalid) return store;
    const next = normalizeSpeedrun(store);
    const golds = { ...(next.golds[this.category] ?? {}) };
    for (const part of this.newGolds) golds[part] = this.golds[part];
    next.golds[this.category] = golds;
    if (this.finished && (!this.pb || this.elapsed < this.pb.total)) next.pbs[this.category] = { total: this.elapsed, splits: this.splits.map(({ part, time }) => ({ part, time })), date };
    return next;
  }

  // Best possible time from here: current time + gold segments left.
  sumOfBest() {
    const golds = SPLIT_PARTS.map(p => this.golds[p]);
    return golds.every(Number.isFinite) ? golds.reduce((a, b) => a + b, 0) : null;
  }
}
