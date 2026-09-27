// Debug console and cheat support (production build). Every cheat marks the
// run as cheated so the browser can exclude it from scores and rewards.
#include "browser_bridge.h"
#include "game.h"
#include "globals.h"
#include "enemy.h"
#include "event.h"
#include "bonus_fusil.h"
#include "bonus_pm.h"
#include "bonus_lf.h"
#include "bonus_laser.h"
#include "tir_bbm16.h"
#include "event_ennemi.h"
#include "chrono.h"
#include <algorithm>
#include <memory>
#include <string>
#include <typeinfo>

extern Game game;
bool bb_god = false, bb_cheated = false;
int bb_time_scale_percent = 100;
static double avgSteps = 0, avgUpdate = 0, avgDraw = 0;
void bb_record_timing(int steps, double updateMs, double drawMs) {
    avgSteps += (steps - avgSteps) * .1; avgUpdate += (updateMs - avgUpdate) * .1; avgDraw += (drawMs - avgDraw) * .1;
}

std::uint32_t bb_game_ticks() {
    static bool started = false;
    static std::uint32_t lastReal = 0;
    static double virtualTicks = 0;
    const std::uint32_t real = SDL_GetTicks();
    if (!started) { started = true; lastReal = real; virtualTicks = real; }
    virtualTicks += double(real - lastReal) * bb_time_scale_percent / 100.0;
    lastReal = real;
    return static_cast<std::uint32_t>(virtualTicks);
}

namespace {
enum Op { kGod = 1, kHealth, kLives, kWeapon, kCows, kFinish, kKill, kAmmo, kScore };

int giveWeapon(Couille* p, int id, int ammo) {
    if (id < 0 || id > 4) return -1;
    // Reset to the default weapon first so pickup priority cannot refuse it.
    p->id_arme = ID_M16; p->ammo = 0; p->latence_arme = 3; p->nb_etape_arme = 5;
    p->cadence_arme = 10; p->poid_arme = 1; p->etape_arme = p->ss_etape_arme = p->etape_recul = 0; p->tire = false;
    switch (id) {
        case ID_FUSIL: { BonusFusil pickup; pickup.estPris(p); break; }
        case ID_PM: { BonusPM pickup; pickup.estPris(p); break; }
        case ID_LF: { BonusLF pickup; pickup.estPris(p); break; }
        case ID_LASER: { BonusLaser pickup; pickup.estPris(p); break; }
    }
    if (id && ammo > 0) p->ammo = std::min(ammo, 9999);
    return p->id_arme;
}

// Hits every counted enemy inside the play window until it dies, through the
// normal damage path so scripted kill counters and flags still advance.
int killVisible() {
    Couille* p = game.browserPlayer(0);
    if (!p) return 0;
    TirBBM16 shot;
    shot.joueur = p;
    shot.x = offset + scr_w / 2; shot.y = 240;
    int killed = 0;
    for (auto& e : list_ennemis) {
        if (!e->count() || e->pv <= 0 || e->x < offset - 20 || e->x > offset + scr_w + 20) continue;
        for (int i = 0; i < 400 && e->pv > 0; i++) e->estTouche(&shot);
        if (e->pv <= 0) killed++;
    }
    return killed;
}
}  // namespace

