#include "browser_bridge.h"
/******************************************************************
*
*
*		----------------
*		  ControlP2.h
*		----------------
*
*		Classe ControlorP2
*
*		Sert d'intermédiaire entre Blip/Blop et le joueur 1
*
*
*		Prosper / LOADED -   V 0.1
*
*
*
******************************************************************/

#ifndef _ControlP2_
#define _ControlP2_

//-----------------------------------------------------------------------------
//		Headers
//-----------------------------------------------------------------------------

#include "input.h"
#include "controlor.h"
#include "control_alias.h"

//-----------------------------------------------------------------------------
//		Définition de la classe ControlP2
//-----------------------------------------------------------------------------

class ControlP2 : public Controlor
{
protected:
public:
	virtual int gauche() const
	{
		return bb_input(1,0);
	};

	virtual int haut() const
	{
		return bb_input(1,2);
	};

	virtual int droite() const
	{
		return bb_input(1,1);
	};

	virtual int bas() const
	{
		return bb_input(1,3);
	};

	virtual int fire() const
	{
		return bb_input(1,4);
	};

	virtual int saut() const
	{
		return bb_input(1,5);
	};

	virtual int super() const
	{
		return bb_input(1,6);
	};
};


#endif

