import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../web/js/input.js';

// Real Input runs against event-delivery and geometry adapters only. This keeps
// multi-pointer ownership and browser interruption regressions reproducible.
function target(rect={left:0,top:0,width:200,height:180}){
  const listeners=new Map(),classes=new Set(),styles=new Map(),attributes=new Map(),captures=new Set();
  const element={
    tagName:'DIV',dataset:{},rect,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    dispatch(type,fields={}){
      const event={target:element,pointerId:1,clientX:100,clientY:90,button:0,repeat:false,
        preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...fields};
      for(const fn of listeners.get(type)??[])fn(event);
      return event;
    },
    getBoundingClientRect(){return element.rect;},
    setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);},
    classList:{add(value){classes.add(value);},remove(value){classes.delete(value);},contains(value){return classes.has(value);},toggle(value,on){if(on)classes.add(value);else classes.delete(value);}},
    style:{setProperty(key,value){styles.set(key,value);},removeProperty(key){styles.delete(key);},getPropertyValue(key){return styles.get(key)??'';}},
    setAttribute(key,value){attributes.set(key,value);},getAttribute(key){return attributes.get(key);},
  };
  return element;
}
function harness(t){
  const win=target(),doc=target(),pad=target({left:12,top:400,width:200,height:180});
  const buttons=[16,32,64,128].map(bit=>Object.assign(target(),{tagName:'BUTTON',dataset:{input:String(bit)}}));
  const frames=[];let dialogOpen=false;
  Object.assign(doc,{hidden:false,querySelectorAll:()=>buttons,querySelector(selector){return selector==='#direction-pad'?pad:selector==='dialog[open]'&&dialogOpen?{}:null;}});
  for(const [name,value] of Object.entries({window:win,document:doc,navigator:{getGamepads:()=>[]},requestAnimationFrame:callback=>frames.push(callback)})){
    const original=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
    t.after(()=>original?Object.defineProperty(globalThis,name,original):delete globalThis[name]);
  }
  const masks=[],masks2=[],input=new Input(mask=>masks.push(mask),{send2:mask=>masks2.push(mask)});
  input.enable(true);
  return {win,doc,pad,fire:buttons[0],jump:buttons[1],cow:buttons[2],confirm:buttons[3],input,masks,masks2,
    pointer(type,x,y,id=1){return pad.dispatch(type,{clientX:pad.rect.left+x,clientY:pad.rect.top+y,pointerId:id});},
    frame(){for(const callback of frames.splice(0))callback();},
    setDialog(value){dialogOpen=value;},mask:()=>masks.at(-1),
  };
}

test('floating joystick starts under the thumb anywhere in its touch zone and covers all eight directions',t=>{
  const h=harness(t);
  h.pointer('pointerdown',37,140);
  assert.equal(h.mask(),0,'touching does not jerk the player toward the fixed center');
  assert.equal(h.pad.style.getPropertyValue('--stick-x'),'37px');
  assert.equal(h.pad.style.getPropertyValue('--stick-y'),'140px');
  assert.equal(h.pad.classList.contains('engaged'),true);
  const directions=[[50,0,2],[50,50,2|8],[0,50,8],[-50,50,1|8],[-50,0,1],[-50,-50,1|4],[0,-50,4],[50,-50,2|4]];
  for(const [x,y,mask] of directions){h.pointer('pointermove',37+x,140+y);assert.equal(h.mask(),mask);}
  h.pointer('pointerup',37,140);
  assert.equal(h.mask(),0);assert.equal(h.pad.classList.contains('engaged'),false);
  assert.equal(h.pad.style.getPropertyValue('--stick-x'),'');
  assert.equal(h.pad.style.getPropertyValue('--dx'),'0px');
});

test('one pointer owns movement while fire, jump and cow remain independent simultaneous actions',t=>{
  const h=harness(t);
  h.pointer('pointerdown',90,80,10);h.pointer('pointermove',130,40,10);
  h.pointer('pointerdown',20,160,11);h.pointer('pointermove',0,170,11);
  assert.equal(h.mask(),2|4,'a second pad touch cannot steal or combine movement');
  h.fire.dispatch('pointerdown',{pointerId:12});h.jump.dispatch('pointerdown',{pointerId:13});h.cow.dispatch('pointerdown',{pointerId:14});
  assert.equal(h.mask(),2|4|16|32|64);
  h.pointer('pointerup',0,170,11);assert.equal(h.mask(),2|4|16|32|64,'unowned pointer release does not reset the stick');
  h.jump.dispatch('pointerup',{pointerId:13});assert.equal(h.mask(),2|4|16|64);
  h.fire.dispatch('pointerup',{pointerId:12});assert.equal(h.mask(),2|4|64);
  h.cow.dispatch('pointerup',{pointerId:14});assert.equal(h.mask(),2|4);
  h.pointer('pointerup',130,40,10);assert.equal(h.mask(),0);
});

