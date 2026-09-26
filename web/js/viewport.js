// The world keeps its authored vertical scale; the camera shows more or less
// horizontal world as the available play area changes. Display pixels are a
// separate budget, so a high-DPI phone never enlarges the native simulation.
export function measureViewport(cssWidth, cssHeight, devicePixelRatio = 1) {
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) || cssWidth <= 0 || cssHeight <= 0) return null;
  const requestedDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const dpr = Math.min(requestedDpr, 2, Math.sqrt(3_000_000 / (cssWidth * cssHeight)));
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.floor(cssWidth * dpr)),
    pixelHeight: Math.max(1, Math.floor(cssHeight * dpr)),
    dpr,
    nativeWidth: Math.max(240, Math.min(2560, Math.round(cssWidth / cssHeight * 480))),
    nativeHeight: 480,
  };
}

// Authored cinematics retain their composition. Gameplay normally matches the
// display aspect already. A uniform fit also handles its one-pixel rounding
// difference and the transient frame while a native resize is being applied.
export function fitFrame(frameWidth, frameHeight, displayWidth, displayHeight) {
  const scale = Math.min(displayWidth / frameWidth, displayHeight / frameHeight);
  const width = frameWidth * scale, height = frameHeight * scale;
  return { x: (displayWidth - width) / 2, y: (displayHeight - height) / 2, width, height, scale };
}
