import { normalizeBindings } from './bindings.js';
import { normalizeSpeedrun } from './speedrun.js';
export const SAVE_KEY = 'blip-blop.browser.v1';
export const PLAYABLE_PARTS = [1,3,5,7,9,10,12,13,15,17,19,21];
export const HIGH_SCORE_LIMIT = 10;
const SCORE_MODES = ['original', 'roguelite'];
const SCORE_HISTORY_LIMIT = 256;
const validRunId = id => typeof id === 'string' && id.length > 0 && id.length <= 160;
const validScore = score => Number.isSafeInteger(score) && score >= 0;

export function scoreName(name, player = 0) {
  const clean = typeof name === 'string'
    ? name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, '').trim()
    : '';
  return Array.from(clean).slice(0, 24).join('') || (player === 1 ? 'Blop' : 'Blip');
}

function normalizeScoreEntry(raw, mode) {
  if (!raw || !validRunId(raw.id) || !validScore(raw.score) || raw.resumed === true) return null;
  if (raw.mode !== undefined && raw.mode !== mode) return null;
  const player = raw.player === 1 ? 1 : 0;
  const date = typeof raw.recordedAt === 'string' ? Date.parse(raw.recordedAt) : NaN;
  return {
    id: raw.id, mode, score: raw.score, name: scoreName(raw.name, player), player,
    players: raw.players === 2 ? 2 : 1, completed: raw.completed === true,
    recordedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
  };
}

function compareScores(a, b) {
  return b.score - a.score || (a.recordedAt ?? '').localeCompare(b.recordedAt ?? '') || a.id.localeCompare(b.id);
}
export const UPGRADE_DEFS = [
  { id: 'armor', name: 'Second skin', description: 'One extra hit point per rank.', max: 3, baseCost: 12 },
  { id: 'firepower', name: 'Hot barrel', description: '10% more weapon damage per rank.', max: 5, baseCost: 15 },
  { id: 'supply', name: 'Care package', description: 'An extra cow bomb at the start of each level.', max: 3, baseCost: 18 },
];
export function freshSave() {
  return { version: 1, shards: 0, upgrades: { armor: 0, firepower: 0, supply: 0 }, deaths: 0, bestScore: 0, checkpoint: null, settledRuns: [], highScores: { original: [], roguelite: [] }, scoredRuns: { original: [], roguelite: [] }, difficulty: 1, bindings: normalizeBindings(null), speedrun: normalizeSpeedrun(null), settings: { graphics: 'enhanced', volume: 0.65, touch: 'auto', reducedMotion: false, handedness: 'right', controlSize: 'comfortable', joystick: 'floating', autoFire: false, speedrunTimer: false }, mode: 'original' };
}
export function normalizeSave(raw) {
  const out = freshSave();
  if (!raw || raw.version !== 1) return out;
  for (const name of ['shards', 'deaths', 'bestScore']) out[name] = Number.isFinite(Number(raw[name])) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(raw[name]) || 0))) : 0;
  for (const def of UPGRADE_DEFS) out.upgrades[def.id] = Math.min(def.max, Math.max(0, Math.floor(Number(raw.upgrades?.[def.id]) || 0)));
  out.settledRuns = Array.isArray(raw.settledRuns) ? raw.settledRuns.filter(x => typeof x === 'string').slice(-128) : [];
  for (const mode of SCORE_MODES) {
    const entries = Array.isArray(raw.highScores?.[mode]) ? raw.highScores[mode] : [];
    const unique = new Map();
    for (const rawEntry of entries) {
      const entry = normalizeScoreEntry(rawEntry, mode);
      if (entry && (!unique.has(entry.id) || entry.score > unique.get(entry.id).score)) unique.set(entry.id, entry);
    }
    out.highScores[mode] = [...unique.values()].sort(compareScores).slice(0, HIGH_SCORE_LIMIT);
    const history = Array.isArray(raw.scoredRuns?.[mode]) ? raw.scoredRuns[mode].filter(validRunId) : [];
    out.scoredRuns[mode] = [...new Set([...history, ...unique.keys()])].slice(-SCORE_HISTORY_LIMIT);
  }
  if (raw.checkpoint && PLAYABLE_PARTS.includes(raw.checkpoint.part) && raw.checkpoint.mode === 'roguelite') out.checkpoint = { part:raw.checkpoint.part,mode:'roguelite',player:raw.checkpoint.player===1?1:0,players:raw.checkpoint.players===2?2:1,savedAt:typeof raw.checkpoint.savedAt==='string'?raw.checkpoint.savedAt:null };
  out.mode = raw.mode === 'roguelite' ? 'roguelite' : 'original';
  if (['original', 'enhanced', 'depth'].includes(raw.settings?.graphics)) out.settings.graphics = raw.settings.graphics;
  if (Number.isFinite(raw.settings?.volume)) out.settings.volume = Math.max(0, Math.min(1, raw.settings.volume));
  if (['auto', 'on', 'off'].includes(raw.settings?.touch)) out.settings.touch = raw.settings.touch;
  if (['left', 'right'].includes(raw.settings?.handedness)) out.settings.handedness = raw.settings.handedness;
  if (['comfortable', 'large'].includes(raw.settings?.controlSize)) out.settings.controlSize = raw.settings.controlSize;
  if (['floating', 'fixed'].includes(raw.settings?.joystick)) out.settings.joystick = raw.settings.joystick;
  out.settings.autoFire = raw.settings?.autoFire === true;
  if ([0, 1, 2, 3].includes(raw.difficulty)) out.difficulty = raw.difficulty;
  out.bindings = normalizeBindings(raw.bindings);
  out.speedrun = normalizeSpeedrun(raw.speedrun);
  out.settings.speedrunTimer = raw.settings?.speedrunTimer === true;
  out.settings.reducedMotion = raw.settings?.reducedMotion === true;
  return out;
}
export function upgradeCost(save, id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  return def ? def.baseCost * (save.upgrades[id] + 1) : Infinity;
}
export function purchaseUpgrade(save, id) {
  const def = UPGRADE_DEFS.find(d => d.id === id);
  if (!def || save.upgrades[id] >= def.max || save.shards < upgradeCost(save, id)) return false;
  save.shards -= upgradeCost(save, id);
  save.upgrades[id]++;
  return true;
}
export function settleRun(save, { id, mode, score = 0, kills = 0, completed = false }) {
  if (mode !== 'roguelite' || !id || save.settledRuns.includes(id)) return 0;
  const reward = Math.max(3, Math.floor(Math.max(0, score) / 1000) + Math.floor(Math.max(0, kills) / 5) + (completed ? 25 : 0));
  save.shards += reward;
  save.bestScore = Math.max(save.bestScore, score);
  if (!completed) save.deaths++;
  save.settledRuns.push(id);
  save.settledRuns = save.settledRuns.slice(-128);
  return reward;
}
export function checkpointRun(save, checkpoint) {
  if (checkpoint.mode !== 'roguelite' || !PLAYABLE_PARTS.includes(checkpoint.part)) return false;
  save.checkpoint = { ...checkpoint, savedAt: new Date().toISOString() };
  return true;
}

