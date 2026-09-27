#include "browser_bridge.h"
#include "game.h"
#include "globals.h"
#include "enemy.h"
#include "input.h"
#include "cine_player.h"
#include "gpu_frame.h"
#include <SDL2/SDL_mixer.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <string>
#include "rpg_player.h"
extern Game game;
int bb_mode=0, bb_part=0, bb_start_part=0, bb_player=0, bb_players=1;
int bb_armor=0, bb_firepower=0, bb_supply=0, bb_difficulty=1;
static int spawnAccumulator=0;
// Safe time after a hit (original 200 steps), and whether damage is halved.
int bb_hurt_invincibility(){static const int steps[]={400,300,240,200};return steps[std::clamp(bb_difficulty,0,3)];}
int bb_scale_damage(int damage){
    static int remainder=0;
    if(bb_difficulty!=0||damage<=0)return damage;
    remainder+=damage;const int applied=remainder/2;remainder%=2;
    return applied;
}
bool bb_spawner_crowded(){
    static const int caps[]={5,8,12,16};
    int alive=0;
    for(auto& e:list_ennemis)if(e->count() && e->pv>0 && e->pv<=1500)alive++;
    return alive>=caps[std::clamp(bb_difficulty,0,3)];
}
int bb_enemy_percent(){static const int percents[]={35,80,120,170};return percents[std::clamp(bb_difficulty,0,3)];}
int bb_spawn_copies(){
    // Starts at half so Easy keeps the first spawn of a stage and Hard's
    // extra copies are spread evenly rather than bunched at the start.
    spawnAccumulator+=bb_enemy_percent();
    const int copies=spawnAccumulator/100;spawnAccumulator%=100;
    return copies;
}
void bb_reset_spawn_accumulator(){spawnAccumulator=50;}
bool bb_running=false, bb_paused=false, bb_game_over=false, bb_completed=false, bb_in_game=false;
int bb_view_width=640, bb_view_height=480, bb_camera_x=0;
bool bb_gameplay_frame=false, bb_story_screen=false, bb_in_simulation_step=false;
static int requestedWidth=640;

// The living player the lamp follows: P1 first, then P2.
static Couille* focusPlayer(){
    auto* p=game.browserPlayer(0);auto* p2=game.browserPlayer(1);
    if(p && p->nb_life>0)return p;
    if(p2 && p2->nb_life>0)return p2;
    return nullptr;
}

static int targetPlayWidth(){
    // Locked encounters and boss arenas are authored for the 640 screen.
    int target=scroll_locked?kAuthoredScreenWidth:std::max(kAuthoredScreenWidth,requestedWidth);
    if(level_size>0)target=std::min(target,level_size);
    return target;
}

// Called once per simulation tick: resizing or entering a locked encounter
// eases the play window instead of snapping it.
void bb_update_play_width(){
    constexpr int kStep=8;
    const int target=targetPlayWidth();
    scr_w=scr_w<target?std::min(target,scr_w+kStep):std::max(target,scr_w-kStep);
}

static bool cameraTracked=false;

// Horizontal camera inside the play window. Wide displays show the whole
// window. A narrower display follows the hero with a dead zone, clamped to the
// window so its walls are exactly the screen edges.
static int followCamera(int view){
    if(view>=scr_w){cameraTracked=false;return offset;}
    auto* p=game.browserPlayer(0);auto* p2=game.browserPlayer(1);
    Couille* focus=focusPlayer();
    int center=focus?focus->x:offset+scr_w/2;
    if(p && p2 && p->nb_life>0 && p2->nb_life>0 && std::abs(p->x-p2->x)<=view-80)center=(p->x+p2->x)/2;
    int camera=cameraTracked?bb_camera_x:center-view*45/100;
    const int trail=view*36/100, lead=view*56/100;
    if(center-camera>lead)camera=center-lead;
    if(center-camera<trail)camera=center-trail;
    cameraTracked=true;
    return std::clamp(camera,offset,offset+scr_w-view);
}

