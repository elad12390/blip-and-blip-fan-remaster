/******************************************************************
*
*
*		------------------
*		    Scroll.cpp
*		------------------
*
*
*		Fonctions pour le scroll. Gère le scrolling
*		avec le super buffer qui marche bizarrement sur cette
*		merde de GeForce.
*
*
*		Prosper / LOADED -   V 0.1 - 2 Aout 2000
*
*
*
******************************************************************/


//-----------------------------------------------------------------------------
//		Headers
//-----------------------------------------------------------------------------

#include "graphics.h"
#include "sprite.h"
#include "globals.h"
#include "scroll.h"
#include "ben_debug.h"
#include <SDL2/SDL.h>
#include <algorithm>

#include "couille.h"

int vbuffer_wide = WANTED_VBUFFER_WIDE;
int	next_x = 0;
int	xTex = 0;
int	n_img = 0;
int n_cache = 0;

//-----------------------------------------------------------------------------

void drawScrolling()
{
	Rect		r;

	// Pour éviter les mauvaises surprises
	//
	offset = std::max(0, std::min(offset, level_size - scr_w));

	int x3 = (offset + vbuffer_wide - 2) % vbuffer_wide;

	r.top	= 0;
	r.bottom = 480;

	

	// Prefill ahead of the camera, but never past the level's last decor tile
	// (the ring is far wider than the original 840, so this bound matters).
	const int prefillTiles = std::min(scr_level_size, (offset + vbuffer_wide - 2) / 640);
	while (n_img < prefillTiles || (n_img < scr_level_size && (next_x != ((x3 + 1) % vbuffer_wide)) && (next_x != ((x3) % vbuffer_wide)))) {

		/*static int counter = 0;
		char buf[128];
		sprintf(buf, "test/%d.bmp", counter);
		if (counter >200 && counter<250)
			SDL_SaveBMP(videoA->Get(), buf);
		counter++;*/

		r.left	= xTex;
		r.right = xTex + 2;

		videoA->BltFast(next_x, 0, pbk_decor[num_decor[n_img]]->Surf(), &r, DDBLTFAST_WAIT | DDBLTFAST_NOCOLORKEY);

		xTex += 2;

		if (xTex == 640) {
			xTex = 0;
			n_img += 1;
		}

		next_x += 2;

		if (next_x == vbuffer_wide) {
			next_x = 0;
			n_cache += 1;
		}
	}

	// Tile the authored world into the complete responsive framebuffer. The
    // original ring remains the persistent decal cache for the active encounter.
    // Rendering beyond it must not advance event triggers or boss arena locks.
    backSurface->FillRect(nullptr,0xFF000000);
    const int width=backSurface->Get()->w;
    // A view wider than a short level keeps black beyond its real ends rather
    // than repeating the first/last screen as fake walkable ground.
    const int levelEnd=std::min(bb_camera_x+width,scr_level_size*640);
    int tileWorldX=std::max(bb_camera_x,0);
    while(tileWorldX<levelEnd){
        const int tile=tileWorldX/640, tileX=tileWorldX%640;
        const int count=std::min(levelEnd-tileWorldX,640-tileX);
        Rect source={tileX,0,tileX+count,480};
        backSurface->BltFast(tileWorldX-bb_camera_x,0,pbk_decor[num_decor[tile]]->Surf(),&source,DDBLTFAST_NOCOLORKEY);
        tileWorldX+=count;
    }
    // Overlay the cached region, including blood/scenery damage already drawn
    // by grave(). Each ring segment corresponds to its real world coordinate.
    const int cachedEnd=std::min(level_size,n_img*640+xTex);
    const int cachedStart=std::max(0,cachedEnd-vbuffer_wide);
    int worldX=std::max(bb_camera_x,cachedStart);
    const int end=std::min(bb_camera_x+width,cachedEnd);
    while(worldX<end){
        const int ringX=worldX%vbuffer_wide;
        const int count=std::min(end-worldX,vbuffer_wide-ringX);
        Rect source={ringX,0,ringX+count,480};
        backSurface->BltFast(worldX-bb_camera_x,0,videoA,&source,DDBLTFAST_NOCOLORKEY);
        worldX+=count;
    }

}

//-----------------------------------------------------------------------------

void updateScrolling(bool forceOk)
{
	if (scroll_locked) {
		if (offset < x_lock)
			offset = x_lock;
	} else if (scroll_speed != 0 && forceOk) {
		offset += scroll_speed;
	} else if (list_joueurs.size() > 0) {
		Sprite *	s;
		int			x_moy = 0;

                for (Couille* s : list_joueurs) {
			x_moy += s->x;
		}

		x_moy /= list_joueurs.size();
		x_moy -= scr_w / 2;	// Keep the heroes centred in the play window

		if (x_moy > offset) {
			if ((x_moy - offset) >= 2)
				offset += 2;
			else
				offset = x_moy;
		}
	}

	offset = std::max(0, std::min(offset, level_size - scr_w));
}
