#pragma once

#include <SDL2/SDL.h>
#include <cstdint>

// GPU frame recording.
//
// While a gameplay frame is recorded, blits and fills that target the frame
// surface are not rasterised on the CPU. They become a compact int32 command
// stream the browser renders with WebGL. Every other surface (sprite banks, the
// scroll/decal ring, snapshots) stays CPU-owned; writes to them are tracked so
// the browser re-uploads only what changed.
//
// Stream layout (little-endian int32 words), shared with web/js/gpu/commands.js:
//   UPLOAD  id ptr w h pitch keyed key dirtyX dirtyY dirtyW dirtyH
//   BLIT    id sx sy sw sh dx dy
//   FILL    x y w h abgr
//   WARP    phase amplitude
//   SHADE   litLeft litRight ramp dimAlpha
namespace bbgpu {

enum Op : int32_t { kUpload = 1, kBlit = 2, kFill = 3, kWarp = 4, kShade = 5 };

// The browser opts in once it has a WebGL2 compositor.
void setEnabled(bool enabled);
bool enabled();

// Start/finish recording a frame into `target`. Recording is suppressed while
// a CPU capture is forced (screens that read the framebuffer back).
void beginFrame(SDL_Surface* target);
bool recording();
bool isTarget(const SDL_Surface* surface);
void endFrame();

// Forces CPU rasterisation for the enclosed frames; nests.
struct ForceCpu {
    ForceCpu();
    ~ForceCpu();
};

void blit(SDL_Surface* source, const SDL_Rect* sourceRect, int dx, int dy);
void fill(const SDL_Rect* rect, Uint32 abgr);
void warp(int phase, int amplitude);
void shade(int litLeft, int litRight, int ramp, int dimAlpha);

// A CPU write changed `surface` inside `rect` (null = whole surface).
void touched(SDL_Surface* surface, const SDL_Rect* rect);
// `surface` is about to be freed; its GPU copy can be released.
void forget(SDL_Surface* surface);
// The browser lost its GPU copies (context loss): resend everything on use.
void invalidateAll();

const int32_t* commands();
int commandCount();
const int32_t* forgotten();
int forgottenCount();
void clearForgotten();

}  // namespace bbgpu
