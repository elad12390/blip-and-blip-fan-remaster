// Converts native SDL surfaces (ABGR8888: bytes R,G,B,A) into GPU texels.
// Original art is opaque; transparency comes only from the RGB colour key, as
// in SDL's colour-keyed blits. Keyed texels become premultiplied transparent.

const lum = (r, g, b) => (54 * r + 183 * g + 19 * b) >> 8;

// Inferred relief, identical to the former per-blit CPU material: sprites rise
// towards their interior, opaque scenery follows its brightness.
export function reliefMap(heap, { ptr, width, height, pitch, keyed, key }) {
  const out = new Uint8Array(width * height);
  const kr = key & 255, kg = (key >>> 8) & 255, kb = (key >>> 16) & 255;
  let transparent = false;
  const distance = keyed ? new Uint8Array(width * height).fill(12) : null;
  for (let y = 0; y < height; y++) {
    let p = ptr + y * pitch;
    for (let x = 0; x < width; x++, p += 4) {
      const r = heap[p], g = heap[p + 1], b = heap[p + 2], i = y * width + x;
      if (keyed && r === kr && g === kg && b === kb) { distance[i] = 0; transparent = true; out[i] = 0; continue; }
      out[i] = lum(r, g, b);
    }
  }
  if (!transparent) {
    for (let i = 0; i < out.length; i++) out[i] = 80 + ((out[i] * 85 / 255) | 0);
    return out;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
    if (y) distance[i] = Math.min(distance[i], distance[i - width] + 1);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (x < width - 1) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
    if (y < height - 1) distance[i] = Math.min(distance[i], distance[i + width] + 1);
  }
  for (let i = 0; i < out.length; i++) {
    if (distance[i]) out[i] = 54 + ((out[i] * 62 / 255) | 0) + Math.min(distance[i], 10) * 5;
  }
  return out;
}

// Texels for `region` in padded space: x/y may be -1 or width/height, which
// repeat the nearest edge so linear filtering never bleeds a neighbour in.
// Without a precomputed `relief`, the surface is treated as opaque scenery and
// relief is derived from each texel's brightness.
export function convertRegion(heap, surface, region, relief = null) {
  const { ptr, width, height, pitch, keyed, key } = surface;
  const kr = key & 255, kg = (key >>> 8) & 255, kb = (key >>> 16) & 255;
  const rgba = new Uint8Array(region.width * region.height * 4);
  const depth = new Uint8Array(region.width * region.height);
  let o = 0;
  for (let ry = 0; ry < region.height; ry++) {
    const sy = Math.min(height - 1, Math.max(0, region.y + ry));
    for (let rx = 0; rx < region.width; rx++, o++) {
      const sx = Math.min(width - 1, Math.max(0, region.x + rx));
      const p = ptr + sy * pitch + sx * 4, q = o * 4;
      const r = heap[p], g = heap[p + 1], b = heap[p + 2];
      if (keyed && r === kr && g === kg && b === kb) continue; // zeroed: transparent
      rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = b; rgba[q + 3] = 255;
      depth[o] = relief ? relief[sy * width + sx] : 80 + ((lum(r, g, b) * 85 / 255) | 0);
    }
  }
  return { rgba, depth };
}
