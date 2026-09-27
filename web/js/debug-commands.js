const fmt = ms => { const neg = ms < 0, t = Math.abs(ms); return `${neg ? '-' : ''}${Math.floor(t / 60000)}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${Math.floor(t / 100) % 10}`; };
// Debug console commands and cheat codes. `api` is supplied by the game model;
// every command returns lines to print (strings) or throws an Error with a
// message for the user.
export const WEAPONS = { m16: 0, shotgun: 1, smg: 2, flame: 3, flamethrower: 3, laser: 4 };
export const STAGES = { 1: 'Smurf Village I', 3: 'Smurf Village II', 5: 'Duck Hunt', 7: 'Care Bears I', 9: 'Care Bears II', 10: 'Care Bears III', 12: 'Snorks I', 13: 'Snorks II', 15: 'Lemmings', 17: 'Video Game World', 19: 'Mario and Luigi', 21: 'The Final Battle' };
const DIFFICULTIES = { easy: 0, normal: 1, hard: 2, insane: 3 };
// Enemy ids accepted by spawn (the original level-file ids).
export const ENEMIES = { smurf: 0, gourmand: 1, farceur: 2, sauvage: 3, paysan: 4, costaud: 5, smurfette: 6, stork: 7, grandsmurf: 8, pikachu: 100, bulbizarre: 101, flameche: 102, com: 103, comflying: 104, bisouciel: 200, bisouetoile: 201, bisouboom: 202, bisounuage: 203, bisouzombi: 204, chaman: 205, bisoucoeur: 206, jedi: 207, sib: 209, snorky: 300, snorky2: 301, gouverneur: 302, mage: 303, rider: 304, snorkinblack: 305, diabolo: 306, snorkboss: 307, lemming: 400, lemmingflying: 401, toad: 500, yoshi: 501, guard: 502, princess: 503, tails: 504, yoshidca: 505, knuckles: 506, rayman: 507, tailsflying: 508, luigi: 600, sonic: 601, mariotapette: 602, lara: 603, pic: 604, poid: 605, mario: 700 };
const FIELDS = { x: 0, y: 1, hp: 2, pv: 2, dir: 3, lives: 4 };
// p1, p2, or an enemy index from "entities".
const target = value => {
  if (value === 'p1' || value === 'player') return -1;
  if (value === 'p2') return -2;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw Error('Target must be p1, p2 or an enemy index (see "entities").');
  return n;
};
const CHEAT = { GOD: 1, HEALTH: 2, LIVES: 3, WEAPON: 4, COWS: 5, FINISH: 6, KILL: 7, AMMO: 8, SCORE: 9 };

const int = (value, name, min, max) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
};
const needGame = api => { if (!api.inGame()) throw Error('Start a stage first.'); };
const cheat = (api, op, a = 0, b = 0) => { needGame(api); return api.cheat(op, a, b); };

