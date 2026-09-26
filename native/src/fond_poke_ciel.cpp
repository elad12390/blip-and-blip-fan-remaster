
#include "globals.h"
#include "fond_poke_ciel.h"

FondPokeCiel::FondPokeCiel()
{
	pic = pbk_niveau[48];
}

void FondPokeCiel::update()
{
	etape += 4;
	etape %= 384;

	colFromPic();
}

void FondPokeCiel::affiche()
{
	Sprite::affiche();

	SDL::Surface *	surf;
	int						xs;
	int						decalage = 0;
	int						ys;
	Rect					r;
	int						largeur;

	surf = pbk_niveau[50]->Surf();
	xs = pbk_niveau[50]->xSize();
	ys = pbk_niveau[50]->ySize();

	r.top		= 0;
	r.left		= etape;

	if (x + 192 > bb_camera_x + bb_view_width) {
		largeur = bb_camera_x + bb_view_width - x;
	}

	else if (x < bb_camera_x) {
		largeur = 192 ;
		r.left = bb_camera_x - x + etape;
		decalage = bb_camera_x - x;
	} else {
		largeur = 192;
	}

	r.right		= etape + largeur;
	r.bottom	= ys;

	/*if ( x+53 > bb_camera_x+640)
		largeur = bb_camera_x+640-x;
	else if (x < bb_camera_x)
	{
		largeur = 53;
		r.left = bb_camera_x - x;
		decalage = bb_camera_x - x;
	}
	else
		largeur = 53;*/


	backSurface->BltFast(x - bb_camera_x + decalage, y + 50, surf, &r, DDBLTFAST_WAIT | DDBLTFAST_NOCOLORKEY);


	draw(x, y, pbk_niveau[49]);
}
