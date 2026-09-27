import { SAVE_KEY } from './progression.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Engine } from './engine.js';
import { loadArt } from './ui/art.js';
import { UI } from './ui/ui.js';
import { TouchController } from './ui/touch.js';
import { GameModel } from './game-model.js';

// Bootstrap: one full-screen game view with the canvas interface above it.
const gameCanvas = document.querySelector('#screen');
const uiCanvas = document.querySelector('#ui');
const renderer = new Renderer(gameCanvas);
let model = null, ui = null;

const input = new Input(mask => engine.input(mask), {
  send2: mask => engine.input2(mask),
  onFire: value => { renderer.fire = value; },
  blocked: () => !!ui?.modal,
});
const touch = new TouchController({ set: (id, bits) => input.set(id, bits), clear: id => input.clear(id) });
input.onRelease = () => touch.releaseAll();

const engine = new Engine({
  onFrame: (m, ...args) => renderer.draw(m, ...args),
  onCommands: (m, ...args) => renderer.drawCommands(m, ...args),
  onGpuForget: (m, ...args) => renderer.forgetSurfaces(m, ...args),
  gpu: () => renderer.supportsCommands,
  onProgress: message => model?.onProgress(message),
  onState: state => { renderer.state = state; model?.onState(state); },
  onCheckpoint: state => model?.onCheckpoint(state),
  onDeath: state => model?.onDeath(state),
  onComplete: state => model?.onComplete(state),
  onError: error => model?.fail(error),
});
renderer.onViewportChange = ({ nativeWidth, nativeHeight }) => engine.setViewport(nativeWidth, nativeHeight);
renderer.onContextState = status => {
  if (status === 'lost') { model?.pause(); ui?.toast('Graphics paused while your device recovers. Your run is safe.'); }
  else ui?.toast('Graphics restored.');
};

function updateAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
}
window.addEventListener('resize', updateAppHeight);
window.visualViewport?.addEventListener('resize', updateAppHeight);
updateAppHeight();

try {
  const art = await loadArt();
  ui = new UI(uiCanvas, art, {
    touch,
    onPauseKey: () => model?.togglePause(),
    pauseKeys: () => { const b = model?.bindings; if (!b) return ['Escape', 'KeyP']; return input.coop ? [...b.coop1.pause, ...b.coop2.pause] : b.solo.pause; },
    pauseButtons: () => model?.bindings?.pad.pause ?? [9],
    onGamepad: pad => model?.onGamepad(pad),
  });
  model = new GameModel({ engine, renderer, input, touch, ui, gameCanvas });
  model.showTitle();
  document.querySelector('#boot')?.remove();
} catch (error) {
  console.error(error);
  const boot = document.querySelector('#boot');
  if (boot) boot.textContent = 'The game could not load. Check your connection and reload.';
}

document.addEventListener('visibilitychange', () => { if (document.hidden) model?.pause(); });
window.addEventListener('blur', () => model?.pause());
window.addEventListener('storage', e => { if (e.key === SAVE_KEY) model?.reloadSave(); });

window.blipBlop = { engine, renderer, get ui() { return ui; }, get model() { return model; }, get state() { return model?.state ?? {}; }, get save() { return model ? structuredClone(model.save) : null; } };
