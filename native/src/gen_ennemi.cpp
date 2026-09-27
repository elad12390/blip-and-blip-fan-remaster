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

	// Never flood the screen: wait (without using up capacity) while crowded.
	if (bb_spawner_crowded()) {
		if (t > periode - 20) t = periode - 20;
		if (x < offset - 100) a_detruire = true;
		return;
	}

	// Screen cleared: bring the next enemy in now instead of making the
	// player wait out the spawn timer.
	if (bb_screen_clear() && t < periode - 1) t = periode - 1;

	t += 1;
	t %= periode;

	if (t == 0) {
		EventEnnemi	e;

		e.id_ennemi = id_ennemi;
		e.sens = sens;
		e.x = bb_spawn_x(x, y);
		e.y = y;
		{
			// Generator rate/capacity already carry the difficulty.
			const int saved = bb_difficulty; bb_difficulty = 1;
			e.doEvent();
			bb_difficulty = saved;
		}

		capacite -= 1;
		if (capacite <= 0)
			a_detruire = true;
	}

	if (x < offset - 100)
		a_detruire = true;
}
