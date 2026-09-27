#pragma once
#include <emscripten.h>
class Couille;
extern int bb_mode, bb_part, bb_start_part, bb_player, bb_players;
extern int bb_armor, bb_firepower, bb_supply;
// 0 Easy, 1 Normal, 2 Hard, 3 Insane (all somewhat gentler than the original). Scales how many ordinary
// enemies a stage spawns; bosses and scripted enemies are never touched.
extern int bb_difficulty;
// Console cheats: god mode ignores damage; any cheat marks the run.
extern bool bb_god, bb_cheated;
// Percent of the original ordinary-enemy count for the current difficulty.
int bb_enemy_percent();
int bb_hurt_invincibility();
// Easy halves damage taken (every other point, so 1-damage hits alternate).
int bb_scale_damage(int damage);
// How many copies of one authored ordinary spawn to create (0..n), using a
// per-stage accumulator so the average matches the percentage exactly.
int bb_spawn_copies();
void bb_reset_spawn_accumulator();
// Spawners pause while this many ordinary enemies are alive (per difficulty).
bool bb_spawner_crowded();
extern bool bb_running, bb_paused, bb_game_over, bb_completed, bb_in_game;
int bb_input(int player, int bit);
int bb_max_hp();
int bb_bonus_damage(int base);
void bb_yield();
// True while Game::gameLoop runs simulation steps (no per-step yielding).
extern bool bb_in_simulation_step;
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
// A blocking non-gameplay screen inside a stage (results tally).
extern bool bb_story_screen;
void bb_prepare_frame(bool gameplay);
void bb_present_frame();
void bb_update_play_width();
// Frame timing for the debug console (simulation steps and milliseconds).
void bb_record_timing(int steps, double updateMs, double drawMs);
extern "C" void bb_set_viewport(int width, int height);
