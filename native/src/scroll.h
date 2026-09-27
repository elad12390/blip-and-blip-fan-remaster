/******************************************************************
*
*
*		----------------
*		    Scroll.h
*		----------------
*
*
*		Fonctions pour le scroll. Gère le scrolling
*		avec le super buffer qui marche bizarrement sur cette
*		merde de GeForce.
*
*
*		Prosper / LOADED -   V 0.1 - 3 Juillet 2000
*
*
*
******************************************************************/

// The decal ring must stay wider than the widest play window (1600) plus the
// columns prefilled ahead of the right edge.
#define WANTED_VBUFFER_WIDE	2400

extern int	vbuffer_wide;
extern int	next_x;
extern int	xTex;
extern int	n_img;
extern int	n_cache;


// Gère le scroll
//
void updateScrolling(bool forceOk = true);
void drawScrolling();