#pragma once
#include <emscripten.h>
class Couille;
extern int bb_mode, bb_part, bb_start_part, bb_player, bb_players;
extern int bb_armor, bb_firepower, bb_supply;
extern bool bb_running, bb_paused, bb_game_over, bb_completed, bb_in_game;
int bb_input(int player, int bit);
int bb_max_hp();
int bb_bonus_damage(int base);
void bb_yield();
void bb_run();
void bb_checkpoint(const char* level);
void bb_level_begin(Couille* p1, Couille* p2);
void bb_death();
void bb_complete();
extern "C" const char* bb_state_json();
// Sends the current state to the browser immediately (dialogue changes).
void bb_push_state();
// File name of the level's dialogue portrait bank, e.g. "snufrpg.gfx".
extern char bb_rpg_bank[32];

// The gameplay camera is the play window: [offset, offset + scr_w). The browser
// requests the window width; see scr_w in globals.h.
extern int bb_view_width, bb_view_height, bb_camera_x;
extern bool bb_gameplay_frame;
void bb_prepare_frame(bool gameplay);
void bb_present_frame();
void bb_update_play_width();
extern "C" void bb_set_viewport(int width, int height);
