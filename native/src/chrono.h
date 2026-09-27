#pragma once

#include <cassert>
#include <cstdint>

#include <SDL2/SDL.h>

// Game clock: real milliseconds scaled by the debug time scale (1x normally).
// Every engine timer uses it, so fast-forward speeds up simulation, dialogue
// waits and cinematics together.
std::uint32_t bb_game_ticks();
extern int bb_time_scale_percent;

class Chrono {
   private:
    std::uint32_t start_;
    std::uint32_t saved_elapsed_;

   public:
    Chrono() : start_(bb_game_ticks()), saved_elapsed_(0) {}

    std::uint32_t start() const { return start_; }

    std::uint32_t elapsed() const { return bb_game_ticks() - start_; }
    std::uint32_t saved_elapsed() const { return saved_elapsed_; }

    void Reset() { start_ = bb_game_ticks(); }

    void Stop() { saved_elapsed_ = elapsed(); }
};

class Countdown {
   private:
    std::uint32_t end_;

   public:
    Countdown(int duration) : end_(bb_game_ticks() + duration) {}
    Countdown() : end_(0) {}

    void Reset(int duration) { end_ = bb_game_ticks() + duration; }

    bool is_zero() const { return int(end_) - int(bb_game_ticks()) < 0; }
};
