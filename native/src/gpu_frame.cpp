#include "gpu_frame.h"

#include <algorithm>
#include <unordered_map>
#include <vector>

namespace bbgpu {
namespace {

struct Entry {
    int32_t id = 0;
    uint32_t generation = 1, sentGeneration = 0;
    // Identity check: a freed surface's address can be reused by a new one.
    const void* pixels = nullptr;
    int w = 0, h = 0, pitch = 0;
    SDL_Rect dirty{0, 0, 0, 0};
};

bool gEnabled = false;
SDL_Surface* gTarget = nullptr;
int gForceCpu = 0;
int32_t gNextId = 1;
std::unordered_map<const SDL_Surface*, Entry> gEntries;
std::vector<int32_t> gCommands, gForgotten;

SDL_Rect wholeSurface(const SDL_Surface* s) { return SDL_Rect{0, 0, s->w, s->h}; }

void unite(SDL_Rect& into, const SDL_Rect& add) {
    if (add.w <= 0 || add.h <= 0) return;
    if (into.w <= 0 || into.h <= 0) { into = add; return; }
    const int x0 = std::min(into.x, add.x), y0 = std::min(into.y, add.y);
    const int x1 = std::max(into.x + into.w, add.x + add.w), y1 = std::max(into.y + into.h, add.y + add.h);
    into = SDL_Rect{x0, y0, x1 - x0, y1 - y0};
}

bool clip(SDL_Rect& r, int w, int h) {
    const int x0 = std::max(r.x, 0), y0 = std::max(r.y, 0);
    const int x1 = std::min(r.x + r.w, w), y1 = std::min(r.y + r.h, h);
    r = SDL_Rect{x0, y0, x1 - x0, y1 - y0};
    return r.w > 0 && r.h > 0;
}

void release(const Entry& entry) {
    if (entry.sentGeneration) gForgotten.push_back(entry.id);
}

Entry& entryFor(SDL_Surface* s) {
    auto found = gEntries.find(s);
    if (found != gEntries.end()) {
        Entry& e = found->second;
        if (e.pixels == s->pixels && e.w == s->w && e.h == s->h && e.pitch == s->pitch) return e;
        release(e);
        gEntries.erase(found);
    }
    Entry e;
    e.id = gNextId++;
    e.pixels = s->pixels; e.w = s->w; e.h = s->h; e.pitch = s->pitch;
    e.dirty = wholeSurface(s);
    return gEntries.emplace(s, e).first->second;
}

void emitUpload(SDL_Surface* s, Entry& e) {
    if (e.sentGeneration == e.generation) return;
    SDL_Rect dirty = e.sentGeneration ? e.dirty : wholeSurface(s);
    if (!clip(dirty, s->w, s->h)) dirty = wholeSurface(s);
    Uint32 key = 0;
    const bool keyed = SDL_GetColorKey(s, &key) == 0;
    const int32_t words[] = {kUpload, e.id, static_cast<int32_t>(reinterpret_cast<uintptr_t>(s->pixels)),
                             s->w, s->h, s->pitch, keyed ? 1 : 0, static_cast<int32_t>(key),
                             dirty.x, dirty.y, dirty.w, dirty.h};
    gCommands.insert(gCommands.end(), std::begin(words), std::end(words));
    e.sentGeneration = e.generation;
    e.dirty = SDL_Rect{0, 0, 0, 0};
}

}  // namespace

void setEnabled(bool enabled) {
    if (enabled && !gEnabled) invalidateAll();
    gEnabled = enabled;
}
bool enabled() { return gEnabled; }

void beginFrame(SDL_Surface* target) {
    gCommands.clear();
    gTarget = gEnabled && !gForceCpu ? target : nullptr;
}
bool recording() { return gTarget != nullptr; }
bool isTarget(const SDL_Surface* surface) { return gTarget && surface == gTarget; }
void endFrame() {
    gTarget = nullptr;
    gCommands.clear();
}
void clearForgotten() { gForgotten.clear(); }

ForceCpu::ForceCpu() { ++gForceCpu; }
ForceCpu::~ForceCpu() { --gForceCpu; }

void blit(SDL_Surface* source, const SDL_Rect* sourceRect, int dx, int dy) {
    if (!gTarget || !source || source == gTarget) return;
    SDL_Rect r = sourceRect ? *sourceRect : wholeSurface(source);
    // SDL clips the source rectangle to the source surface and moves the
    // destination by the same amount; match that exactly.
    const int cutLeft = std::max(0, -r.x), cutTop = std::max(0, -r.y);
    if (!clip(r, source->w, source->h)) return;
    Entry& e = entryFor(source);
    emitUpload(source, e);
    const int32_t words[] = {kBlit, e.id, r.x, r.y, r.w, r.h, dx + cutLeft, dy + cutTop};
    gCommands.insert(gCommands.end(), std::begin(words), std::end(words));
}

void fill(const SDL_Rect* rect, Uint32 abgr) {
    if (!gTarget) return;
    const SDL_Rect r = rect ? *rect : wholeSurface(gTarget);
    if (r.w <= 0 || r.h <= 0) return;
    const int32_t words[] = {kFill, r.x, r.y, r.w, r.h, static_cast<int32_t>(abgr)};
    gCommands.insert(gCommands.end(), std::begin(words), std::end(words));
}

void warp(int phase, int amplitude) {
    if (!gTarget) return;
    const int32_t words[] = {kWarp, phase, amplitude};
    gCommands.insert(gCommands.end(), std::begin(words), std::end(words));
}

void shade(int litLeft, int litRight, int ramp, int dimAlpha) {
    if (!gTarget) return;
    const int32_t words[] = {kShade, litLeft, litRight, ramp, dimAlpha};
    gCommands.insert(gCommands.end(), std::begin(words), std::end(words));
}

void touched(SDL_Surface* surface, const SDL_Rect* rect) {
    if (!surface || surface == gTarget) return;
    auto found = gEntries.find(surface);
    if (found == gEntries.end()) return;  // never uploaded: first use sends it whole
    Entry& e = found->second;
    ++e.generation;
    unite(e.dirty, rect ? *rect : wholeSurface(surface));
}

void forget(SDL_Surface* surface) {
    auto found = gEntries.find(surface);
    if (found == gEntries.end()) return;
    release(found->second);
    gEntries.erase(found);
}

void invalidateAll() {
    for (auto& [surface, e] : gEntries) {
        e.sentGeneration = 0;
        e.dirty = wholeSurface(surface);
    }
}

const int32_t* commands() { return gCommands.data(); }
int commandCount() { return static_cast<int>(gCommands.size()); }
const int32_t* forgotten() { return gForgotten.data(); }
int forgottenCount() { return static_cast<int>(gForgotten.size()); }

}  // namespace bbgpu