test('releasing one of two fingers on fire preserves its held state until the last finger lifts',t=>{
  const h=harness(t);
  h.fire.dispatch('pointerdown',{pointerId:1});h.fire.dispatch('pointerdown',{pointerId:2});
  h.fire.dispatch('pointerup',{pointerId:1});
  assert.equal(h.mask(),16);assert.equal(h.fire.classList.contains('pressed'),true);assert.equal(h.fire.getAttribute('aria-pressed'),'true');
  h.fire.dispatch('lostpointercapture',{pointerId:2});
  assert.equal(h.mask(),0);assert.equal(h.fire.classList.contains('pressed'),false);assert.equal(h.fire.getAttribute('aria-pressed'),'false');
});

test('canceled captures, lost captures, and outside pointer releases reset held controls and visuals',t=>{
  const h=harness(t);
  for(const event of ['pointercancel','lostpointercapture']){
    h.pointer('pointerdown',80,80);h.pointer('pointermove',140,80);
    h.fire.dispatch('pointerdown',{pointerId:2});
    h.pad.dispatch(event,{pointerId:1});h.fire.dispatch(event,{pointerId:2});
    assert.equal(h.mask(),0);assert.equal(h.pad.classList.contains('engaged'),false);assert.equal(h.fire.classList.contains('pressed'),false);
  }
  h.fire.setPointerCapture=()=>{throw Error('pointer already canceled');};
  h.fire.dispatch('pointerdown',{pointerId:99});assert.equal(h.mask(),16);
  h.win.dispatch('pointerup',{pointerId:99});assert.equal(h.mask(),0,'global release covers browsers refusing capture');
});

test('pause cancels capture ownership so old moves and release events cannot restore controls after resume',t=>{
  const h=harness(t);
  h.pointer('pointerdown',90,90);h.pointer('pointermove',140,90);h.fire.dispatch('pointerdown',{pointerId:2});
  h.input.enable(false);
  assert.equal(h.mask(),0);assert.equal(h.pad.hasPointerCapture(1),false);assert.equal(h.fire.hasPointerCapture(2),false);
  assert.equal(h.fire.getAttribute('aria-pressed'),'false');
  h.input.enable(true);h.pointer('pointermove',150,90);h.fire.dispatch('pointerup',{pointerId:2});
  assert.equal(h.mask(),0);assert.equal(h.input.stick,null);
});

test('touches begun while inactive, hidden, blurred or under a modal are never retained',t=>{
  const h=harness(t);
  const touch=()=>{h.pointer('pointerdown',80,80);h.pointer('pointermove',130,80);h.fire.dispatch('pointerdown',{pointerId:2});};
  const clean=()=>{assert.equal(h.mask(),0);assert.equal(h.input.stick,null);assert.equal(h.fire.classList.contains('pressed'),false);};
  h.input.enable(false);touch();h.input.enable(true);clean();
  h.doc.hidden=true;touch();h.doc.hidden=false;h.frame();clean();
  h.win.dispatch('blur');touch();h.win.dispatch('focus');h.frame();clean();
  h.setDialog(true);touch();h.setDialog(false);h.frame();clean();
});

test('opening a modal, losing visibility and rotating release every manual touch source',t=>{
  const h=harness(t);
  const hold=()=>{h.pointer('pointerdown',80,80);h.pointer('pointermove',130,80);h.fire.dispatch('pointerdown',{pointerId:2});h.jump.dispatch('pointerdown',{pointerId:3});assert.equal(h.mask(),2|16|32);};
  const clean=()=>{assert.equal(h.mask(),0);assert.equal(h.fire.classList.contains('pressed'),false);assert.equal(h.jump.classList.contains('pressed'),false);assert.equal(h.pad.classList.contains('engaged'),false);};
  hold();h.setDialog(true);h.frame();clean();h.setDialog(false);h.frame();clean();
  hold();h.doc.hidden=true;h.doc.dispatch('visibilitychange');clean();h.doc.hidden=false;
  for(const event of ['orientationchange','resize','pagehide']){hold();h.win.dispatch(event);clean();h.pointer('pointermove',150,80);clean();}
});

