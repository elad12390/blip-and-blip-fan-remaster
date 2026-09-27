#pragma once

#include "graphics.h"
#include <SDL2/SDL.h>

#include "browser_material.h"
#include "gpu_frame.h"
#include "sdl_pixelformat.h"
#include "sdl_surfaceinfo.h"

#ifndef DDLOCK_WAIT // not used by SDL
#define DDLOCK_SURFACEMEMORYPTR 0x1
#define DDLOCK_WAIT 0x2
#define DDLOCK_WRITEONLY 0x4
#endif

namespace SDL
{

	class Surface
	{
		private:
		SDL_Surface *surface;
		Surface *backBuffer;

		public:
		//Surface();

		Surface(SDL_Surface* surf) {
			//SDL_SetSurfaceBlendMode(surf, SDL_BLENDMODE_NONE);
			SDL_SetSurfaceAlphaMod(surf, 0xff);
			surface = surf;
			backBuffer = 0;
		}

		Surface(SDL_Surface* surf, Surface* bb) {
			//SDL_SetSurfaceBlendMode(surf, SDL_BLENDMODE_NONE);
			SDL_SetSurfaceAlphaMod(surf, 0xff);
			surface = surf;
			backBuffer = bb;
		}

		inline void SetBackBuffer(Surface* b)
		{
			backBuffer = b;
		}

		inline SDL_Surface *Get(){ return surface; };
        // Keep the wrapper address stable: cinematic/RPG loops retain it while
        // Asyncify yields. Only replace the owned pixel buffer at a frame edge.
        bool Resize(int width, int height) {
            if (surface->w == width && surface->h == height) return true;
            SDL_Surface* replacement = SDL_CreateRGBSurfaceWithFormat(
                0, width, height, 32, surface->format->format);
            if (!replacement) return false;
            SDL_FillRect(replacement, nullptr, SDL_MapRGBA(replacement->format,0,0,0,255));
            SDL_BlitSurface(surface, nullptr, replacement, nullptr);
            bbgpu::forget(surface);
            bb_material_forget(surface);
            SDL_FreeSurface(surface);
            surface = replacement;
            return true;
        }
		inline void BltFast(int x, int y, SDL::Surface *surf /*This is the Source Surface! Damn, DD!*/, Rect *r, int flags=0)
		{
                        (void)flags;
			if (bbgpu::isTarget(surface)) {
				if (r) {
					const SDL_Rect source{r->left, r->top, r->right - r->left, r->bottom - r->top};
					bbgpu::blit(surf->Get(), &source, x, y);
				} else bbgpu::blit(surf->Get(), nullptr, x, y);
				return;
			}
			{
				const SDL_Rect written = r ? SDL_Rect{x, y, r->right - r->left, r->bottom - r->top}
				                           : SDL_Rect{x, y, surf->Get()->w, surf->Get()->h};
				bbgpu::touched(surface, &written);
			}
			/*static int test_i = 1;
			char buf[128];
			sprintf(buf, "test/%d.bmp", test_i);
			SDL_SaveBMP(surf->Get(), buf);
			test_i++;*/

			SDL_Rect rect,position;
			position.x = x;
			position.y = y;
			if (r == 0)
			{
				bb_material_blit(surf->Get(), 0, surface, &position);
				SDL_BlitSurface(surf->Get(), 0, surface, &position);
			}
			else
			{
				rect.x = r->left;
				rect.y = r->top;
				rect.w = r->right - r->left;
				rect.h = r->bottom - r->top;
				/*SDL_BlitSurface(SDL_Surface*    src,
				const SDL_Rect* srcrect,
				SDL_Surface*    dst,
				SDL_Rect*       dstrect)*/
				bb_material_blit(surf->Get(), &rect, surface, &position);
				int ret=SDL_BlitSurface(surf->Get(), &rect, surface, &position);
				if (ret != 0)
				{
					debug <<"Errore SDL_BlitSurface in sdl_surface.h - "<< SDL_GetError() << "\n";
					exit(0);
				}

				/*static int test_i = 1;
				char buf[128];
				sprintf(buf, "test/%d.bmp", test_i);
				SDL_SaveBMP(surf->Get(), buf);
				test_i++;*/
			}

		}

