// Original Blip & Blop artwork used by the interface.
export const SPRITES = Object.freeze({
  weapons: [[382, 1, 64, 16], [122, 1, 66, 14], [65, 1, 55, 15], [252, 1, 65, 24], [190, 1, 60, 17]], // M16, shotgun, SMG, flame, laser
  cow: [1573, 1, 46, 34],
  barrel: [1524, 1, 47, 27],
  go: [[1, 55, 109, 39], [112, 55, 109, 39], [223, 55, 109, 39], [334, 55, 109, 39], [445, 55, 109, 39]],
  // inter.png
  logo: [643, 1, 640, 480],
  blip: [1285, 1, 397, 300],
  blop: [1, 483, 548, 285],
  gameOver: [1, 1, 640, 480],
  // portraits.png: 100x100 dialogue heads; Blip then Blop.
  portrait: [[1, 1, 100, 100], [613, 1, 100, 100]],
});

const load = src => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(Error(`Could not load interface art ${src}`));
  image.src = src;
});

export async function loadArt(base = 'assets/') {
  const [inter, misc, font, portraits, backdrop, fontMeta] = await Promise.all([
    load(`${base}ui/inter.png`), load(`${base}ui/misc.png`), load(`${base}ui/font-menu.png`), load(`${base}ui/portraits.png`), load(`${base}forest.png`),
    fetch(`${base}ui/font-menu.json`).then(r => { if (!r.ok) throw Error('Could not load interface font'); return r.json(); }),
  ]);
  return { inter, misc, font, portraits, backdrop, fontMeta, logo: keyBlack(inter, SPRITES.logo) };
}

// The title art is authored on black; key the black out once so it can sit on
// any backdrop with soft edges.
function keyBlack(image, [sx, sy, sw, sh]) {
  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const data = context.getImageData(0, 0, sw, sh), p = data.data;
  for (let i = 0; i < p.length; i += 4) p[i + 3] = Math.min(255, Math.max(0, (Math.max(p[i], p[i + 1], p[i + 2]) - 10) * 8));
  context.putImageData(data, 0, 0);
  return canvas;
}
