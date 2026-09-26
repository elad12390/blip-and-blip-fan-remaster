#include "browser_bridge.h"
#include "game.h"
#include "globals.h"
#include "input.h"
#include "cine_player.h"
#include <SDL2/SDL_mixer.h>
#include <algorithm>
#include <cstdio>
#include <cstring>
extern Game game;
int bb_mode=0, bb_part=0, bb_start_part=0, bb_player=0, bb_players=1;
int bb_armor=0, bb_firepower=0, bb_supply=0;
bool bb_running=false, bb_paused=false, bb_game_over=false, bb_completed=false, bb_in_game=false;
static int masks[2]={0,0}, pending=0, damageRemainder=0;
static char currentLevel[200]="Ready";
static char stateBuffer[2048];
int bb_input(int player,int bit){return (masks[player]& (1<<bit))!=0;}
int bb_max_hp(){return 5+(bb_mode?bb_armor:0);}
int bb_bonus_damage(int base){
    if(!bb_mode || !bb_firepower || base<=0)return base;
    damageRemainder += base*bb_firepower;
    int extra=damageRemainder/10;damageRemainder%=10;
    return base+extra;
}
void bb_yield(){
    emscripten_sleep(1);
    while(bb_paused && !app_killed) emscripten_sleep(30);
}
extern "C" {
EMSCRIPTEN_KEEPALIVE void bb_set_input(int mask){masks[0]=mask;}
EMSCRIPTEN_KEEPALIVE void bb_set_input2(int mask){masks[1]=mask;}
EMSCRIPTEN_KEEPALIVE void bb_set_players(int count){bb_players=count==2?2:1;}
EMSCRIPTEN_KEEPALIVE void bb_set_upgrades(int armor,int firepower,int supply){bb_armor=std::clamp(armor,0,5);bb_firepower=std::clamp(firepower,0,5);bb_supply=std::clamp(supply,0,3);}
EMSCRIPTEN_KEEPALIVE void bb_volume(int volume){Mix_Volume(-1,std::clamp(volume,0,128));Mix_VolumeMusic(std::clamp(volume,0,128));}
EMSCRIPTEN_KEEPALIVE void bb_pause(int pause){bb_paused=pause!=0;if(bb_paused){Mix_PauseMusic();Mix_Pause(-1);}else{Mix_ResumeMusic();Mix_Resume(-1);}}
EMSCRIPTEN_KEEPALIVE void bb_start(int mode,int player,int part){
    bb_mode=mode==1;bb_player=player==1;bb_start_part=std::clamp(part,0,21);
    pending=1;bb_paused=false;masks[0]=masks[1]=0;
    if(bb_running)app_killed=true;
}
EMSCRIPTEN_KEEPALIVE const char* bb_state_json(){
    Couille* p=game.browserPlayer(0);Couille* p2=game.browserPlayer(1);
    snprintf(stateBuffer,sizeof(stateBuffer),
      "{\"inGame\":%s,\"running\":%s,\"paused\":%s,\"mode\":\"%s\",\"part\":%d,\"level\":\"%s\",\"player\":%d,\"players\":%d,\"x\":%d,\"y\":%d,\"hp\":%d,\"maxHp\":%d,\"lives\":%d,\"weapon\":%d,\"ammo\":%d,\"cows\":%d,\"score\":%d,\"kills\":%d,\"offset\":%d,\"gameOver\":%s,\"completed\":%s,\"firing\":%s,\"player2\":{\"x\":%d,\"y\":%d,\"hp\":%d,\"lives\":%d}}",
      bb_in_game?"true":"false",bb_running?"true":"false",bb_paused?"true":"false",bb_mode?"roguelite":"original",bb_part,currentLevel,bb_player,bb_players,
      p?p->x-offset:0,p?p->y:0,p?p->pv:0,bb_max_hp(),p?p->nb_life:0,p?p->id_arme:0,p?p->ammo:0,p?p->nb_cow_bomb:0,
      (p?p->getScore():0)+(p2?p2->getScore():0),game_flag[FLAG_NB_KILL],offset,bb_game_over?"true":"false",bb_completed?"true":"false",p&&p->tire?"true":"false",
      p2?p2->x-offset:0,p2?p2->y:0,p2?p2->pv:0,p2?p2->nb_life:0);
    return stateBuffer;
}
}
void bb_checkpoint(const char* level){
    if(app_killed || pending)return;
    static const char* names[]={"Briefing","Smurf Village I","Briefing","Smurf Village II","Briefing","Duck Hunt","Briefing","Care Bears I","Briefing","Care Bears II","Care Bears III","Briefing","Snorks I","Snorks II","Briefing","Lemmings","Briefing","Video Game World","Briefing","Mario and Luigi","Briefing","The Final Battle"};
    snprintf(currentLevel,sizeof(currentLevel),"%s",bb_part>=0 && bb_part<22?names[bb_part]:level);
    EM_ASM({if(Module.onCheckpoint)Module.onCheckpoint(UTF8ToString($0));},bb_state_json());
}
void bb_level_begin(Couille* p1,Couille* p2){
    if(bb_mode){for(auto* p:{p1,p2})if(p && p->nb_life>0){p->pv=bb_max_hp();p->nb_cow_bomb=std::max(p->nb_cow_bomb,1+bb_supply);}}
}
void bb_death(){
    if(app_killed || pending || bb_game_over)return;
    bb_game_over=true;
    // Preserve the original game-over MP3 cue beneath the browser overlay.
    mbk_inter.play(1);
    EM_ASM({if(Module.onDeath)Module.onDeath(UTF8ToString($0));},bb_state_json());
    // The overlay pauses simulation and all audio. Resume only this music cue;
    // a replacement run or a later return to title must retain control.
    if(bb_game_over && !app_killed && !pending)Mix_ResumeMusic();
}
void bb_complete(){if(app_killed || pending || bb_completed)return;bb_completed=true;EM_ASM({if(Module.onComplete)Module.onComplete(UTF8ToString($0));},bb_state_json());}
void bb_run(){
    for(;;){
        while(!pending)emscripten_sleep(30);
        pending=0;app_killed=false;bb_running=true;bb_game_over=bb_completed=false;damageRemainder=0;
        bb_part=bb_start_part;bb_in_game=false;
        if(bb_start_part==0){
            snprintf(currentLevel,sizeof(currentLevel),"Opening cinematic");
            CINEPlayer intro;intro.loadPBK("data/intro.gfx");
            mbk_interl.play(0);intro.playScene("data/intro.cin",primSurface,backSurface);
            mbk_interl.stop();in.waitClean();
        }
        if(!app_killed)game.jouePartie(bb_players,bb_player);
        bb_running=false;app_killed=false;
        if(!pending)EM_ASM({if(Module.onState)Module.onState(UTF8ToString($0));},bb_state_json());
    }
}
