#include "browser_bridge.h"
/******************************************************************
*
*
*		---------------
*		  BonusBeer.h
*		---------------
*
*
*
*		Prosper / LOADED -   V 0.1 - 17 Juillet 2000
*
*
*
******************************************************************/

#ifndef _BonusBeer_
#define _BonusBeer_

#include "bonus.h"

class BonusBeer : public Bonus
{
public:

	BonusBeer()
	{
		pic = pbk_misc[13];
		col_on = true;
	};

	virtual void estPris(Couille * c)
	{
		if (c->pv == bb_max_hp())
			return;

		sbk_misc.play(5);

		c->pv += 2;

		if (c->pv > bb_max_hp())
			c->pv = bb_max_hp();

		Bonus::estPris(c);
	};
};

#endif