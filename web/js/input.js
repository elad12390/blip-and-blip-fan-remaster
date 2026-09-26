const DEFAULT_KEYS = { ArrowLeft:1,KeyA:1,ArrowRight:2,KeyD:2,ArrowUp:4,KeyW:4,ArrowDown:8,KeyS:8,KeyJ:16,ControlLeft:16,KeyZ:16,Space:32,KeyK:32,AltLeft:32,KeyX:32,KeyL:64,ShiftLeft:64,KeyC:64,Enter:128 };
const P1_COOP = {KeyA:1,KeyD:2,KeyW:4,KeyS:8,KeyF:16,KeyG:32,KeyH:64,Enter:128};
const P2_COOP = {ArrowLeft:1,ArrowRight:2,ArrowUp:4,ArrowDown:8,KeyJ:16,KeyK:32,KeyL:64};
const DIRECTIONS = [2,2|8,8,1|8,1,1|4,4,2|4];
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

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

function capture(element,id){
  // A browser may cancel a pointer between delivery and capture (for example
  // during rotation). Global pointerup/cancel still provide a release fallback.
  try{element.setPointerCapture?.(id);}catch{}
}
function releaseCapture(element,id){
  try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{}
}

export class Input {
  constructor(send,{onPause,onFire,send2}={}) {
    this.send=send;this.send2=send2;this.sources=new Map();this.sources2=new Map();
    this.active=false;this.onFire=onFire;this.coop=false;this.focused=true;this.gamepadPauses=[false,false];
    this.touchOptions={autoFire:false,joystick:'floating',deadzone:.18,radius:54};
    this.actionPointers=new Map();this.buttonStates=new Map();this.stick=null;
    this.pad=document.querySelector('#direction-pad');

    window.addEventListener('keydown',e=>{
      if(/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)||e.target?.isContentEditable||document.querySelector('dialog[open]'))return;
      // Ordinary GUI buttons retain native keyboard activation. Action buttons
      // handle these keys locally and stop propagation before this listener.
      if(e.target?.tagName==='BUTTON'&&(e.code==='Space'||e.code==='Enter'))return;
      if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(!e.repeat)onPause?.();return;}
      if(!this.acceptsInput())return;
      if(this.coop&&P2_COOP[e.code]){e.preventDefault();this.sources2.set(e.code,P2_COOP[e.code]);this.flush();return;}
      const bit=(this.coop?P1_COOP:DEFAULT_KEYS)[e.code];if(bit){e.preventDefault();this.set(e.code,bit);}
    });
    window.addEventListener('keyup',e=>{
      if(DEFAULT_KEYS[e.code]||P1_COOP[e.code]){
        const activatesButton=e.target?.tagName==='BUTTON'&&(e.code==='Space'||e.code==='Enter');
        if(this.active&&!activatesButton)e.preventDefault();
        this.sources2.delete(e.code);this.sources.delete(e.code);this.flush();
      }
    });
    window.addEventListener('blur',()=>{this.focused=false;this.releaseAll();});
    window.addEventListener('focus',()=>{this.focused=true;});
    window.addEventListener('pagehide',()=>this.releaseAll());
    window.addEventListener('resize',()=>this.releaseAll());
    window.addEventListener('orientationchange',()=>this.releaseAll());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseAll();});

    for(const [index,button] of [...document.querySelectorAll('[data-input]')].entries()){
      const state={button,bit:Number(button.dataset.input),pointers:new Set(),keys:new Set(),keySource:`button-key-${index}`};
      this.buttonStates.set(button,state);
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();
        if(!this.acceptsInput()||(e.button!==undefined&&e.button!==0)||this.actionPointers.has(e.pointerId)||this.stick?.id===e.pointerId)return;
        this.actionPointers.set(e.pointerId,state);state.pointers.add(e.pointerId);
        capture(button,e.pointerId);this.set(`touch${e.pointerId}`,state.bit);this.updateButton(state);
      });
      for(const event of ['pointerup','pointercancel','lostpointercapture']){
        button.addEventListener(event,e=>this.releasePointer(e.pointerId));
      }
      button.addEventListener('keydown',e=>{
        if(e.code!=='Space'&&e.code!=='Enter')return;
        e.preventDefault();e.stopPropagation();
        if(!this.acceptsInput())return;
        state.keys.add(e.code);this.set(state.keySource,state.bit);this.updateButton(state);
      });
      button.addEventListener('keyup',e=>{
        if(e.code!=='Space'&&e.code!=='Enter')return;
        e.preventDefault();e.stopPropagation();state.keys.delete(e.code);
        if(!state.keys.size)this.clear(state.keySource);
        this.updateButton(state);
      });
      button.addEventListener('blur',()=>{
        state.keys.clear();this.clear(state.keySource);this.updateButton(state);
      });
      button.addEventListener('contextmenu',e=>e.preventDefault());
      this.updateButton(state);
    }

    this.pad?.addEventListener('pointerdown',e=>{
      e.preventDefault();
      // The first contact owns the stick until release. Another finger in this
      // generous target can never jump, reverse aim, or steal movement.
      if(!this.acceptsInput()||this.stick||(e.button!==undefined&&e.button!==0)||this.actionPointers.has(e.pointerId))return;
      const rect=this.pad.getBoundingClientRect();
      const fixed=this.touchOptions.joystick==='fixed';
      const x=fixed?rect.width/2:e.clientX-rect.left;
      const y=fixed?rect.height/2:e.clientY-rect.top;
      this.stick={id:e.pointerId,x,y,sector:null};
      this.pad.style.setProperty('--stick-x',`${x}px`);
      this.pad.style.setProperty('--stick-y',`${y}px`);
      this.pad.style.setProperty('--stick-radius',`${this.touchOptions.radius}px`);
      this.pad.classList.add('engaged');capture(this.pad,e.pointerId);this.updatePad(e);
    });
    this.pad?.addEventListener('pointermove',e=>{
      if(this.stick?.id!==e.pointerId)return;
      e.preventDefault();this.updatePad(e);
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture']){
      this.pad?.addEventListener(event,e=>this.releasePointer(e.pointerId));
    }
    this.pad?.addEventListener('contextmenu',e=>e.preventDefault());
    // This also handles a capture failure or a pointer released outside its
    // original target. Releasing the same pointer twice is intentionally safe.
    window.addEventListener('pointerup',e=>this.releasePointer(e.pointerId));
    window.addEventListener('pointercancel',e=>this.releasePointer(e.pointerId));

    this.pollGamepad=()=>{
      const pads=navigator.getGamepads?.()??[];
      const blocked=this.isBlocked();
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

  isBlocked(){return !this.focused||document.hidden||!!document.querySelector('dialog[open]');}
  acceptsInput(){return this.active&&!this.isBlocked();}

  setTouchOptions(options={}){
    const previous=this.touchOptions;
    const next={...previous};
    if(typeof options.autoFire==='boolean')next.autoFire=options.autoFire;
    if(options.joystick==='fixed'||options.joystick==='floating')next.joystick=options.joystick;
    if(Number.isFinite(options.deadzone))next.deadzone=clamp(options.deadzone,.1,.4);
    if(Number.isFinite(options.radius))next.radius=clamp(options.radius,32,90);
    this.touchOptions=next;
    if(next.joystick!==previous.joystick||next.radius!==previous.radius||next.deadzone!==previous.deadzone)this.releaseAll();
    this.pad?.style.setProperty('--stick-radius',`${next.radius}px`);
    for(const state of this.buttonStates.values()){
      if(state.bit===16)state.button.classList.toggle('auto-fire',next.autoFire);
    }
    this.flush();
  }

  updatePad(e){
    if(this.stick?.id!==e.pointerId)return;
    if(!this.acceptsInput()){this.releasePointer(e.pointerId);return;}
    const rect=this.pad.getBoundingClientRect(),stick=this.stick;
    const x=e.clientX-rect.left-stick.x,y=e.clientY-rect.top-stick.y;
    const distance=Math.hypot(x,y),radius=this.touchOptions.radius;
    const deadzone=radius*this.touchOptions.deadzone;
    let bits=0;
    // A small radial and angular hysteresis keeps a resting thumb from rapidly
    // flickering between neutral, cardinal aim, and a diagonal.
    if(distance>(stick.sector===null?deadzone:deadzone*.72)){
      const angle=Math.atan2(y,x),step=Math.PI/4;
      let sector=(Math.round(angle/step)+8)%8;
      if(stick.sector!==null){
        const difference=Math.atan2(Math.sin(angle-stick.sector*step),Math.cos(angle-stick.sector*step));
        if(Math.abs(difference)<step/2+Math.PI/30)sector=stick.sector;
      }
      stick.sector=sector;bits=DIRECTIONS[sector];
    }else stick.sector=null;
    const scale=distance>radius?radius/distance:1;
    this.pad.style.setProperty('--dx',`${x*scale}px`);
    this.pad.style.setProperty('--dy',`${y*scale}px`);
    this.set('touch-direction',bits);
  }

  updateButton(state){
    const pressed=state.pointers.size>0||state.keys.size>0;
    state.button.classList.toggle('pressed',pressed);
    state.button.setAttribute?.('aria-pressed',String(pressed));
  }

  resetPad(){
    if(!this.pad)return;
    this.pad.classList.remove('engaged');
    this.pad.style.setProperty('--dx','0px');this.pad.style.setProperty('--dy','0px');
    this.pad.style.removeProperty('--stick-x');this.pad.style.removeProperty('--stick-y');
  }

  releasePointer(id){
    const state=this.actionPointers.get(id);
    if(state){
      this.actionPointers.delete(id);state.pointers.delete(id);
      this.clear(`touch${id}`);this.updateButton(state);releaseCapture(state.button,id);
    }
    if(this.stick?.id===id){
      this.stick=null;this.clear('touch-direction');this.resetPad();releaseCapture(this.pad,id);
    }
  }

  set(id,bits){this.sources.set(id,bits);this.flush();}
  clear(id){if(this.sources.delete(id))this.flush();}
  flush(){
    let bits=0,bits2=0;
    for(const b of this.sources.values())bits|=b;
    for(const b of this.sources2.values())bits2|=b;
    if(this.touchOptions.autoFire)bits|=16;
    if(!this.acceptsInput()){bits=0;bits2=0;}
    if(bits!==this.last){this.send(bits);this.onFire?.(!!(bits&16));this.last=bits;}
    if(bits2!==this.last2){this.send2?.(bits2);this.last2=bits2;}
  }

  releaseAll(){
    const captures=[...this.actionPointers].map(([id,state])=>[state.button,id]);
    if(this.stick)captures.push([this.pad,this.stick.id]);
    // Forget ownership before releasing capture: browsers may synchronously
    // send lostpointercapture, which must not reassert another held source.
    this.actionPointers.clear();this.stick=null;
    this.sources.clear();this.sources2.clear();this.resetPad();
    for(const state of this.buttonStates.values()){
      state.pointers.clear();state.keys.clear();this.updateButton(state);
    }
    for(const [element,id] of captures)releaseCapture(element,id);
    this.flush();
  }
  enable(value){this.active=!!value;this.releaseAll();}
}