extern "C" {
EMSCRIPTEN_KEEPALIVE int bb_cheat(int op, int a, int b) {
    if (!bb_in_game) return -1;
    Couille* players[2] = {game.browserPlayer(0), game.browserPlayer(1)};
    int result = 0;
    bb_cheated = true;
    for (Couille* p : players) {
        if (!p) continue;
        switch (op) {
            case kGod: bb_god = a != 0; result = bb_god; break;
            case kHealth: p->pv = std::clamp(a, 1, 100); result = p->pv; break;
            case kLives: p->nb_life = std::clamp(a, 1, 99); result = p->nb_life; break;
            case kWeapon: result = giveWeapon(p, a, b); break;
            case kCows: p->nb_cow_bomb = std::clamp(a, 0, 99); result = p->nb_cow_bomb; break;
            case kAmmo: if (p->id_arme) p->ammo = std::clamp(a, 0, 9999); result = p->ammo; break;
            case kScore: p->setScore(std::max(0, a)); result = a; break;
            default: break;
        }
        if (op == kGod || op == kFinish || op == kKill || op == kScore) break;  // once, not per player
    }
    if (op == kFinish) { game.browserQaFinish(); result = 1; }
    if (op == kKill) result = killVisible();
    return result;
}

// 25..3200 percent. Not a cheat: fast-forward changes speed, not rules.
EMSCRIPTEN_KEEPALIVE int bb_debug_speed(int percent) {
    bb_time_scale_percent = std::clamp(percent, 25, 3200);
    return bb_time_scale_percent;
}

// Entity editing. index -1/-2 = player 1/2, otherwise the list_ennemis index.
// field: 0 x, 1 y, 2 hp, 3 dir, 4 lives (players), 5 remove.
EMSCRIPTEN_KEEPALIVE int bb_debug_entity(int index, int field, int value) {
    if (!bb_in_game) return -1;
    Personnage* target = nullptr;
    if (index < 0) target = game.browserPlayer(index == -2 ? 1 : 0);
    else { int i = 0; for (auto& e : list_ennemis) if (i++ == index) { target = e.get(); break; } }
    if (!target) return -1;
    bb_cheated = true;
    switch (field) {
        case 0: target->x = value; if (index < 0) offset = std::clamp(std::max(offset, value - scr_w / 2), 0, level_size - scr_w); return target->x;
        case 1: target->y = std::clamp(value, 0, 479); return target->y;
        case 2: target->pv = value; return target->pv;
        case 3: target->dir = value ? 1 : 0; return target->dir;
        case 4: if (index < 0) { static_cast<Couille*>(target)->nb_life = std::clamp(value, 1, 99); return value; } return -1;
        case 5: if (index >= 0) { target->a_detruire = true; return 1; } return -1;
    }
    return -1;
}

EMSCRIPTEN_KEEPALIVE int bb_debug_spawn(int id, int x, int y, int dir) {
    if (!bb_in_game) return -1;
    bb_cheated = true;
    const int before = static_cast<int>(list_ennemis.size());
    EventEnnemi e;
    e.id_ennemi = id; e.x = x; e.y = y; e.sens = dir ? 1 : 0;
    const int saved = bb_difficulty; bb_difficulty = 1;
    e.doEvent();
    bb_difficulty = saved;
    return static_cast<int>(list_ennemis.size()) - before;
}

EMSCRIPTEN_KEEPALIVE int bb_debug_flag(int index, int value) {
    if (index < 0 || index > 10) return -1;
    bb_cheated = true; game_flag[index] = value; return value;
}

EMSCRIPTEN_KEEPALIVE int bb_debug_unlock() { bb_cheated = true; const bool was = scroll_locked; scroll_locked = false; return was; }

// Level-progress state for the console and automated playthroughs.
EMSCRIPTEN_KEEPALIVE const char* bb_debug_world_json() {
    static std::string out;
    out = "{\"offset\":" + std::to_string(offset) + ",\"scrW\":" + std::to_string(scr_w) + ",\"levelSize\":" + std::to_string(level_size)
        + ",\"locked\":" + std::to_string(scroll_locked ? 1 : 0) + ",\"lock\":[" + std::to_string(x_lock) + "," + std::to_string(cond_end_lock) + ","
        + std::to_string(flag_end_lock) + "," + std::to_string(val_end_lock) + "]"
        + ",\"scrollSpeed\":" + std::to_string(scroll_speed) + ",\"holdFire\":" + std::to_string(hold_fire ? 1 : 0)
        + ",\"victory\":" + game.victoryJson()
        + ",\"timing\":{\"steps\":" + std::to_string(avgSteps) + ",\"updateMs\":" + std::to_string(avgUpdate) + ",\"drawMs\":" + std::to_string(avgDraw) + "}"
        + ",\"speed\":" + std::to_string(bb_time_scale_percent)
        + ",\"god\":" + std::to_string(bb_god ? 1 : 0) + ",\"cheated\":" + std::to_string(bb_cheated ? 1 : 0)
        + ",\"gens\":" + std::to_string(list_gen_ennemis.size()) + ",\"waiting\":" + std::to_string(list_event.size())
        + ",\"sleeping\":" + std::to_string(list_event_endormis.size())
        + ",\"nextEvent\":" + std::to_string(list_event_endormis.empty() ? -1 : list_event_endormis.back()->x_activation) + ",\"flags\":[";
    for (int i = 0; i < 11; i++) { if (i) out += ","; out += std::to_string(game_flag[i]); }
    out += "],\"players\":[";
    for (int n = 0; n < 2; n++) {
        Couille* p = game.browserPlayer(n);
        if (n) out += ",";
        if (!p) { out += "null"; continue; }
        out += "{\"x\":" + std::to_string(p->x) + ",\"y\":" + std::to_string(p->y) + ",\"hp\":" + std::to_string(p->pv)
             + ",\"lives\":" + std::to_string(p->nb_life) + ",\"dir\":" + std::to_string(p->dir) + ",\"state\":" + std::to_string(p->etat)
             + ",\"weapon\":" + std::to_string(p->id_arme) + ",\"ammo\":" + std::to_string(p->ammo) + ",\"invincible\":" + std::to_string(p->invincible) + "}";
    }
    out += "],\"enemies\":[";
    bool first = true;
    int index = 0;
    for (auto& e : list_ennemis) {
        if (!first) out += ",";
        first = false;
        std::string name = typeid(*e).name();
        const auto start = name.find_first_not_of("0123456789");
        name = name.substr(start == std::string::npos ? 0 : start);
        out += "{\"i\":" + std::to_string(index++) + ",\"x\":" + std::to_string(e->x) + ",\"y\":" + std::to_string(e->y) + ",\"pv\":" + std::to_string(e->pv)
             + ",\"dir\":" + std::to_string(e->dir) + ",\"state\":" + std::to_string(e->etat) + ",\"count\":" + std::to_string(e->count() ? 1 : 0) + ",\"type\":\"" + name + "\"}";
    }
    out += "]}";
    return out.c_str();
}
}