void bb_prepare_frame(bool gameplay) {
    bb_gameplay_frame=gameplay;
    const int width=gameplay?std::min(requestedWidth,scr_w):kAuthoredScreenWidth;
    if(backSurface && backSurface->Resize(width,480)) {
        bb_view_width=width;bb_view_height=480;
        if(primSurface)primSurface->Resize(width,480);
        if(systemSurface)systemSurface->Resize(width,480);
    }
    bbgpu::beginFrame(gameplay && backSurface?backSurface->Get():nullptr);
    bb_camera_x=gameplay?followCamera(bb_view_width):offset;
    if(!gameplay)cameraTracked=false;
}

// Enemies inside the play window but outside the visible camera, for the HUD's
// edge indicators on narrow displays.
static void offscreenThreats(int& left,int& right){
    left=right=0;
    if(!bb_gameplay_frame || bb_view_width>=scr_w)return;
    for(auto& e:list_ennemis){
        if(e->x<offset-40 || e->x>offset+scr_w+40 || e->y<-50 || e->y>520)continue;
        if(e->x<bb_camera_x)left++;
        else if(e->x>bb_camera_x+bb_view_width)right++;
    }
}

void bb_present_frame() {
    if(!backSurface)return;
    SDL_Surface* surface=backSurface->Get();
    if(bbgpu::forgottenCount()){
        EM_ASM({if(Module.onGpuForget)Module.onGpuForget($0,$1);},bbgpu::forgotten(),bbgpu::forgottenCount());
        bbgpu::clearForgotten();
    }
    if(bbgpu::recording()){
        Couille* focus=focusPlayer();
        EM_ASM({if(Module.onCommands)Module.onCommands($0,$1,$2,$3,$4,$5);},bbgpu::commands(),bbgpu::commandCount(),
          surface->w,surface->h,focus?focus->x-bb_camera_x:-1,focus?focus->y:-1);
        bbgpu::endFrame();
        return;
    }
    bbgpu::endFrame();
    unsigned char* depth=bb_material_pixels(surface);
    // The lamp needs the hero's position in *this* frame. The 200 ms state poll
    // lagged behind every step and jump once the camera stopped gluing to him.
    Couille* focus=bb_gameplay_frame?focusPlayer():nullptr;
    EM_ASM({if(Module.onFrame)Module.onFrame($0,$1,$2,$3,$4,$5,$6,$7);},surface->pixels,surface->w,surface->h,surface->pitch,depth,
      bb_gameplay_frame?1:0,focus?focus->x-bb_camera_x:-1,focus?focus->y:-1);
}
static int masks[2]={0,0}, pending=0, damageRemainder=0;
static char currentLevel[200]="Ready";
static char stateBuffer[1536];
char bb_rpg_bank[32]="";
static std::string stateJson;
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
EMSCRIPTEN_KEEPALIVE void bb_set_viewport(int width,int height){
    if(width<=0 || height<=0)return;
    const int nextWidth=(int)std::clamp<long long>((long long)width*480/height,240,1600);
    if(requestedWidth==nextWidth)return;
    requestedWidth=nextWidth;
    // A paused game has no simulation ticks, but rotation must still redraw.
    // This path does not yield and never enters another Asyncify suspension.
    if(bb_in_game && bb_paused && (rpg_to_play==-1 || bbgpu::enabled())){game.drawAll(false);bb_present_frame();}
}
EMSCRIPTEN_KEEPALIVE void bb_set_difficulty(int level){bb_difficulty=std::clamp(level,0,3);}
EMSCRIPTEN_KEEPALIVE void bb_set_gpu(int enabled){bbgpu::setEnabled(enabled!=0);}
EMSCRIPTEN_KEEPALIVE void bb_gpu_invalidate(){bbgpu::invalidateAll();}
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
      "{\"inGame\":%s,\"running\":%s,\"paused\":%s,\"mode\":\"%s\",\"difficulty\":%d,\"cheated\":%s,\"part\":%d,\"level\":\"%s\",\"player\":%d,\"players\":%d,\"x\":%d,\"y\":%d,\"hp\":%d,\"maxHp\":%d,\"lives\":%d,\"weapon\":%d,\"ammo\":%d,\"cows\":%d,\"score\":%d,\"kills\":%d,\"offset\":%d,\"cameraX\":%d,\"viewportWidth\":%d,\"viewportHeight\":%d,\"playLeft\":%d,\"playRight\":%d,\"frameIsGameplay\":%s,\"locked\":%s,\"nativeHud\":false,\"bonusTimer\":%d,\"gameOver\":%s,\"completed\":%s,\"firing\":%s,\"player2\":{\"x\":%d,\"y\":%d,\"hp\":%d,\"lives\":%d,\"weapon\":%d,\"ammo\":%d,\"cows\":%d}}",
      bb_in_game?"true":"false",bb_running?"true":"false",bb_paused?"true":"false",bb_mode?"roguelite":"original",bb_difficulty,bb_cheated?"true":"false",bb_part,currentLevel,bb_player,bb_players,
      p?p->x-bb_camera_x:0,p?p->y:0,p?p->pv:0,bb_max_hp(),p?p->nb_life:0,p?p->id_arme:0,p?p->ammo:0,p?p->nb_cow_bomb:0,
      (p?p->getScore():0)+(p2?p2->getScore():0),game_flag[FLAG_NB_KILL],offset,bb_camera_x,bb_view_width,bb_view_height,0,bb_view_width,bb_gameplay_frame&&!bb_story_screen?"true":"false",scroll_locked?"true":"false",game_flag[FLAG_TIMER],bb_game_over?"true":"false",bb_completed?"true":"false",p&&p->tire?"true":"false",
      p2?p2->x-bb_camera_x:0,p2?p2->y:0,p2?p2->pv:0,p2?p2->nb_life:0,p2?p2->id_arme:0,p2?p2->ammo:0,p2?p2->nb_cow_bomb:0);
    stateJson.assign(stateBuffer,strlen(stateBuffer)-1);
    stateJson+=game.goShowing()?",\"go\":true":",\"go\":false";
    {int left,right;offscreenThreats(left,right);stateJson+=",\"threats\":["+std::to_string(left)+","+std::to_string(right)+"]";}
    stateJson+=",\"dialogue\":";
    if(bb_in_game && rpg_to_play!=-1){
        stateJson+="{\"bank\":\"";stateJson+=bb_rpg_bank;stateJson+="\",\"panels\":";
        game.rpgPlayer().describe(stateJson);
        stateJson+="}";
    }else stateJson+="null";
    stateJson+="}";
    return stateJson.c_str();
}
}
void bb_push_state(){
    if(app_killed || pending)return;
    EM_ASM({if(Module.onState)Module.onState(UTF8ToString($0));},bb_state_json());
}
void bb_checkpoint(const char* level){
    if(app_killed || pending)return;
    static const char* names[]={"Briefing","Smurf Village I","Briefing","Smurf Village II","Briefing","Duck Hunt","Briefing","Care Bears I","Briefing","Care Bears II","Care Bears III","Briefing","Snorks I","Snorks II","Briefing","Lemmings","Briefing","Video Game World","Briefing","Mario and Luigi","Briefing","The Final Battle"};
    snprintf(currentLevel,sizeof(currentLevel),"%s",bb_part>=0 && bb_part<22?names[bb_part]:level);
    EM_ASM({if(Module.onCheckpoint)Module.onCheckpoint(UTF8ToString($0));},bb_state_json());
}
void bb_level_begin(Couille* p1,Couille* p2){
    scr_w=targetPlayWidth();cameraTracked=false;bb_reset_spawn_accumulator();
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
        pending=0;app_killed=false;bb_running=true;bb_god=false;bb_cheated=false;bb_game_over=bb_completed=false;damageRemainder=0;
        bb_part=bb_start_part;bb_in_game=false;bb_prepare_frame(false);
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
