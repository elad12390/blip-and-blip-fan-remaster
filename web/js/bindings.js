// Remappable controls. Keyboard tables use KeyboardEvent.code; gamepad
// bindings use standard-mapping button indices. Movement on a gamepad always
// also works from the left stick and D-pad.
export const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'jump', 'cow', 'pause'];
export const BITS = { left: 1, right: 2, up: 4, down: 8, fire: 16, jump: 32, cow: 64 };
export const PAD_ACTIONS = ['fire', 'jump', 'cow', 'pause'];
export const LABELS = { left: 'LEFT', right: 'RIGHT', up: 'UP / AIM', down: 'DOWN', fire: 'FIRE', jump: 'JUMP', cow: 'COW BOMB', pause: 'PAUSE' };
export const TABLES = ['solo', 'coop1', 'coop2'];

export const DEFAULT_BINDINGS = Object.freeze({
  solo: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], fire: ['KeyJ', 'KeyZ'], jump: ['Space', 'KeyK'], cow: ['KeyL', 'KeyC'], pause: ['Escape', 'KeyP'] },
  coop1: { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], fire: ['KeyF'], jump: ['KeyG'], cow: ['KeyH'], pause: ['Escape'] },
  coop2: { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], fire: ['KeyJ'], jump: ['KeyK'], cow: ['KeyL'], pause: ['KeyP'] },
  pad: { fire: [2, 7], jump: [0], cow: [1], pause: [9] },
});

export const clone = bindings => JSON.parse(JSON.stringify(bindings));

// Keys that must keep their system meaning and can never be bound.
const RESERVED = new Set(['Tab', 'MetaLeft', 'MetaRight', 'F5', 'F11', 'F12']);
const validCode = code => typeof code === 'string' && /^[A-Za-z0-9]{1,24}$/.test(code) && !RESERVED.has(code);
const validButton = b => Number.isInteger(b) && b >= 0 && b <= 17;

export function normalizeBindings(raw) {
  const out = clone(DEFAULT_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  for (const table of TABLES) for (const action of ACTIONS) {
    const list = raw[table]?.[action];
    if (Array.isArray(list)) out[table][action] = [...new Set(list.filter(validCode))].slice(0, 2);
  }
  for (const action of PAD_ACTIONS) {
    const list = raw.pad?.[action];
    if (Array.isArray(list)) out.pad[action] = [...new Set(list.filter(validButton))].slice(0, 2);
  }
  // Pause must always stay reachable.
  if (!out.solo.pause.length) out.solo.pause = ['Escape'];
  if (!out.pad.pause.length) out.pad.pause = [9];
  return out;
}

// Assign `input` as the primary binding of `action`. A key or button can only
// do one thing per table: it is removed from any other action first. The
// previous primary becomes the secondary.
export function bind(bindings, table, action, input) {
  const next = clone(bindings);
  const group = next[table];
  for (const other of Object.keys(group)) group[other] = group[other].filter(v => v !== input);
  group[action] = [input, ...group[action].filter(v => v !== input)].slice(0, 2);
  return normalizeBindings(next);
}

// Co-op players share one keyboard: a key bound for P1 is taken from P2.
export function bindCoop(bindings, table, action, input) {
  let next = bind(bindings, table, action, input);
  const other = table === 'coop1' ? 'coop2' : table === 'coop2' ? 'coop1' : null;
  if (other) for (const a of ACTIONS) next[other][a] = next[other][a].filter(v => v !== input);
  return normalizeBindings(next);
}

// code -> mask bit for one keyboard table (pause excluded: the UI handles it).
export function keyMap(bindings, table) {
  const map = {};
  for (const action of ACTIONS) if (BITS[action]) for (const code of bindings[table][action]) map[code] = (map[code] ?? 0) | BITS[action];
  return map;
}

export function padMask(pad, bindings) {
  if (!pad || pad.connected === false) return 0;
  const pressed = i => !!pad.buttons[i]?.pressed;
  const [x = 0, y = 0] = pad.axes ?? [];
  let bits = 0;
  if (x < -.35 || pressed(14)) bits |= 1;
  if (x > .35 || pressed(15)) bits |= 2;
  if (y < -.35 || pressed(12)) bits |= 4;
  if (y > .35 || pressed(13)) bits |= 8;
  for (const action of ['fire', 'jump', 'cow']) if (bindings.pad[action].some(pressed)) bits |= BITS[action];
  // The primary fire or jump button also continues dialogue and cinematics
  // (a held secondary trigger must not skip story screens by accident).
  if (pressed(bindings.pad.fire[0]) || pressed(bindings.pad.jump[0])) bits |= 128;
  return bits;
}

const KEY_NAMES = { Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Backspace: 'BKSP', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' };
export function keyName(code) {
  if (!code) return '—';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `NUM ${code.slice(6).toUpperCase()}`;
  return code.toUpperCase().slice(0, 8);
}

// Standard mapping names, Xbox-style letters with PlayStation equivalents.
const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'TOUCH'];
export const buttonName = b => b === undefined ? '—' : BUTTON_NAMES[b] ?? `B${b}`;
