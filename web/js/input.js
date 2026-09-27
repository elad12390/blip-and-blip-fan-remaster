// Gameplay input: keyboard, gamepads and touch sources combine into the native
// input masks. Menus, pause and focus navigation belong to the interface.
import { DEFAULT_BINDINGS, keyMap, padMask } from './bindings.js';

export class Input {
  constructor(send,{onFire,send2,blocked=()=>false}={}) {
    this.send=send;this.send2=send2;this.onFire=onFire;this.blocked=blocked;
    this.sources=new Map();this.sources2=new Map();
    this.active=false;this.coop=false;this.focused=true;this.autoFire=false;
    this.setBindings(DEFAULT_BINDINGS);

    window.addEventListener('keydown',e=>{
      if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)||e.target?.isContentEditable)return;
      if(!this.acceptsInput())return;
      this.lastDevice='keyboard';
      if(this.coop&&this.keys2[e.code]){e.preventDefault();this.sources2.set(e.code,this.keys2[e.code]);this.flush();return;}
      const bit=(this.coop?this.keys1:this.keys)[e.code];if(bit){e.preventDefault();this.set(e.code,bit);}
      else if(e.code==='Enter'||e.code==='NumpadEnter'){e.preventDefault();this.set(e.code,128);}
    });
    window.addEventListener('keyup',e=>{
      if(this.keys[e.code]||this.keys1[e.code]||this.keys2[e.code]||e.code==='Enter'||e.code==='NumpadEnter'){
        if(this.active)e.preventDefault();
        this.sources2.delete(e.code);this.sources.delete(e.code);this.flush();
      }
    });
    window.addEventListener('blur',()=>{this.focused=false;this.releaseAll();});
    window.addEventListener('focus',()=>{this.focused=true;});
    window.addEventListener('pagehide',()=>this.releaseAll());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseAll();});

    this.pollGamepad=()=>{
      const pads=navigator.getGamepads?.()??[];
      if(this.isBlocked())this.releaseAll();
      else if(this.active){
        // Keep browser slots stable: disconnecting P1 must not move P2 into P1.
        const first=padMask(pads[0],this.bindings);
        if(first)this.lastDevice='gamepad';
        this.sources.set('gamepad',first);
        const second=this.coop?padMask(pads[1],this.bindings):0;
        this.sources2.set('gamepad',second);
        this.sources.set('gamepad2-confirm',second&128);
        this.flush();
      }
      requestAnimationFrame(this.pollGamepad);
    };requestAnimationFrame(this.pollGamepad);
  }

  isBlocked(){return !this.focused||document.hidden||this.blocked();}
  acceptsInput(){return this.active&&!this.isBlocked();}

  setBindings(bindings){
    this.bindings=bindings;
    this.keys=keyMap(bindings,'solo');this.keys1=keyMap(bindings,'coop1');this.keys2=keyMap(bindings,'coop2');
    // Keys held under the old mapping would never see a matching release.
    if(this.last!==undefined)this.releaseAll();
  }

  setAutoFire(value){this.autoFire=!!value;this.flush();}

  set(id,bits){this.sources.set(id,bits);this.flush();}
  clear(id){if(this.sources.delete(id))this.flush();}
  flush(){
    let bits=0,bits2=0;
    for(const b of this.sources.values())bits|=b;
    for(const b of this.sources2.values())bits2|=b;
    if(this.autoFire)bits|=16;
    if(!this.acceptsInput()){bits=0;bits2=0;}
    if(bits!==this.last){this.send(bits);this.onFire?.(!!(bits&16));this.last=bits;}
    if(bits2!==this.last2){this.send2?.(bits2);this.last2=bits2;}
  }

  releaseAll(){
    this.sources.clear();this.sources2.clear();
    this.onRelease?.();
    this.flush();
  }
  enable(value){this.active=!!value;this.releaseAll();}
}
