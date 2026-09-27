#pragma once

#include "ben_maths.h"
#include "globals.h"
#include <algorithm>

// The original arrow animates x in 640-pixel screen space: it enters at -10,
// rests at 640 while bouncing back to 540, and leaves until 800. Map that onto
// the real right edge so it enters and exits off screen at any width.
inline int goArrowScreenX(int authoredX, int width, int spriteWidth, int spotX) {
    const int start = -(spriteWidth - spotX) - 10, end = width + spotX + 10;
    const int bounce = std::min(width, 640) * 100 / 640;
    authoredX = std::clamp(authoredX, -10, 800);
    if (authoredX <= 540) return start + (authoredX + 10) * (width - bounce - start) / 550;
    if (authoredX <= 640) return width - (640 - authoredX) * bounce / 100;
    return width + (authoredX - 640) * (end - width) / 160;
}

class GoArrow {
    enum class Phase { Coming, Bouncing, Leaving, No };
    static const int kNbSprites = 5;
    static const int kSpriteDuration = 4;

   public:
    GoArrow() { Reset(); }

    void Reset() {
        x_ = -10;
        phase_ = Phase::No;
        delay_ = 0;
        anim_step_ = 1;
    }

    void Update() {
        switch (phase_) {
            case Phase::No:
                update_no();
                return;
            case Phase::Coming:
                update_coming();
                return;
            case Phase::Bouncing:
                update_bouncing();
                return;
            case Phase::Leaving:
                update_leaving();
                return;
        }
    }

    void Leave() {
        if (phase_ != Phase::No) {
            phase_ = Phase::Leaving;
        } else {
            delay_ = 0;
        }
    }

    void Come() {
        if (phase_ == Phase::No) {
            phase_ = Phase::Coming;
        }
    }

    void Draw() {
        if (phase_ != Phase::No) {
            const Picture* pic = pbk_misc[81 + anim_step_ / kSpriteDuration];
            pic->BlitTo(backSurface, goArrowScreenX(x_, bb_view_width, pic->xSize(), pic->xSpot()), 150);
        }
    }

   private:
    void update_no() {
        delay_ += 1;
        if (delay_ >= 300) {
            phase_ = Phase::Coming;
        }
    }

    void update_coming() {
        update_anim();
        x_ += 10;
        if (x_ == 640) {
            phase_ = Phase::Bouncing;
            theta_ = 0;
        }
    }

    void update_bouncing() {
        update_anim();

        theta_ = (theta_ + 3) % 360;
        int x = sini(100, theta_);

        if (x < 0) {
            x = -x;
        }

        x_ = 640 - x;
    }

    void update_leaving() {
        update_anim();
        x_ += 10;
        if (x_ > 800) {
            Reset();
        }
    }

    void update_anim() {
        anim_step_ = (anim_step_ + 1) % (kNbSprites * kSpriteDuration);
    }

    Phase phase_;
    int theta_;
    int delay_;
    int x_;
    int anim_step_;
};
