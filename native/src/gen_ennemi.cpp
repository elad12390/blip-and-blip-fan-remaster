/******************************************************************
*
*
*		-----------------
*		  GenEnnemi.cpp
*		-----------------
*
*		Classe Générateur ennemi
*
*
*		Prosper / LOADED -   5 Aout 2000
*
*
*
******************************************************************/

#include "sprite.h"
#include "gen_ennemi.h"
#include "event_ennemi.h"
#include "couille.h"
#include "browser_bridge.h"

#ifndef SENS_GAUCHE
#define SENS_GAUCHE		0
#define SENS_DROITE		1
#endif

GenEnnemi::GenEnnemi() : t(0), a_detruire(false)
{
}

void GenEnnemi::update()
{
	if (game_flag[FLAG_GEN_OFF] != 0)
		return;

	t += 1;
	t %= periode;

	if (t == 0) {
		Sprite *	s;
		bool		ok = true;

		for (Couille* s : list_joueurs) {
			ok = (s->x < x - 100 || s->x > x + 100 || s->y < y - 100 || s->y > y + 100);
		}

		if (ok) {
			EventEnnemi	e;

			e.id_ennemi = id_ennemi;
			e.sens = sens;
			e.x = x;
			e.y = y;
			{
			// Generator rate/capacity already carry the difficulty.
			const int saved = bb_difficulty; bb_difficulty = 1;
			e.doEvent();
			bb_difficulty = saved;
			}
		}

		// A spawn blocked by a nearby hero is retried shortly instead of
		// being lost: scripted fights count these kills (Smurf Village II's
		// boss needs five), so a lost spawn made the stage unwinnable.
		if (ok) {
			capacite -= 1;
			if (capacite <= 0)
				a_detruire = true;
		} else {
			t = periode > 30 ? periode - 30 : 0;
		}
	}

	if (x < offset - 100)
		a_detruire = true;
}
