/******************************************************************
*
*
*		-------------------
*		  EventHoldFire.h
*		-------------------
*
*		Classe Evenement Hold Fire
*
*
*		Prosper / LOADED -   2 Aout 2000
*
*
*
******************************************************************/

#ifndef _EventHoldFire_
#define _EventHoldFire_

#include "event.h"

class EventHoldFire : public Event
{
public:

	int		flag;
	int		val;

	bool rightEdgeTriggered() const override { return false; }

	virtual void doEvent()
	{
		hold_fire = true;
		flag_hold_fire = flag;
		val_hold_fire = val;
	};
};

#endif