export const COMMANDS = {
  help: { usage: 'help [command]', about: 'List commands, or explain one.', run: (api, [name]) => {
    if (name) { const c = COMMANDS[name]; if (!c) throw Error(`No command "${name}".`); return [`${c.usage}  —  ${c.about}`]; }
    return ['Commands:', ...Object.entries(COMMANDS).map(([, c]) => `  ${c.usage.padEnd(28)} ${c.about}`), 'Cheat codes also work here. Try one.'];
  } },
  clear: { usage: 'clear', about: 'Clear the console.', run: api => { api.clear(); return []; } },
  state: { usage: 'state', about: 'Print the player and run state.', run: api => {
    const s = api.state();
    return [`part ${s.part} (${STAGES[s.part] ?? s.level ?? '—'})  mode ${s.mode}  difficulty ${s.difficulty}${s.cheated ? '  [cheated]' : ''}`,
      `hp ${s.hp}/${s.maxHp}  lives ${s.lives}  weapon ${Object.keys(WEAPONS)[s.weapon] ?? s.weapon} ammo ${s.ammo}  cows ${s.cows}  score ${s.score}  kills ${s.kills}`,
      `play window ${s.viewportWidth}  offset ${s.offset}  locked ${!!s.locked}  go ${!!s.go}`];
  } },
  world: { usage: 'world', about: 'Print level progress: locks, flags, spawners.', run: api => {
    needGame(api); const w = api.world();
    const kinds = {}; for (const e of w.enemies) kinds[e.type] = (kinds[e.type] ?? 0) + 1;
    return [`offset ${w.offset}/${w.levelSize - w.scrW}  window ${w.scrW}  scroll speed ${w.scrollSpeed}  hold fire ${!!w.holdFire}`,
      `locked ${!!w.locked}${w.locked ? `  at ${w.lock[0]}  until ${['all enemies dead', 'all spawners done', `flag ${w.lock[2]} = ${w.lock[3]}`, `flag ${w.lock[2]} >= ${w.lock[3]}`][w.lock[1]] ?? '?'}` : ''}`,
      `flags ${w.flags.join(' ')}`,
      `enemies ${w.enemies.length} (${Object.entries(kinds).map(([k, n]) => `${k} x${n}`).join(', ') || 'none'})`,
      `spawners ${w.gens}  events waiting ${w.waiting}  next event at ${w.nextEvent}`];
  } },
  entities: { usage: 'entities', about: 'List every enemy with index, position and health.', run: api => {
    needGame(api); const w = api.world();
    return w.enemies.length ? w.enemies.map(e => `  ${String(e.i).padStart(3)}  ${e.type.padEnd(24)} x ${e.x} y ${e.y} hp ${e.pv}${e.count ? '' : ' (scripted)'}`) : ['No enemies.'];
  } },
  god: { usage: 'god [on|off]', about: 'Ignore all damage.', run: (api, [v]) => {
    const on = v === undefined ? !api.world().god : v === 'on' || v === '1';
    cheat(api, CHEAT.GOD, on ? 1 : 0); return [`God mode ${on ? 'ON' : 'OFF'}.`];
  } },
  health: { usage: 'health <1-100>', about: 'Set health.', run: (api, [v]) => [`Health ${cheat(api, CHEAT.HEALTH, int(v, 'Health', 1, 100))}.`] },
  lives: { usage: 'lives <1-99>', about: 'Set lives.', run: (api, [v]) => [`Lives ${cheat(api, CHEAT.LIVES, int(v, 'Lives', 1, 99))}.`] },
  weapon: { usage: 'weapon <m16|shotgun|smg|flame|laser> [ammo]', about: 'Switch weapon.', run: (api, [name, ammo]) => {
    const id = WEAPONS[name?.toLowerCase()];
    if (id === undefined) throw Error('Weapon must be m16, shotgun, smg, flame or laser.');
    cheat(api, CHEAT.WEAPON, id, ammo === undefined ? 0 : int(ammo, 'Ammo', 1, 9999)); return [`Equipped ${name}.`];
  } },
  ammo: { usage: 'ammo <0-9999>', about: 'Set ammo for the current weapon.', run: (api, [v]) => [`Ammo ${cheat(api, CHEAT.AMMO, int(v, 'Ammo', 0, 9999))}.`] },
  cows: { usage: 'cows <0-99>', about: 'Set cow bombs.', run: (api, [v]) => [`Cows ${cheat(api, CHEAT.COWS, int(v, 'Cows', 0, 99))}.`] },
  score: { usage: 'score <n>', about: 'Set score.', run: (api, [v]) => [`Score ${cheat(api, CHEAT.SCORE, int(v, 'Score', 0, 99999999))}.`] },
  kill: { usage: 'kill', about: 'Kill every enemy on screen (counts for scripted fights).', run: api => [`Killed ${cheat(api, CHEAT.KILL)}.`] },
  skip: { usage: 'skip', about: 'Finish the current stage as a win.', run: api => { cheat(api, CHEAT.FINISH); return ['Stage finished.']; } },
  stages: { usage: 'stages', about: 'List stage numbers for warp.', run: () => Object.entries(STAGES).map(([part, name]) => `  ${part.padStart(2)}  ${name}`) },
  warp: { usage: 'warp <stage>', about: 'Restart the run at a stage (see stages).', run: (api, [v]) => {
    const part = int(v, 'Stage', 0, 21);
    if (!STAGES[part]) throw Error('Not a playable stage. Type "stages".');
    api.warp(part); return [`Warping to ${STAGES[part]}…`];
  } },
  difficulty: { usage: 'difficulty <easy|normal|hard|insane>', about: 'Set difficulty (applies from the next stage).', run: (api, [v]) => {
    const level = DIFFICULTIES[v?.toLowerCase()] ?? (v !== undefined && /^[0-3]$/.test(v) ? Number(v) : undefined);
    if (level === undefined) throw Error('Difficulty must be easy, normal, hard or insane.');
    api.setDifficulty(level); return [`Difficulty ${Object.keys(DIFFICULTIES)[level]}.`];
  } },
  speed: { usage: 'speed <0.25-32>', about: 'Fast-forward or slow down the whole game.', run: (api, [v]) => {
    const x = Number(v);
    if (!(x >= .25 && x <= 32)) throw Error('Speed must be between 0.25 and 32.');
    return [`Speed ${api.speed(Math.round(x * 100)) / 100}x.`];
  } },
  autoplay: { usage: 'autoplay [on|off]', about: 'Built-in bot plays: walks, fights, skips dialogue.', run: (api, [v]) => {
    const on = v === undefined ? !api.autoplay() : v === 'on' || v === '1';
    api.autoplay(on); return [`Autoplay ${on ? 'ON' : 'OFF'}.`];
  } },
  test: { usage: 'test [speed]', about: 'Test mode: god + autoplay + fast-forward (default 8x).', run: (api, [v]) => {
    if (v === 'off') { api.autoplay(false); api.speed(100); cheat(api, CHEAT.GOD, 0); return ['Test mode off.']; }
    const x = v === undefined ? 8 : Number(v);
    if (!(x >= 1 && x <= 32)) throw Error('Speed must be between 1 and 32.');
    cheat(api, CHEAT.GOD, 1); api.autoplay(true); api.speed(Math.round(x * 100));
    return [`Test mode: god, autoplay, ${x}x. Type "test off" or "speed 1" to stop.`];
  } },
  players: { usage: 'players', about: 'Print both players.', run: api => {
    needGame(api);
    return api.world().players.map((p, i) => p ? `  p${i + 1}  x ${p.x} y ${p.y} hp ${p.hp} lives ${p.lives} dir ${p.dir ? 'right' : 'left'} state ${p.state} weapon ${p.weapon} ammo ${p.ammo} invincible ${p.invincible}` : `  p${i + 1}  —`);
  } },
  entity: { usage: 'entity <index>', about: 'Every field of one enemy.', run: (api, [v]) => {
    needGame(api); const e = api.world().enemies[target(v)];
    if (!e) throw Error('No enemy with that index.');
    return Object.entries(e).map(([k, value]) => `  ${k.padEnd(6)} ${value}`);
  } },
  set: { usage: 'set <p1|p2|index> <x|y|hp|dir|lives> <value>', about: 'Change a player or enemy.', run: (api, [who, field, value]) => {
    needGame(api);
    const f = FIELDS[field?.toLowerCase()];
    if (f === undefined) throw Error('Field must be x, y, hp, dir or lives.');
    const n = Number(value);
    if (!Number.isInteger(n)) throw Error('Value must be a whole number.');
    const result = api.entity(target(who), f, n);
    if (result < 0 && f !== 3) throw Error('That target or field does not exist.');
    return [`${who}.${field} = ${result}`];
  } },
  remove: { usage: 'remove <index|all>', about: 'Delete an enemy without killing it (no kill credit).', run: (api, [v]) => {
    needGame(api);
    const list = v === 'all' ? api.world().enemies.map(e => e.i) : [target(v)];
    for (const i of list.reverse()) api.entity(i, 5, 0);
    return [`Removed ${list.length}.`];
  } },
  spawn: { usage: 'spawn <enemy> [x] [y] [left|right]', about: 'Spawn an enemy (see "enemytypes").', run: (api, [kind, x, y, dir]) => {
    needGame(api);
    const id = ENEMIES[kind?.toLowerCase()] ?? (Number.isInteger(Number(kind)) ? Number(kind) : undefined);
    if (id === undefined) throw Error('Unknown enemy. Type "enemytypes".');
    const w = api.world(), p = w.players[0];
    const px = x === undefined ? (p ? p.x + 200 : w.offset + w.scrW / 2) : int(x, 'x', 0, w.levelSize);
    const created = api.spawn(id, px, y === undefined ? (p?.y ?? 400) : int(y, 'y', 0, 479), dir === 'right' ? 1 : 0);
    if (created <= 0) throw Error('That enemy id is not valid here.');
    return [`Spawned ${kind} at ${px}.`];
  } },
  enemytypes: { usage: 'enemytypes', about: 'Enemy names for spawn.', run: () => [Object.keys(ENEMIES).join(' ')] },
  flag: { usage: 'flag <0-10> <value>', about: 'Set a level script flag.', run: (api, [i, v]) => { needGame(api); api.flag(int(i, 'Flag', 0, 10), int(v, 'Value', -99999, 99999)); return [`flag ${i} = ${v}`]; } },
  unlock: { usage: 'unlock', about: 'Release a locked fight.', run: api => { needGame(api); return [api.unlock() ? 'Fight unlocked.' : 'Nothing was locked.']; } },
  teleport: { usage: 'teleport <x>', about: 'Move player 1 (the camera follows forward).', run: (api, [x]) => { needGame(api); return [`p1.x = ${api.entity(-1, 0, int(x, 'x', 0, api.world().levelSize - 1))}`]; } },
  overlay: { usage: 'overlay', about: 'Toggle entity markers with indexes and health.', run: api => [`Entity overlay ${api.toggleOverlay() ? 'ON' : 'OFF'}.`] },
  splits: { usage: 'splits', about: 'Speedrun splits for this run and the personal best.', run: api => {
    const run = api.speedrun?.();
    if (!run) return ['No run in progress.'];
    const lines = [`${run.invalid ? `UNRANKED (${run.invalid})` : 'ranked'}  time ${fmt(run.time)}  pb ${run.pb ? fmt(run.pb.total) : '—'}`];
    for (const sp of run.splits) lines.push(`  ${String(sp.part).padStart(2)} ${fmt(sp.time)}  segment ${fmt(sp.segment)}${sp.delta === null ? '' : `  ${sp.delta <= 0 ? '' : '+'}${fmt(sp.delta)}`}${sp.gold ? '  GOLD' : ''}`);
    return lines;
  } },
  shards: { usage: 'shards <n>', about: 'Set Roguelite shards.', run: (api, [v]) => { api.setShards(int(v, 'Shards', 0, 999999)); return ['Shards updated.']; } },
  fps: { usage: 'fps', about: 'Toggle the frame-rate overlay.', run: api => [`FPS overlay ${api.toggleFps() ? 'ON' : 'OFF'}.`] },
  log: { usage: 'log', about: 'Show recent engine messages.', run: api => { const lines = api.engineLog(); return lines.length ? lines : ['No engine messages yet.']; } },
};

