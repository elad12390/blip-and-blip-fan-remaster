#include "graphics.h"
#include "browser_material.h"
#include "browser_bridge.h"
#include <emscripten.h>

#include "errors.h"

extern SDL::Surface* backSurface;

void Graphics::Init() {
    // Game input arrives through the browser bridge. Bind SDL's keyboard
    // handlers to the hidden native canvas so they never swallow page typing.
    SDL_SetHint(SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT, "#native-screen");
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_TIMER | SDL_INIT_EVENTS) == -1) {
        throw std::runtime_error(std::string("Can't initialize SDL") +
                                 SDL_GetError());
    }
}

void Graphics::ToggleFullscreen() { SetGfxMode(x_, y_, d_, !fullscreen_); }
void Graphics::SetGfxMode(int x, int y, int d, bool fullscreen) {
    x_=x; y_=y; d_=d; fullscreen_=false;
    renderer_.reset();
    window_.reset(SDL_ErrWrap(SDL_CreateWindow("Blip & Blop",0,0,x,y,SDL_WINDOW_SHOWN)));
}

SDL::Surface* Graphics::CreatePrimary() {
    /**/
    debug << "CreatePrimary() - Creating a 640 x 480 Surface"
          << "\n";
    return CreateSurface(640, 480, 0);
    // return 0;
}

SDL::Surface* Graphics::CreatePrimary(SDL::Surface*& back) {
    debug << "Graphics::CreatePrimary(SDL::Surface * & back) - Creating a "
             "640x480 surface"
          << "\n";
    SDL::Surface* tmp = CreateSurface(640, 480);
    back = CreateSurface(640, 480);
    tmp->SetBackBuffer(back);
    return tmp;
    // return 0;
}

SDL::Surface* Graphics::CreateSurface(int x, int y) {
    return CreateSurface(x, y, 0);
}

SDL::Surface* Graphics::CreateSurface(int x, int y, int flags) {
    Uint32 rmask, gmask, bmask, amask;

#if SDL_BYTEORDER == SDL_BIG_ENDIAN
    rmask = 0xff000000;
    gmask = 0x00ff0000;
    bmask = 0x0000ff00;
    amask = 0x000000ff;
#else
    rmask = 0x000000ff;
    gmask = 0x0000ff00;
    bmask = 0x00ff0000;
    amask = 0xff000000;
#endif
    SDL_Surface* surf =
        SDL_CreateRGBSurface(0, x, y, 32, rmask, gmask, bmask, amask);

    SDL::Surface* tmp = new SDL::Surface(surf);
    tmp->FillRect(0, 0xFF000000);
    return tmp;
}

SDL_Surface* Graphics::CreateSDLSurface(int x, int y) {
    Uint32 rmask, gmask, bmask, amask;

#if SDL_BYTEORDER == SDL_BIG_ENDIAN
    rmask = 0xff000000;
    gmask = 0x00ff0000;
    bmask = 0x0000ff00;
    amask = 0x000000ff;
#else
    rmask = 0x000000ff;
    gmask = 0x0000ff00;
    bmask = 0x00ff0000;
    amask = 0xff000000;
#endif
    SDL_Surface* surf =
        SDL_CreateRGBSurface(0, x, y, 32, rmask, gmask, bmask, amask);
    return (surf);
}

SDL::Surface* Graphics::LoadBMP(char* file) { return this->LoadBMP(file, 0); }

SDL::Surface* Graphics::LoadBMP(char* file, int flags) {
    /*SDL_Surface *bmp = 0;
      bmp = SDL_LoadBMP(file);
      if (bmp == 0){
      std::cout << SDL_GetError() << std::endl;
      return 0;
      }
      SDL_Texture *tex = 0;
      tex = SDL_CreateTextureFromSurface(ren, bmp);
      SDL_FreeSurface(bmp);
      return new SDL::Surface(tex);*/
    SDL_Surface* bmp = 0;
    bmp = SDL_LoadBMP(file);
    if (bmp == 0) {
        std::cout << SDL_GetError() << std::endl;
        return 0;
    }
    return new SDL::Surface(bmp);
}

bool Graphics::SetColorKey(SDL::Surface* surf, Pixel rgb) {
    SDL_SetColorKey(surf->Get(),
                    SDL_TRUE,
                    SDL_MapRGB(surf->Get()->format,
                               (rgb & 0xFF),
                               ((rgb >> 8) & 0xFF),
                               ((rgb >> 16) & 0xFF)));
    // TODO: set color key
    return true;
}

// Present, then suspend until the display's next frame so simulation steps and
// presentation stay in step with vsync instead of a free-running timer.
EM_ASYNC_JS(void, bb_wait_animation_frame, (), {
    await new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        requestAnimationFrame(finish);
        setTimeout(finish, 50);
    });
});

void Graphics::Flip() {
    bb_present_frame();
    bb_wait_animation_frame();
}
void Graphics::FlipV() { Flip(); }
void Graphics::Clear(int r,int g,int b) {
    if(backSurface)backSurface->FillRect(nullptr,SDL_MapRGBA(backSurface->Get()->format,r,g,b,255));
    Flip();
}
void Graphics::Clear(int c) { Clear((c>>16)&255,(c>>8)&255,c&255); }
void Graphics::Clear(RenderRect r2) {
    if(!backSurface)return;
    Rect r={r2.left,r2.top,r2.right,r2.bottom};
    backSurface->FillRect(&r,r2.dwFillColor);
    Flip();
}