		inline void Blt(Rect *src, SDL::Surface *surf, Rect *dest, int flags = 0, DDBLTFX *pad = 0)
		{
                        (void)flags;
			/*
			TODO: IF flags contains DDBLT_COLORFILL then i must fill the surface with the color of
			*/
			SDL_Rect *rect=0, *position=0;
			if (src)
			{
				rect = new SDL_Rect;
				rect->x = src->left;
				rect->y = src->top;
				rect->w = src->right - src->left;
				rect->h = src->bottom - src->top;
			}
			if (bbgpu::isTarget(surface)) {
				if (surf) bbgpu::blit(surf->Get(), rect, dest ? dest->left : 0, dest ? dest->top : 0);
				else bbgpu::fill(rect, pad ? pad->dwFillColor : 0xFF000000);
				delete rect;
				return;
			}
			if (dest)
			{
				position = new SDL_Rect;
				position->x = dest->left;
				position->y = dest->top;
				position->w = dest->right - dest->left;
				position->h = dest->bottom - dest->top;
			}
			bbgpu::touched(surface, surf ? position : rect);
			if (surf)
			{
				bb_material_blit(surf->Get(), rect, surface, position);
				SDL_BlitSurface(surf->Get(), rect, surface, position);
			}
			else
			{
				const Uint32 color = pad ? pad->dwFillColor : 0xFF000000;
                SDL_FillRect(surface, rect, color);
                bb_material_fill(surface, rect, color);
			}
			if (rect)
				delete rect;
			if (position)
				delete position;

			/*else
			{
				SDL_BlitSurface(0, rect, surface, position);
			}*/

			/*if (src!=0&&dest!=0)
			{
				SDL_Rect rect, position;
				rect.x = src->left;
				rect.y = src->top;
				rect.w = src->right - src->left;
				rect.h = src->bottom - src->top;
				position.x = dest->left;
				position.y = dest->top;
				position.w = dest->right - dest->left;
				position.h = dest->bottom - dest->top;
				SDL_BlitSurface(surface, &rect, surf->Get(), &position);
			}
			else if (src!=0)
			{
				SDL_Rect rect, position;
				position.x = dest->left;
				position.y = dest->top;
				position.w = dest->right - dest->left;
				position.h = dest->bottom - dest->top;
				SDL_BlitSurface(surface, 0, surf->Get(), &position);
			}
			else if (dest != 0)
			{
				SDL_Rect rect, position;
				rect.x = src->left;
				rect.y = src->top;
				rect.w = src->right - src->left;
				rect.h = src->bottom - src->top;
				SDL_BlitSurface(surf->Get(), &rect, surface, 0);
			}
			else
			{
				SDL_BlitSurface(surf->Get(), 0, surface, 0);
			}*/
		}

		/*inline void Blt(RECT *src, SDL::Surface *surf, RECT *dest, DDBLTFX *pad = 0, int flags = 0)
		{
			//Call the original function with the last 2 arguments swapped
			Blt(src, surf, dest, flags,pad);
		}*/

		inline void Release()
		{
			bbgpu::forget(surface);
			bb_material_forget(surface);
			SDL_FreeSurface(surface);
			delete this; // FIXME: OH MY THAT'S DANGEROUS
		}
		inline bool Restore()
		{
			return true;
		}

		inline void FillRect(Rect *r,unsigned int color)
		{
			if (bbgpu::isTarget(surface)) {
				if (r) {
					const SDL_Rect area{r->left, r->top, r->right - r->left, r->bottom - r->top};
					bbgpu::fill(&area, color);
				} else bbgpu::fill(nullptr, color);
				return;
			}
			if (r) {
				const SDL_Rect area{r->left, r->top, r->right - r->left, r->bottom - r->top};
				bbgpu::touched(surface, &area);
			} else bbgpu::touched(surface, nullptr);
			if (!r)
			{
				SDL_FillRect(surface, 0, color);
				bb_material_fill(surface, 0, color);
			}
			else
			{
				SDL_Rect rect;
				rect.x = r->left;
				rect.y = r->top;
				rect.w = r->right - r->left;
				rect.h = r->bottom - r->top;
				SDL_FillRect(surface, &rect, color);
				bb_material_fill(surface, &rect, color);
			}

		}

		bool GetPixelFormat(SDL::PixelFormat* format)
		{
			*format = SDL::PixelFormat(surface->format);
			return true;
		}

		bool Lock(SDL::SurfaceInfo* info, int flags, void*)
		{
                        (void)flags;
			if (SDL_LockSurface(surface) != 0) {
				return false;
			}
			info->lpSurface = surface->pixels;
			info->lPitch = surface->pitch;
			return true;
		}

		void Unlock()
		{
			SDL_UnlockSurface(surface);
			bbgpu::touched(surface, nullptr);
			bb_material_forget(surface);
		}

		bool IsLost() {
			return false;
		}
	};

};
