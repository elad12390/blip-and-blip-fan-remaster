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
