// World framing. Levels are 480 world units tall. Small screens zoom in so the
// heroes stay readable (showing fewer units vertically, with a camera that
// follows the hero); the play window width then follows the screen shape.
export const WORLD_HEIGHT = 480;
export const MIN_PLAY_WIDTH = 240, MAX_PLAY_WIDTH = 1600;
const MIN_CSS_PER_UNIT = 1.1, COMFORT_WIDTH = 420, MIN_VISIBLE_HEIGHT = 280;

export function worldView(cssWidth, cssHeight) {
  const aspect = cssWidth / cssHeight;
  let height = Math.min(WORLD_HEIGHT, cssHeight / MIN_CSS_PER_UNIT);
  // Prefer seeing enough of the level ahead over extra zoom on squat screens.
  height = Math.max(height, Math.min(WORLD_HEIGHT, COMFORT_WIDTH / aspect), MIN_VISIBLE_HEIGHT);
  height = Math.min(height, WORLD_HEIGHT);
  const width = Math.max(MIN_PLAY_WIDTH, Math.min(MAX_PLAY_WIDTH, Math.round(aspect * height)));
  return { width, height };
}

// Display pixels are a separate budget, so a high-DPI phone never enlarges the
// native simulation.
export function measureViewport(cssWidth, cssHeight, devicePixelRatio = 1) {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) return null;
  const requestedDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const dpr = Math.min(requestedDpr, 2, Math.sqrt(3_000_000 / (cssWidth * cssHeight)));
  const view = worldView(cssWidth, cssHeight);
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.floor(cssWidth * dpr)),
    pixelHeight: Math.max(1, Math.floor(cssHeight * dpr)),
    dpr,
    nativeWidth: view.width,
    nativeHeight: WORLD_HEIGHT,
    visibleHeight: view.height,
  };
}

// Authored story screens keep their composition with a uniform fit.
export function fitFrame(frameWidth, frameHeight, displayWidth, displayHeight) {
  const scale = Math.min(displayWidth / frameWidth, displayHeight / frameHeight);
  const width = frameWidth * scale, height = frameHeight * scale;
  return { x: (displayWidth - width) / 2, y: (displayHeight - height) / 2, width, height, scale };
}

// Gameplay framing for a native frame `frameWidth` world units wide: fill the
// display width, and show a vertical slice when that is shorter than the level.
// When that would exceed the level (a locked 640 arena on a phone in
// portrait), the whole level height is shown centred, still filling the width.
export function gameplayView(frameWidth, displayWidth, displayHeight) {
  const scale = displayWidth / frameWidth;
  const visibleHeight = Math.min(WORLD_HEIGHT, displayHeight / scale);
  const width = frameWidth * scale, height = visibleHeight * scale;
  return { scale, visibleHeight, x: (displayWidth - width) / 2, y: (displayHeight - height) / 2, width, height, maxCameraY: WORLD_HEIGHT - visibleHeight };
}

// Keeps the hero's feet in the lower part of the view with frame-rate
// independent smoothing; `previous` undefined snaps.
export function followCameraY(previous, heroY, view, dt) {
  const target = Math.min(view.maxCameraY, Math.max(0, heroY - view.visibleHeight * 0.74));
  if (previous === undefined || !Number.isFinite(previous)) return target;
  const next = previous + (target - previous) * (1 - Math.exp(-Math.max(0, dt) * 7));
  return Math.min(view.maxCameraY, Math.max(0, next));
}
