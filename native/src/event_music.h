/******************************************************************
*
*
*		---------------
*		  EventMusic.h
*		---------------
*
*		Classe Evenement Music
*
*
*		Prosper / LOADED -   2 Aout 2000
*
*
*
******************************************************************/

#ifndef _EventMusic_
#define _EventMusic_

#include "event.h"

class EventMusic : public Event
{
public:

	int		play;
	int		id;

	bool rightEdgeTriggered() const override { return false; }

	virtual void doEvent();
};

#endif
