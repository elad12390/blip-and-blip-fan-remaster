#pragma once
#include <SDL.h>
// Inferred surface relief. The original artwork contains no authored geometry.
void bb_material_blit(SDL_Surface* source, const SDL_Rect* sourceRect, SDL_Surface* destination, const SDL_Rect* destinationRect);
void bb_material_fill(SDL_Surface* destination, const SDL_Rect* rect, Uint32 color);
void bb_material_forget(SDL_Surface* surface);
unsigned char* bb_material_pixels(SDL_Surface* surface);

// Translate each color and material row from one immutable pre-effect frame.
// Positive offsets move right. Exposed pixels become opaque black / flat relief.
bool bb_material_warp_rows(SDL_Surface* surface, const int* offsets, int rows);