test('joystick deadzone and hysteresis suppress resting-thumb and sector-boundary jitter',t=>{
  const h=harness(t);
  h.pointer('pointerdown',80,80);h.pointer('pointermove',88,80);assert.equal(h.mask(),0);
  h.pointer('pointermove',92,80);assert.equal(h.mask(),2);
  h.pointer('pointermove',88,80);assert.equal(h.mask(),2,'small radial retreat stays engaged');
  h.pointer('pointermove',85,80);assert.equal(h.mask(),0,'returning to center reliably releases');
  h.pointer('pointermove',130,80);assert.equal(h.mask(),2);
  h.pointer('pointermove',125,101);assert.equal(h.mask(),2,'a few degrees over a sector edge do not flicker diagonal');
  h.pointer('pointermove',120,120);assert.equal(h.mask(),2|8);
  h.pointer('pointermove',580,580);
  const x=parseFloat(h.pad.style.getPropertyValue('--dx')),y=parseFloat(h.pad.style.getPropertyValue('--dy'));
  assert.ok(Math.abs(Math.hypot(x,y)-54)<.001,'knob stays within its circular travel radius');
});

test('fixed joystick is optional and changing its geometry safely releases existing touches',t=>{
  const h=harness(t);
  h.input.setTouchOptions({joystick:'fixed',radius:40});
  h.pointer('pointerdown',155,90);assert.equal(h.mask(),2);
  assert.equal(h.pad.style.getPropertyValue('--stick-x'),'100px');
  assert.equal(h.pad.style.getPropertyValue('--stick-y'),'90px');
  h.input.setTouchOptions({joystick:'floating',radius:54});assert.equal(h.mask(),0);
  h.pointer('pointermove',10,90);assert.equal(h.mask(),0,'old geometry ownership does not return');
  h.input.setTouchOptions({radius:Infinity,deadzone:NaN,joystick:'invalid'});
  assert.equal(h.input.touchOptions.radius,54);assert.equal(h.input.touchOptions.deadzone,.18);assert.equal(h.input.touchOptions.joystick,'floating');
});

test('auto-fire is opt-in, is suppressed by pause and dialogs, and never fires for player two',t=>{
  const h=harness(t);
  h.input.coop=true;h.frame();assert.equal(h.mask(),0,'manual fire remains the default');
  h.input.setTouchOptions({autoFire:true});assert.equal(h.mask(),16);assert.equal(h.masks2.at(-1),0);
  h.jump.dispatch('pointerdown',{pointerId:3});assert.equal(h.mask(),16|32);
  h.input.enable(false);assert.equal(h.mask(),0);h.frame();assert.equal(h.mask(),0);
  h.input.enable(true);assert.equal(h.mask(),16,'resuming respects an explicit auto-fire preference');
  h.setDialog(true);h.frame();assert.equal(h.mask(),0);h.setDialog(false);h.frame();assert.equal(h.mask(),16);
  h.input.setTouchOptions({autoFire:false});assert.equal(h.mask(),0);assert.equal(h.fire.classList.contains('auto-fire'),false);
});

test('accessible action buttons accept Space and Enter without leaking a jump or dialogue key',t=>{
  const h=harness(t);
  const down=h.fire.dispatch('keydown',{code:'Space'});
  assert.equal(down.defaultPrevented,true);assert.equal(down.propagationStopped,true);assert.equal(h.mask(),16);
  h.fire.dispatch('keydown',{code:'Enter'});h.fire.dispatch('keyup',{code:'Space'});assert.equal(h.mask(),16);
  h.fire.dispatch('blur');assert.equal(h.mask(),0);assert.equal(h.fire.getAttribute('aria-pressed'),'false');
});

test('ordinary focused GUI buttons retain native Space and Enter activation without firing game actions',t=>{
  const h=harness(t);
  const guiButton={tagName:'BUTTON'};
  for(const code of ['Space','Enter']){
    const down=h.win.dispatch('keydown',{code,target:guiButton});
    const up=h.win.dispatch('keyup',{code,target:guiButton});
    assert.equal(!!down.defaultPrevented,false);assert.equal(!!up.defaultPrevented,false);
    assert.equal(h.mask(),0,'focused Pause, Fullscreen and Auto fire are GUI actions');
  }
  h.win.dispatch('keydown',{code:'Space',target:{tagName:'CANVAS'}});
  assert.equal(h.mask(),32);
  const release=h.win.dispatch('keyup',{code:'Space',target:guiButton});
  assert.equal(h.mask(),0,'releasing on a newly focused button still clears a held gameplay key');
  assert.equal(!!release.defaultPrevented,false);
});
