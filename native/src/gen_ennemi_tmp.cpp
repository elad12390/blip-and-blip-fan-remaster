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


#include "gen_ennemi_tmp.h"
#include "event_ennemi.h"
#include "browser_bridge.h"

#ifndef SENS_GAUCHE
#define SENS_GAUCHE		0
#define SENS_DROITE		1
#endif


void GenEnnemiTMP::update()
{
	if (game_flag[FLAG_GEN_OFF] != 0)
		return;

	// Never flood the screen: wait (without using up capacity) while crowded.
	if (bb_spawner_crowded()) {
		if (t > periode - 20) t = periode - 20;
		if ((sens == SENS_DROITE && x < offset - 200) || (sens == SENS_GAUCHE && x < offset + kAuthoredScreenWidth + 50)) a_detruire = true;
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
		e.x = x;
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

	// Keep the original 640-screen distance: a wider window reaches these
	// right-side spawners before a fight locks, and removing one early loses
	// enemies that scripted fights need (Smurf Village II's boss).
	if ((sens == SENS_DROITE && x < offset - 200) || (sens == SENS_GAUCHE && x < offset + kAuthoredScreenWidth + 50))
		a_detruire = true;
}
