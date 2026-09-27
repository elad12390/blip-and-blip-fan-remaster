// Seek-and-destroy autopilot for testing: continues dialogue, walks right,
// turns toward the nearest enemy, aims up at high ones, jumps when blocked or
// close. Pure decision function; the caller feeds it state and sends the bits.
export function createAutopilot() {
  return { tick: 0, lastX: null, stuck: 0, watch: null, ignored: new Map() };
}

export function autopilotStep(memory, state, world) {
  const m = memory; m.tick++;
  if (!(state.inGame && state.frameIsGameplay) || state.dialogue) return m.tick % 2 ? 128 : 0;
  if (!world) return 2 | 16;
  const hero = world.players?.[0];
  const heroX = hero?.x ?? (state.x + (state.cameraX ?? world.offset)), heroY = hero?.y ?? state.y;
  const inWindow = e => e.pv > 0 && e.x > world.offset - 60 && e.x < world.offset + world.scrW + 60 && e.y > -60 && e.y < 530;
  // Ordinary enemies first; otherwise scripted objects that take hits (for
  // example the weight that must be shot onto Lara). Spikes (1 hp) are ignored.
  // Targets that take no damage for a while (like Lara, who can only be beaten
  // by the falling weight) are skipped for a time.
  const key = e => `${e.type}@${e.i}`;
  for (const [k, until] of m.ignored) if (until < m.tick) m.ignored.delete(k);
  const usable = e => inWindow(e) && !m.ignored.has(key(e));
  let live = world.enemies.filter(e => e.count && usable(e));
  if (!live.length) live = world.enemies.filter(e => !e.count && e.pv > 1 && usable(e));
  let bits = 16;
  if (live.length) {
    live.sort((a, b) => Math.abs(a.x - heroX) - Math.abs(b.x - heroX));
    const t = live[0];
    if (m.watch?.key !== key(t) || t.pv < m.watch.pv) m.watch = { key: key(t), pv: t.pv, since: m.tick };
    else if (m.tick - m.watch.since > 150) { m.ignored.set(key(t), m.tick + 600); m.watch = null; }
    const dx = t.x - heroX, dir = dx < 0 ? 1 : 2, above = t.y < heroY - 90;
    if (above && !t.count) {
      // Scripted objects that must be pushed (the Lara weight moves only when
      // hit from the left): stand left of it, jump, fire diagonally up-right.
      const want = Math.max(world.offset + 30, t.x - Math.max(60, heroY - 170 - t.y));
      if (heroX < want - 12) bits |= 2; else if (heroX > want + 12) bits |= 1; else bits |= 2 | 4;
      if (Math.abs(heroX - want) <= 12 && m.tick % 14 < 2) bits |= 32;
    } else {
      // Shots aimed up go straight up: stand under high targets.
      if (Math.abs(dx) > (above ? 24 : 220) || (!above && m.tick % 6 === 0)) bits |= dir;
      if (above) bits |= 4;
    }
    if (Math.abs(dx) < 40 && Math.abs(t.y - heroY) < 60 && m.tick % 10 < 3) bits |= 32;
  } else bits |= 2;
  if (m.lastX !== null && Math.abs(heroX - m.lastX) < 1 && (bits & 3)) m.stuck++; else m.stuck = 0;
  if (m.stuck > 8 && m.tick % 12 < 4) bits |= 32;
  if (m.tick % 300 === 0) bits |= 64;
  m.lastX = heroX;
  return bits;
}
