#include "browser_material.h"
#include <algorithm>
#include <vector>
#include <unordered_map>
#include <cstring>
#include <cstdlib>

namespace {
std::unordered_map<SDL_Surface*, SDL_Surface*> maps;

Uint32 readPixel(SDL_Surface* s,int x,int y) {
  Uint32 value=0;
  std::memcpy(&value,static_cast<unsigned char*>(s->pixels)+y*s->pitch+x*s->format->BytesPerPixel,s->format->BytesPerPixel);
  return value;
}

SDL_Surface* material(SDL_Surface* source) {
  if(!source) return nullptr;
  const auto existing=maps.find(source);
  if(existing!=maps.end())return existing->second;
  SDL_Surface* out=SDL_CreateRGBSurfaceWithFormat(0,source->w,source->h,32,SDL_PIXELFORMAT_ABGR8888);
  if(!out)return nullptr;
  const int w=source->w,h=source->h;
  std::vector<unsigned char> alpha(w*h),lum(w*h),distance(w*h,12);
  Uint32 key=0;const bool keyed=SDL_GetColorKey(source,&key)==0;
  bool transparent=false;
  if(SDL_MUSTLOCK(source))SDL_LockSurface(source);
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const Uint32 pixel=readPixel(source,x,y);Uint8 r,g,b,a;
    SDL_GetRGBA(pixel,source->format,&r,&g,&b,&a);
    if(keyed&&pixel==key)a=0;
    const int i=y*w+x;alpha[i]=a;lum[i]=(54*r+183*g+19*b)>>8;
    if(a<8){distance[i]=0;transparent=true;}
  }
  if(SDL_MUSTLOCK(source))SDL_UnlockSurface(source);
  if(transparent){
    for(int y=0;y<h;y++)for(int x=0;x<w;x++){
      const int i=y*w+x;
      if(x)distance[i]=std::min<int>(distance[i],distance[i-1]+1);
      if(y)distance[i]=std::min<int>(distance[i],distance[i-w]+1);
    }
    for(int y=h-1;y>=0;y--)for(int x=w-1;x>=0;x--){
      const int i=y*w+x;
      if(x<w-1)distance[i]=std::min<int>(distance[i],distance[i+1]+1);
      if(y<h-1)distance[i]=std::min<int>(distance[i],distance[i+w]+1);
    }
  }
  for(int y=0;y<h;y++)for(int x=0;x<w;x++){
    const int i=y*w+x;
    const Uint8 relief=transparent?54+lum[i]*62/255+std::min<int>(distance[i],10)*5:80+lum[i]*85/255;
    Uint32 pixel=SDL_MapRGBA(out->format,relief,relief,relief,alpha[i]);
    std::memcpy(static_cast<unsigned char*>(out->pixels)+y*out->pitch+x*4,&pixel,4);
  }
  SDL_SetSurfaceBlendMode(out,SDL_BLENDMODE_BLEND);
  maps.emplace(source,out);return out;
}
}

void bb_material_blit(SDL_Surface* source,const SDL_Rect* sr,SDL_Surface* destination,const SDL_Rect* dr){
  SDL_Surface* sm=material(source);SDL_Surface* dm=material(destination);
  if(!sm||!dm)return;
  // Underwater distortion moves strips within the same surface. Snapshot the
  // material so overlapping source and destination have deterministic results.
  SDL_Surface* snapshot=nullptr;
  if(sm==dm){snapshot=SDL_ConvertSurface(sm,sm->format,0);if(!snapshot)return;sm=snapshot;}
  SDL_Rect copy;if(dr)copy=*dr;
  SDL_BlitSurface(sm,sr,dm,dr?&copy:nullptr);
  if(snapshot)SDL_FreeSurface(snapshot);
}
void bb_material_fill(SDL_Surface* destination,const SDL_Rect* rect,Uint32 color){
  const auto found=maps.find(destination);if(found==maps.end())return;
  Uint8 r,g,b,a;SDL_GetRGBA(color,destination->format,&r,&g,&b,&a);
  const Uint8 relief=80+(54*r+183*g+19*b)*85/(255*256);
  SDL_FillRect(found->second,rect,SDL_MapRGBA(found->second->format,relief,relief,relief,255));
}
void bb_material_forget(SDL_Surface* surface){
  const auto found=maps.find(surface);if(found==maps.end())return;
  SDL_FreeSurface(found->second);maps.erase(found);
}
unsigned char* bb_material_pixels(SDL_Surface* surface){
  SDL_Surface* depth=material(surface);return depth?static_cast<unsigned char*>(depth->pixels):nullptr;
}

bool bb_material_warp_rows(SDL_Surface* surface,const int* offsets,int rows){
  if(!surface || !offsets || rows!=surface->h)return false;
  SDL_Surface* depth=material(surface);
  if(!depth)return false;
  // Reuse allocations, but always snapshot this frame before writing any row.
  // SDL's alpha self-blitter is not a raw overlapping copy and can feed newly
  // written pixels back into later reads. Color and depth must move identically.
  static std::vector<unsigned char> colorBefore,depthBefore;
  const int bytes=surface->format->BytesPerPixel;
  const int depthBytes=depth->format->BytesPerPixel;
  colorBefore.resize(static_cast<size_t>(surface->pitch)*surface->h);
  depthBefore.resize(static_cast<size_t>(depth->pitch)*depth->h);
  const bool lockColor=SDL_MUSTLOCK(surface),lockDepth=SDL_MUSTLOCK(depth);
  if(lockColor && SDL_LockSurface(surface)!=0)return false;
  if(lockDepth && SDL_LockSurface(depth)!=0){if(lockColor)SDL_UnlockSurface(surface);return false;}
  std::memcpy(colorBefore.data(),surface->pixels,colorBefore.size());
  std::memcpy(depthBefore.data(),depth->pixels,depthBefore.size());
  const Uint32 black=SDL_MapRGBA(surface->format,0,0,0,255);
  const Uint32 flat=SDL_MapRGBA(depth->format,80,80,80,255);
  for(int y=0;y<rows;y++){
    const int shift=std::clamp(offsets[y],-surface->w,surface->w);
    const int sourceX=std::max(0,-shift),destinationX=std::max(0,shift);
    const int count=surface->w-std::abs(shift);
    auto* colorRow=static_cast<unsigned char*>(surface->pixels)+static_cast<size_t>(y)*surface->pitch;
    auto* depthRow=static_cast<unsigned char*>(depth->pixels)+static_cast<size_t>(y)*depth->pitch;
    if(count>0){
      std::memcpy(colorRow+destinationX*bytes,colorBefore.data()+static_cast<size_t>(y)*surface->pitch+sourceX*bytes,count*bytes);
      std::memcpy(depthRow+destinationX*depthBytes,depthBefore.data()+static_cast<size_t>(y)*depth->pitch+sourceX*depthBytes,count*depthBytes);
    }
    const int edgeStart=shift>0?0:surface->w+shift;
    const int edgeEnd=shift>0?shift:surface->w;
    for(int x=edgeStart;x<edgeEnd;x++){
      std::memcpy(colorRow+x*bytes,&black,bytes);
      std::memcpy(depthRow+x*depthBytes,&flat,depthBytes);
    }
  }
  if(lockDepth)SDL_UnlockSurface(depth);
  if(lockColor)SDL_UnlockSurface(surface);
  return true;
}