// Cheat codes: typed as a single word.
export const CODES = {
  iddqd: { about: 'god mode', run: api => { cheat(api, CHEAT.GOD, 1); return ['Degreelessness mode.']; } },
  idkfa: { about: 'laser, full ammo, cows, health', run: api => { cheat(api, CHEAT.WEAPON, 4, 999); cheat(api, CHEAT.COWS, 9); cheat(api, CHEAT.HEALTH, 100); return ['Very happy ammo added.']; } },
  moomoo: { about: '9 cow bombs', run: api => { cheat(api, CHEAT.COWS, 9); return ['Moooo.']; } },
  ballsofsteel: { about: 'everything', run: api => { cheat(api, CHEAT.GOD, 1); cheat(api, CHEAT.WEAPON, 4, 999); cheat(api, CHEAT.COWS, 9); cheat(api, CHEAT.LIVES, 99); return ['Balls. Of. Steel.']; } },
  smurfslayer: { about: 'kill everything on screen', run: api => [`${cheat(api, CHEAT.KILL)} blue creatures fewer.`] },
  gargamel: { about: 'skip the stage', run: api => { cheat(api, CHEAT.FINISH); return ['Gargamel waves you through.']; } },
  extralife: { about: '+5 lives', run: api => { const lives = Math.min(99, (api.state().lives ?? 1) + 5); cheat(api, CHEAT.LIVES, lives); return [`Lives ${lives}.`]; } },
};

export function execute(api, line) {
  const words = String(line).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const [name, ...args] = words, key = name.toLowerCase();
  if (CODES[key]) return CODES[key].run(api, args);
  const command = COMMANDS[key];
  if (!command) throw Error(`Unknown command "${name}". Type "help".`);
  return command.run(api, args);
}

export function complete(prefix) {
  const p = prefix.toLowerCase();
  return Object.keys(COMMANDS).filter(name => name.startsWith(p));
}
