#include "browser_bridge.h"
/******************************************************************
*
*
*		----------------
*		  ControlP1.h
*		----------------
*
*		Classe ControlorP1
*
*		Sert d'intermédiaire entre Blip/Blop et le joueur 1
*
*
*		Prosper / LOADED -   V 0.1
*
*
*
******************************************************************/

#ifndef _ControlP1_
#define _ControlP1_

//-----------------------------------------------------------------------------
//		Headers
//-----------------------------------------------------------------------------

#include "input.h"
#include "controlor.h"
#include "control_alias.h"

//-----------------------------------------------------------------------------
//		Définition de la classe ControlP1
//-----------------------------------------------------------------------------

class ControlP1 : public Controlor
{
protected:
public:
	virtual int gauche() const
	{
		return bb_input(0,0);
	};

	virtual int haut() const
	{
		return bb_input(0,2);
	};

	virtual int droite() const
	{
		return bb_input(0,1);
	};

	virtual int bas() const
	{
		return bb_input(0,3);
	};

	virtual int fire() const
	{
		return bb_input(0,4);
	};

	virtual int saut() const
	{
		return bb_input(0,5);
	};

	virtual int super() const
	{
		return bb_input(0,6);
	};
};


#endif

