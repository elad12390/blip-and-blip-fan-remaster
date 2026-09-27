/******************************************************************
*
*
*		----------------------
*		  EventGenEnnemi.cpp
*		----------------------
*
*		Classe Evenement Ennemi
*
*		La classe evenement qui crée un ennemi
*
*
*		Prosper / LOADED -   5 Aout 2000
*
*
*
******************************************************************/

#include "event_gen_ennemi.h"
#include "gen_ennemi_tmp.h"
#include "gen_ennemi.h"
#include "browser_bridge.h"
#include <algorithm>

void EventGenEnnemi::doEvent()
{
	GenEnnemi *	gen;

	if (tmp)
		gen = new GenEnnemiTMP();
	else
		gen = new GenEnnemi();

	gen->id_ennemi = id_ennemi;
	gen->x = x;
	gen->y = y;
	gen->sens = sens;
	// Spawners emit proportionally more (or fewer) enemies, faster (or slower).
	const int percent = bb_enemy_percent();
	gen->periode = std::max(12, periode * 100 / percent);
	gen->capacite = std::max(1, (capacite * percent + 50) / 100);

	list_gen_ennemis.emplace_back(gen);
}
