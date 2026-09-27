/******************************************************************
*
*
*		----------------------
*		  EventScrollSpeed.h
*		----------------------
*
*		Classe Evenement Scroll Speed
*
*
*		Prosper / LOADED -   2 Aout 2000
*
*
*
******************************************************************/

#ifndef _EventScrollSpeed_
#define _EventScrollSpeed_

#include "event.h"

class EventScrollSpeed : public Event
{
public:

	int		speed;

	bool rightEdgeTriggered() const override { return false; }

	virtual void doEvent()
	{
		scroll_speed = speed;
	};
};

#endif