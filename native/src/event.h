/******************************************************************
*
*
*		------------
*		  Event.h
*		------------
*
*		Classe Evenement
*
*		La classe mère de tous les évenements
*
*
*		Prosper / LOADED -   2 Aout 2000
*
*
*
******************************************************************/

#ifndef _Event_
#define _Event_

#include "globals.h"

class Event
{
public:
	int		x_activation;

	inline virtual bool aReveiller()
	{
		return x_activation <= (rightEdgeTriggered() ? progressOffset() : authoredOffset());
	};

	// Spawns and scenery trigger when the right screen edge reaches the spot
	// the original screen's edge did. Scroll locks, scroll speed, flags, hold
	// fire, dialogue and music keep their original left-edge timing because
	// they are tied to where the camera itself stops.
	inline virtual bool rightEdgeTriggered() const
	{
		return true;
	};

	inline virtual bool aActiver()
	{
		return true;
	};

	virtual void doEvent() = 0;
};

#endif
