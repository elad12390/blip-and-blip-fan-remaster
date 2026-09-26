// Test controls exist only in the explicitly selected QA build, never production.
#ifdef BB_QA
#include "browser_bridge.h"
#include "game.h"
#include "globals.h"
#include "enemy.h"
#include "bonus_fusil.h"
#include "bonus_pm.h"
#include "bonus_lf.h"
#include "bonus_laser.h"
#include "bonus_beer.h"
#include "bonus_tonneau.h"
#include "tir_bb_vache.h"
#include <SDL2/SDL_mixer.h>
#include <cstdio>
#include <memory>
#include <algorithm>
extern Game game;
static Couille* playerAt(int n){return game.browserPlayer(n==1?1:0);}
extern "C" {
EMSCRIPTEN_KEEPALIVE int bb_qa_weapon(int player,int id){
    auto* p=playerAt(player);if(!p || !bb_in_game || id<0 || id>4)return -1;
    // Start from the original empty/default-weapon state so pickup priority
    // protection does not intentionally reject lower-tier QA selections.
    p->id_arme=ID_M16;p->ammo=0;p->latence_arme=3;p->nb_etape_arme=5;
    p->cadence_arme=10;p->poid_arme=1;p->etape_arme=p->ss_etape_arme=p->etape_recul=0;p->tire=false;
    switch(id){
      case ID_FUSIL:{BonusFusil pickup;pickup.estPris(p);break;}
      case ID_PM:{BonusPM pickup;pickup.estPris(p);break;}
      case ID_LF:{BonusLF pickup;pickup.estPris(p);break;}
      case ID_LASER:{BonusLaser pickup;pickup.estPris(p);break;}
    }
    return p->id_arme;
}
EMSCRIPTEN_KEEPALIVE int bb_qa_health(int player,int health,int lives){
    auto* p=playerAt(player);if(!p)return -1;p->pv=std::clamp(health,0,100);p->nb_life=std::clamp(lives,1,99);return p->pv;
}
EMSCRIPTEN_KEEPALIVE int bb_qa_hit_player(int player,int damage){
    auto* p=playerAt(player);if(!p || !bb_in_game)return -1;p->invincible=0;p->estTouche(std::clamp(damage,0,1000));return p->pv;
}
EMSCRIPTEN_KEEPALIVE int bb_qa_die(int player){
    auto* p=playerAt(player);if(!p || !bb_in_game)return -1;p->nb_life=1;p->invincible=0;p->estTouche(p->pv+1);return p->etat;
}
EMSCRIPTEN_KEEPALIVE int bb_qa_finish_level(){if(!bb_in_game)return 0;game.browserQaFinish();return 1;}
EMSCRIPTEN_KEEPALIVE int bb_qa_cows(int player,int cows){auto* p=playerAt(player);if(!p)return -1;p->nb_cow_bomb=std::clamp(cows,0,10);p->wait_cow_bomb=100;return p->nb_cow_bomb;}
EMSCRIPTEN_KEEPALIVE int bb_qa_pickup_health(int player,int barrel){auto* p=playerAt(player);if(!p)return -1;if(barrel){BonusTonneau pickup;pickup.estPris(p);}else{BonusBeer pickup;pickup.estPris(p);}return p->pv;}
EMSCRIPTEN_KEEPALIVE int bb_qa_damage(int weapon,int hits){
    auto* p=playerAt(0);if(!p || !bb_in_game || weapon<0 || weapon>5)return -1;
    hits=std::clamp(hits,1,10000);
    // Real original projectile classes, passed through the same Enemy::estTouche
    // collision-damage path as gameplay. A surviving target avoids reward drops.
    Ennemi target;target.pv=10000000;target.pic=nullptr;
    std::unique_ptr<TirBB> projectile;
    switch(weapon){
      case ID_M16:projectile=std::make_unique<TirBBM16>();break;
      case ID_FUSIL:{auto shot=std::make_unique<TirBBFusil>();shot->vie=0;shot->duree_vie=100;projectile=std::move(shot);break;}
      case ID_PM:projectile=std::make_unique<TirBBPM>();break;
      case ID_LF:{auto shot=std::make_unique<TirBBLF>();shot->deg=12;shot->fini=false;projectile=std::move(shot);break;}
      case ID_LASER:projectile=std::make_unique<TirBBLaser>();break;
      case 5:projectile=std::make_unique<TirBBVache>();break;
    }
    projectile->joueur=p;
    int before=target.pv,score=p->getScore();
    for(int i=0;i<hits;i++)target.estTouche(projectile.get());
    p->setScore(score);return before-target.pv;
}
EMSCRIPTEN_KEEPALIVE const char* bb_qa_state_json(){
    static char buffer[2048];auto* p=playerAt(0);auto* p2=playerAt(1);
    int hz=0,channels=0;Uint16 format=0;int audio=Mix_QuerySpec(&hz,&format,&channels);
    int context=EM_ASM_INT({return !Module.SDL2||!Module.SDL2.audioContext?0:({running:3,suspended:2,closed:1}[Module.SDL2.audioContext.state]||0);});
    snprintf(buffer,sizeof(buffer),"{\"shots\":%u,\"cows\":%u,\"enemies\":%u,\"audioOpen\":%d,\"audioFrequency\":%d,\"audioChannels\":%d,\"audioContext\":%d,\"musicPlaying\":%d,\"musicPaused\":%d,\"soundChannelsPlaying\":%d,\"playerState\":%d,\"playerInvincible\":%d,\"player2State\":%d,\"player2Weapon\":%d,\"player2Ammo\":%d,\"flags\":[%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]}",
      (unsigned)list_tirs_bb.size(),(unsigned)list_cow.size(),(unsigned)list_ennemis.size(),audio,hz,channels,context,Mix_PlayingMusic(),Mix_PausedMusic(),Mix_Playing(-1),p?p->etat:-1,p?p->invincible:0,p2?p2->etat:-1,p2?p2->id_arme:-1,p2?p2->ammo:0,
      game_flag[0],game_flag[1],game_flag[2],game_flag[3],game_flag[4],game_flag[5],game_flag[6],game_flag[7],game_flag[8],game_flag[9],game_flag[10]);
    return buffer;
}
}
#endif