// Call once for the terminal outcome of a run, using the native absolute score.
// Checkpoint starts are deliberately unranked: replaying a late stage cannot
// become a competing full-campaign score or add a saved score a second time.
export function recordScore(save, { id, mode, score, name, player = 0, players = 1, completed = false, resumed = false }) {
  if (!SCORE_MODES.includes(mode) || !validRunId(id) || !validScore(score)) {
    return { accepted: false, rank: null, reason: 'invalid' };
  }
  if (resumed) return { accepted: false, rank: null, reason: 'checkpoint' };
  save.highScores ??= { original: [], roguelite: [] };
  save.scoredRuns ??= { original: [], roguelite: [] };
  save.highScores[mode] ??= [];
  save.scoredRuns[mode] ??= [];
  if (save.scoredRuns[mode].includes(id) || save.highScores[mode].some(entry => entry.id === id)) {
    return { accepted: false, rank: null, reason: 'duplicate' };
  }
  const entry = normalizeScoreEntry({ id, mode, score, name, player, players, completed, recordedAt: new Date().toISOString() }, mode);
  save.highScores[mode].push(entry);
  save.highScores[mode].sort(compareScores);
  save.highScores[mode] = save.highScores[mode].slice(0, HIGH_SCORE_LIMIT);
  save.scoredRuns[mode].push(id);
  save.scoredRuns[mode] = save.scoredRuns[mode].slice(-SCORE_HISTORY_LIMIT);
  const index = save.highScores[mode].findIndex(item => item.id === id);
  return { accepted: true, rank: index < 0 ? null : index + 1, entry: { ...entry } };
}

export function getHighScores(save, mode) {
  if (!SCORE_MODES.includes(mode)) return [];
  return (save.highScores?.[mode] ?? []).map(entry => ({ ...entry }));
}
export function readSave(storage) {
  try { return normalizeSave(JSON.parse((storage??globalThis.localStorage).getItem(SAVE_KEY))); } catch { return freshSave(); }
}
export function writeSave(save, storage) {
  try { (storage??globalThis.localStorage).setItem(SAVE_KEY, JSON.stringify(save)); return true; } catch { return false; }
}
