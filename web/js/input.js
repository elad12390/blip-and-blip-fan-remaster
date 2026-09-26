const DEFAULT_KEYS = { ArrowLeft:1,KeyA:1,ArrowRight:2,KeyD:2,ArrowUp:4,KeyW:4,ArrowDown:8,KeyS:8,KeyJ:16,ControlLeft:16,KeyZ:16,Space:32,KeyK:32,AltLeft:32,KeyX:32,KeyL:64,ShiftLeft:64,KeyC:64,Enter:128 };
const P1_COOP = {KeyA:1,KeyD:2,KeyW:4,KeyS:8,KeyF:16,KeyG:32,KeyH:64,Enter:128};
const P2_COOP = {ArrowLeft:1,ArrowRight:2,ArrowUp:4,ArrowDown:8,KeyJ:16,KeyK:32,KeyL:64};
function gamepadMask(pad){
  if(!pad||pad.connected===false)return 0;
  let bits=0;const [x=0,y=0]=pad.axes??[];
  const pressed=index=>!!pad.buttons[index]?.pressed;
  if(x<-.25||pressed(14))bits|=1;if(x>.25||pressed(15))bits|=2;
  if(y<-.25||pressed(12))bits|=4;if(y>.25||pressed(13))bits|=8;
  if(pressed(2)||pressed(7))bits|=16;if(pressed(0))bits|=32;
  if(pressed(1))bits|=64;
  // Briefings use the shared Enter bit; A/X retain their gameplay actions too.
  if(pressed(0)||pressed(2))bits|=128;
  return bits;
}
export class Input {
  constructor(send,{onPause,onFire,send2}={}) {
    this.send=send;this.send2=send2;this.sources=new Map();this.sources2=new Map();this.active=false;this.onFire=onFire;this.coop=false;this.focused=true;this.gamepadPauses=[false,false];
    window.addEventListener('keydown',e=>{
      if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
      if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(!e.repeat)onPause?.();return;}
      if(!this.active)return;
      if(this.coop&&P2_COOP[e.code]){e.preventDefault();this.sources2.set(e.code,P2_COOP[e.code]);this.flush();return;}
      const bit=(this.coop?P1_COOP:DEFAULT_KEYS)[e.code];if(bit){e.preventDefault();this.set(e.code,bit);}
    });
    window.addEventListener('keyup',e=>{if(DEFAULT_KEYS[e.code]||P1_COOP[e.code]){if(this.active)e.preventDefault();this.sources2.delete(e.code);this.sources.delete(e.code);this.flush();}});
    window.addEventListener('blur',()=>{this.focused=false;this.releaseAll();});
    window.addEventListener('focus',()=>{this.focused=true;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseAll();});
    for(const button of document.querySelectorAll('[data-input]')){
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.set(`touch${e.pointerId}`,Number(button.dataset.input));button.classList.add('pressed');});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{this.clear(`touch${e.pointerId}`);button.classList.remove('pressed');});
    }
    const pad=document.querySelector('#direction-pad');
    pad?.addEventListener('pointerdown',e=>{e.preventDefault();pad.setPointerCapture(e.pointerId);this.updatePad(e,pad);});
    pad?.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))this.updatePad(e,pad);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])pad?.addEventListener(event,e=>{this.clear(`pad${e.pointerId}`);pad.style.setProperty('--dx','0px');pad.style.setProperty('--dy','0px');});
    this.pollGamepad=()=>{
      const pads=navigator.getGamepads?.()??[];
      const blocked=!this.focused||document.hidden||document.querySelector('dialog[open]');
      let pausePressed=false;
      for(let player=0;player<2;player++){
        const pressed=!!(pads[player]?.connected!==false&&pads[player]?.buttons[9]?.pressed);
        if(pressed&&!this.gamepadPauses[player]&&(player===0||this.coop))pausePressed=true;
        // Sample while blocked too, so closing a modal cannot apply a stale Start.
        this.gamepadPauses[player]=pressed;
      }
      if(pausePressed&&!blocked)onPause?.();
      if(blocked)this.releaseAll();
      else if(this.active){
        // Keep browser slots stable: disconnecting P1 must not move P2 into P1.
        this.sources.set('gamepad',gamepadMask(pads[0]));
        const second=this.coop?gamepadMask(pads[1]):0;
        this.sources2.set('gamepad',second);
        this.sources.set('gamepad2-confirm',second&128);
        this.flush();
      }
      requestAnimationFrame(this.pollGamepad);
    };requestAnimationFrame(this.pollGamepad);
  }
  updatePad(e,pad){const r=pad.getBoundingClientRect();const x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);let bits=0;if(x<-.22)bits|=1;if(x>.22)bits|=2;if(y<-.28)bits|=4;if(y>.28)bits|=8;this.set(`pad${e.pointerId}`,bits);pad.style.setProperty('--dx',`${Math.max(-30,Math.min(30,x*30))}px`);pad.style.setProperty('--dy',`${Math.max(-30,Math.min(30,y*30))}px`);}
  set(id,bits){this.sources.set(id,bits);this.flush();}
  clear(id){if(this.sources.delete(id))this.flush();}
  flush(){let bits=0,bits2=0;for(const b of this.sources.values())bits|=b;for(const b of this.sources2.values())bits2|=b;if(!this.active||!this.focused||document.hidden||document.querySelector('dialog[open]')){bits=0;bits2=0;}if(bits!==this.last){this.send(bits);this.onFire?.(!!(bits&16));this.last=bits;}if(bits2!==this.last2){this.send2?.(bits2);this.last2=bits2;}}
  releaseAll(){this.sources.clear();this.sources2.clear();this.flush();}
  enable(value){this.active=value;this.releaseAll();}
}
