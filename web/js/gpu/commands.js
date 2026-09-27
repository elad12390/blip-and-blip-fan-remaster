// Native GPU frame command stream. Layout is defined in native/src/gpu_frame.h.
export const OP = Object.freeze({ UPLOAD: 1, BLIT: 2, FILL: 3, WARP: 4, SHADE: 5 });
const SIZE = { [OP.UPLOAD]: 12, [OP.BLIT]: 8, [OP.FILL]: 6, [OP.WARP]: 3, [OP.SHADE]: 5 };

// Calls visitor[name](...words) for each command. Stops at the first unknown
// opcode instead of reading misaligned garbage.
export function decodeCommands(words, visitor) {
  let i = 0;
  while (i < words.length) {
    const op = words[i], size = SIZE[op];
    if (!size || i + size > words.length) throw Error(`Corrupt GPU command stream at word ${i} (op ${op}).`);
    const w = words;
    switch (op) {
      case OP.UPLOAD: visitor.upload?.({ id: w[i+1], ptr: w[i+2] >>> 0, width: w[i+3], height: w[i+4], pitch: w[i+5], keyed: w[i+6] !== 0, key: w[i+7] >>> 0, dirty: { x: w[i+8], y: w[i+9], width: w[i+10], height: w[i+11] } }); break;
      case OP.BLIT: visitor.blit?.(w[i+1], w[i+2], w[i+3], w[i+4], w[i+5], w[i+6], w[i+7]); break;
      case OP.FILL: visitor.fill?.(w[i+1], w[i+2], w[i+3], w[i+4], w[i+5] >>> 0); break;
      case OP.WARP: visitor.warp?.(w[i+1], w[i+2]); break;
      case OP.SHADE: visitor.shade?.(w[i+1], w[i+2], w[i+3], w[i+4]); break;
    }
    i += size;
  }
}
