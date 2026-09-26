import { readSave, writeSave, SAVE_KEY, normalizeSave, UPGRADE_DEFS, upgradeCost, purchaseUpgrade, settleRun, checkpointRun, recordScore, getHighScores } from './progression.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Engine } from './engine.js';
import { CAMPAIGN, partName } from './campaign.js';
import { onPress } from './press.js';
const $=selector=>document.querySelector(selector);
let save=readSave(),mode=save.mode,player=0,paused=false,playing=false,runId=null,lastState={},deathActive=false,toastTimer,startAttempt=0,resumedRun=false;
const renderer=new Renderer($('#screen'));
renderer.mode=save.settings.graphics;
const persist=()=>{if(!writeSave(save))toast('Browser storage is unavailable. Export your progress in Credits & preservation notes.');};
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function setMode(value){mode=value;save.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('#progression-summary').hidden=mode!=='roguelite';$('#continue-button').hidden=mode!=='roguelite'||!save.checkpoint;$('#shard-count').textContent=save.shards;persist();}
function setGraphics(value){renderer.mode=value;renderer.present();save.settings.graphics=value;$('#graphics-select').value=value;$('#game-stage').dataset.graphics=value;$('#visual-toggle').textContent=value==='original'?'Lighting: off':value==='depth'?'Depth view':'Lighting: on';persist();}
const coarsePointer=matchMedia('(any-pointer: coarse)');
function setAutoFire(value){
  save.settings.autoFire=value;
  input.setTouchOptions({autoFire:value});
  $('#auto-fire-button').setAttribute('aria-pressed',String(value));
  $('#auto-fire-button span').textContent=value?'ON':'OFF';
  persist();
}
function updateTouch(){
  const show=save.settings.touch==='on'||(save.settings.touch==='auto'&&coarsePointer.matches);
  $('#touch-controls').classList.toggle('show',show);
  const stage=$('#game-stage');
  stage.classList.toggle('touch-active',show);
  stage.classList.toggle('controls-left',save.settings.handedness==='left');
  stage.classList.toggle('controls-large',save.settings.controlSize==='large');
  input.releaseAll();
  input.setTouchOptions({autoFire:save.settings.autoFire,joystick:save.settings.joystick,radius:save.settings.controlSize==='large'?58:52});
  $('#auto-fire-button').setAttribute('aria-pressed',String(save.settings.autoFire));
  $('#auto-fire-button span').textContent=save.settings.autoFire?'ON':'OFF';
  renderer.reducedMotion=save.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  requestAnimationFrame(()=>renderer.resize());
}
const weaponNames=['M16','SHOTGUN','SMG','FLAME','LASER'];
function updateHUD(state){
  const gameplay=!!state.inGame&&state.frameIsGameplay!==false;
  $('#game-stage').classList.toggle('is-gameplay',gameplay);
  $('#game-stage').classList.toggle('coop',state.players===2);
  const seconds=Math.max(0,Math.ceil(state.bonusTimer??0));
  $('#game-stage').classList.toggle('has-timer',gameplay&&seconds>0);
  $('#stage-label').textContent=state.level??partName(state.part);
  const hp=Math.max(0,state.hp??5),maxHp=state.maxHp??5;
  $('#health-status').textContent=`${hp} / ${maxHp}`;
  $('#health-fill').style.width=`${Math.min(100,100*hp/maxHp)}%`;
  $('#health-meter').setAttribute('aria-valuenow',String(hp));
  $('#health-meter').setAttribute('aria-valuemax',String(maxHp));
  $('.hud-vitals').classList.toggle('low-health',hp>0&&hp/maxHp<=.35);
  $('#hud-lives').textContent=`${Math.max(0,state.lives??5)} lives`;
  $('#hud-weapon').textContent=weaponNames[state.weapon??0]??'M16';
  $('#hud-ammo').textContent=state.weapon?String(Math.max(0,state.ammo??0)):'∞';
  $('#hud-score').textContent=String(Math.max(0,state.score??0)).padStart(6,'0');
  $('#hud-cows').textContent=String(Math.max(0,state.cows??0));
  $('#touch-cow-count').textContent=String(Math.max(0,state.cows??0));
  $('#hud-timer').hidden=!gameplay||seconds===0;
  $('#hud-time').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('#hud-partner').hidden=state.players!==2;
  $('#hud-partner-health').textContent=`${Math.max(0,state.player2?.hp??0)} / ${maxHp}`;
  $('#hud-partner-lives').textContent=`${Math.max(0,state.player2?.lives??0)} lives`;
  $('#hud-partner-weapon').textContent=`${weaponNames[state.player2?.weapon??0]} · ${state.player2?.weapon?Math.max(0,state.player2?.ammo??0):'∞'}`;
  $('#hud-partner-cows').textContent=`${Math.max(0,state.player2?.cows??0)} cows`;
}
const engine=new Engine({
  onFrame:(m,...args)=>{renderer.draw(m,...args);$('#loading').hidden=true;},
  onProgress:message=>{if(!message)return;const match=String(message).match(/\((\d+)\/(\d+)\)/);$('#loading-status').textContent=match?`Preparing original assets · ${(Number(match[1])/1048576).toFixed(1)} / ${(Number(match[2])/1048576).toFixed(1)} MiB`:message;if(match)$('#loading-bar').style.width=`${Math.min(100,100*Number(match[1])/Number(match[2]))}%`;},
  onState:state=>{lastState=state;renderer.state=state;updateHUD(state);},
  onCheckpoint:state=>{
    if(mode!=='roguelite')return;
    checkpointRun(save,{...state,part:state.part??0,player,players:input.coop?2:1,mode,runId});persist();
    $('#save-status').textContent='CHECKPOINT SAVED';toast('Checkpoint saved. You can continue from this stage.');
  },
  onDeath:state=>{
    recordScore(save,{...state,id:runId,mode,player,resumed:resumedRun});
    const gained=settleRun(save,{...state,id:runId,mode});persist();pauseGame(true,false);deathActive=true;$('#death-overlay').hidden=false;
    $('#death-reward').textContent=mode==='roguelite'?`You earned ${gained} shards. Your checkpoint and upgrades are safe.`:`Final score: ${(state.score??0).toLocaleString()}. Ready for another try?`;
    $('#death-workshop').hidden=mode!=='roguelite';$('#retry-button').textContent=mode==='roguelite'?'Retry checkpoint':'New campaign';
  },
  onComplete:state=>{
    recordScore(save,{...state,id:runId,mode,player,completed:true,resumed:resumedRun});
    const gained=settleRun(save,{...state,id:runId,mode,completed:true});
    if(mode==='roguelite')save.checkpoint=null;
    persist();pauseGame(true,false);deathActive=true;
    $('#complete-message').textContent=mode==='roguelite'?`Campaign complete. You earned ${gained} shards. Your upgrades carry into your next run.`:'You made it through the original campaign. Thanks for playing.';
    $('#complete-overlay').hidden=false;
  },
  onError:reportError,
});
const input=new Input(mask=>engine.input(mask),{onPause:()=>pauseGame(!paused),onFire:value=>renderer.fire=value,send2:mask=>engine.input2(mask)});
renderer.onViewportChange=({nativeWidth,nativeHeight})=>engine.setViewport(nativeWidth,nativeHeight);
renderer.onContextState=status=>{if(status==='lost'){pauseGame(true);toast('Graphics paused while your device recovers. Your run is safe.');}else toast('Graphics restored. Resume when you’re ready.');};
let layoutFrame;
function updateLayout(){
  cancelAnimationFrame(layoutFrame);
  layoutFrame=requestAnimationFrame(()=>{
    document.documentElement.style.setProperty('--app-height',`${Math.round(window.visualViewport?.height??window.innerHeight)}px`);
    renderer.resize();
  });
}
window.addEventListener('resize',updateLayout);
window.visualViewport?.addEventListener('resize',updateLayout);
coarsePointer.addEventListener('change',updateTouch);
async function start(continueRun=false){
  const attempt=++startAttempt;
  const checkpoint=continueRun&&mode==='roguelite'?save.checkpoint:null;
  resumedRun=!!checkpoint;
  player=checkpoint?.player??Number($('#hero-select').value);
  runId=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;deathActive=false;paused=false;playing=true;$('#home').hidden=true;$('#play').hidden=false;document.body.classList.add('playing');
  $('#pause-overlay').hidden=true;$('#death-overlay').hidden=true;$('#complete-overlay').hidden=true;$('#loading').hidden=true;$('#mode-label').textContent=mode.toUpperCase();$('#pause-workshop').hidden=mode!=='roguelite';
  $('#pause-save-note').textContent=mode==='roguelite'?'Stage checkpoints are saved automatically on this device.':'Original mode uses the original rules. Persistent upgrades are disabled.';
  $('#hud-portrait').src=`assets/${player===1?'blop':'blip'}.png`;
  updateHUD({player,players:checkpoint?.players??Number($('#party-select').value),hp:5,maxHp:5,lives:5});
  updateTouch();updateLayout();renderer.resize();
  $('#loading-title').textContent='Loading the game';$('#loading-exit').hidden=true;$('#save-status').textContent='';
  try{
    if(!engine.ready){$('#loading').hidden=false;await engine.load();}
    if(attempt!==startAttempt||!playing)return;
    input.coop=(checkpoint?.players??Number($('#party-select').value))===2;engine.start({mode,player,part:checkpoint?.part??0,upgrades:save.upgrades,players:input.coop?2:1});engine.volume(save.settings.volume);engine.pause(false);input.enable(true);$('#screen').focus();
  }catch(error){if(attempt===startAttempt&&playing)reportError(error);}
}
function reportError(error){console.error(error);$('#loading').hidden=false;$('#loading-title').textContent='Could not start the game';$('#loading-status').textContent=error?.message||'The browser game encountered an initialization error. Please return to the title and retry.';$('#loading-bar').style.width='0';$('#loading-exit').hidden=false;input.enable(false);}
function pauseGame(value,showOverlay=true){if(!playing||deathActive)return;paused=value;input.enable(!value);engine.pause(value);$('#pause-overlay').hidden=!value||!showOverlay;if(!value)$('#screen').focus();}
function title(){startAttempt++;engine.stop();input.enable(false);playing=false;paused=false;deathActive=false;$('#play').hidden=true;$('#home').hidden=false;document.body.classList.remove('playing');setMode(mode);window.scrollTo(0,0);}
function workshop(){
  $('#workshop-shards').textContent=save.shards;
  $('#upgrade-list').replaceChildren(...UPGRADE_DEFS.map(def=>{
    const node=document.createElement('div');node.className='upgrade-card';
    const rank=save.upgrades[def.id],cost=upgradeCost(save,def.id),maxed=rank>=def.max;
    node.innerHTML=`<h3>${def.name}</h3><p>${def.description}</p><span class="rank">${'●'.repeat(rank)}${'○'.repeat(def.max-rank)} &nbsp; ${rank} / ${def.max}</span><button data-upgrade="${def.id}" ${maxed||save.shards<cost?'disabled':''}>${maxed?'MAXED':`${cost} ◈`}</button>`;
    node.querySelector('button').addEventListener('click',()=>{if(purchaseUpgrade(save,def.id)){persist();workshop();}});return node;
  }));
  $('#workshop-continue').textContent=playing&&!$('#death-overlay').hidden?'Return to checkpoint →':'Done →';
  if(!$('#workshop-dialog').open)$('#workshop-dialog').showModal();
}
function showInfo(content){$('#info-content').innerHTML=content;$('#info-dialog').showModal();}
function scores(){
  showInfo('<p class="eyebrow">PERSONAL BESTS</p><h2>Hall of steel.</h2><p>Scores are kept on this device. Each mode has its own board. Runs resumed from a checkpoint are unranked.</p><div id="score-boards"></div>');
  for(const kind of ['original','roguelite']){
    const section=document.createElement('section'),heading=document.createElement('h3');heading.textContent=kind==='original'?'Original':'Roguelite';section.append(heading);
    const rows=getHighScores(save,kind);
    if(!rows.length){const p=document.createElement('p');p.textContent='Your first score goes here.';section.append(p);}
    else{const table=document.createElement('table');table.className='controls-table';rows.forEach((entry,index)=>{const tr=table.insertRow();tr.insertCell().textContent=`${index+1}. ${entry.name}${entry.players===2?' · co-op':''}${entry.completed?' ★':''}`;tr.insertCell().textContent=entry.score.toLocaleString();});section.append(table);}
    $('#score-boards').append(section);
  }
}
function controls(){
  showInfo(`<p class="eyebrow">MAKE IT YOURS</p><h2>Your screen.<br>Your controls.</h2><p>Drag anywhere in the move zone to move and aim. Hold Fire, and tap Jump with another finger. All controls work together.</p>
    <div class="settings-grid">
      <label class="setting-row"><span>Touch controller<small>Show it on any device.</small></span><select id="touch-setting"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hidden</option></select></label>
      <label class="setting-row"><span>Button size<small>More room for your thumbs.</small></span><select id="size-setting"><option value="comfortable">Comfortable</option><option value="large">Extra large</option></select></label>
      <label class="setting-row"><span>Fire with<small>Mirror the entire controller.</small></span><select id="hand-setting"><option value="right">Right thumb</option><option value="left">Left thumb</option></select></label>
      <label class="setting-row"><span>Joystick<small>Floating starts where you touch.</small></span><select id="joystick-setting"><option value="floating">Floating</option><option value="fixed">Fixed position</option></select></label>
      <label class="setting-row"><span>Auto fire<small>Keep shooting while you move and jump.</small></span><input id="autofire-setting" type="checkbox"></label>
      <label class="setting-row"><span>Graphics<small>Same world, your preferred finish.</small></span><select id="display-setting"><option value="enhanced">Enhanced lighting</option><option value="original">Original pixels</option><option value="depth">Depth view</option></select></label>
      <label class="setting-row"><span>Gentler effects<small>Reduce flashes and animated light.</small></span><input id="motion-setting" type="checkbox"></label>
    </div>
    <p class="settings-note">Rotate whenever you like. The camera and controls adapt automatically, and your preferences are saved on this device.</p>
    <details><summary>Keyboard & gamepad controls</summary><table class="controls-table"><tr><td>Move & aim</td><td><kbd>ARROWS</kbd> / <kbd>WASD</kbd></td></tr><tr><td>Fire</td><td><kbd>J</kbd> / <kbd>Z</kbd></td></tr><tr><td>Jump</td><td><kbd>SPACE</kbd> / <kbd>K</kbd></td></tr><tr><td>Cow bomb</td><td><kbd>L</kbd> / <kbd>C</kbd></td></tr><tr><td>Continue dialogue</td><td><kbd>ENTER</kbd></td></tr><tr><td>Pause</td><td><kbd>ESC</kbd> / <kbd>P</kbd></td></tr></table><p><b>Local co-op:</b> P1 uses WASD + F / G / H. P2 uses arrows + J / K / L.</p><p><b>Gamepad:</b> left stick / D-pad to move, X or right trigger to fire, A to jump, B for a cow bomb, Start to pause.</p></details>
    <button id="settings-done" class="primary-button settings-done">Done <span>✓</span></button>`);
  for(const [id,key] of [['touch-setting','touch'],['size-setting','controlSize'],['hand-setting','handedness'],['joystick-setting','joystick']]){
    const select=$(`#${id}`);select.value=save.settings[key];
    select.onchange=()=>{save.settings[key]=select.value;persist();updateTouch();};
  }
  for(const [id,key] of [['autofire-setting','autoFire'],['motion-setting','reducedMotion']]){
    const checkbox=$(`#${id}`);checkbox.checked=save.settings[key];
    checkbox.onchange=()=>{if(key==='autoFire')setAutoFire(checkbox.checked);else{save.settings[key]=checkbox.checked;persist();updateTouch();}};
  }
  $('#display-setting').value=save.settings.graphics;
  $('#display-setting').onchange=e=>setGraphics(e.target.value);
  $('#settings-done').onclick=()=>$('#info-dialog').close();
}
function credits(){showInfo(`<p class="eyebrow">PRESERVATION NOTES</p><h2>From 2002, with love.</h2><p>Blip & Blop: Balls of Steel was created by Loaded Studio. This browser adaptation uses the recovered campaign and artwork, with the published C++ gameplay source as its preservation reference.</p><p>Sources: <a href="https://www.vins.co.il/download/Blip-and-Blop" target="_blank" rel="noreferrer">original download</a>, <a href="https://github.com/benkaraban/blip-blop" target="_blank" rel="noreferrer">published original source</a>, and <a href="https://github.com/smartties/Blip-Blop-for-Android" target="_blank" rel="noreferrer">SDL Android port</a>.</p><p><b>Visuals:</b> depth and normal maps are inferred from the original pixels and sprite silhouettes. They represent surface relief, not recovered 3D geometry. Original pixels remain selectable.</p><p><b>Progress:</b> Roguelite saves are local to this browser and device. Original mode has no persistent upgrades. Export a backup before clearing browser storage.</p><button id="export-save" class="secondary-button">Export progress</button><label class="secondary-button">Import progress <input id="import-save" type="file" accept="application/json" style="max-width:190px"></label>`);
  $('#export-save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(save,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='blip-blop-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#import-save').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('File too large');const raw=JSON.parse(await file.text());if(raw.version!==1)throw Error('Unsupported save');save=normalizeSave(raw);persist();setMode(save.mode);setGraphics(save.settings.graphics);updateTouch();toast('Progress imported.');}catch{toast('That file is not a supported Blip & Blop save.');}};
}
$('#campaign-list').innerHTML=CAMPAIGN.map((stage,i)=>`<article class="campaign-card"><span>0${i+1}</span><h3>${stage.name}</h3><p>${stage.subtitle}</p></article>`).join('');
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
$('#graphics-select').onchange=e=>setGraphics(e.target.value);
$('#start-button').onclick=()=>start(false);$('#continue-button').onclick=()=>start(true);
onPress($('#pause-button'),()=>pauseGame(!paused));$('#resume-button').onclick=()=>pauseGame(false);$('#exit-button').onclick=title;$('#death-exit').onclick=title;
$('#complete-exit').onclick=title;
$('#loading-exit').onclick=title;$('#scores-button').onclick=scores;
$('#retry-button').onclick=()=>start(true);$('#death-workshop').onclick=workshop;$('#pause-workshop').onclick=workshop;$('#workshop-button').onclick=workshop;
$('#workshop-continue').onclick=()=>{$('#workshop-dialog').close();if(playing&&!$('#death-overlay').hidden)start(true);};
$('#visual-toggle').onclick=()=>setGraphics(renderer.mode==='original'?'enhanced':'original');
$('#help-button').onclick=()=>{if(playing)pauseGame(true);controls();};$('#credits-button').onclick=credits;
$('#pause-controls').onclick=controls;
onPress($('#auto-fire-button'),()=>setAutoFire(!save.settings.autoFire));
$('#volume').value=save.settings.volume;$('#volume').oninput=e=>{save.settings.volume=Number(e.target.value);engine.volume(save.settings.volume);persist();};
onPress($('#fullscreen-button'),async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();updateLayout();}catch{toast('The game already fills your browser. Add it to your Home Screen for more room.');}});
document.addEventListener('fullscreenchange',()=>{$('#fullscreen-button').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');updateLayout();});
document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)pauseGame(true);});
window.addEventListener('blur',()=>{if(playing&&!paused)pauseGame(true);});
window.addEventListener('storage',e=>{if(e.key===SAVE_KEY&&!playing){save=readSave();setMode(save.mode);setGraphics(save.settings.graphics);updateTouch();}});

setMode(mode);setGraphics(save.settings.graphics);updateTouch();updateLayout();
window.blipBlop={engine,renderer,get state(){return lastState;},get save(){return structuredClone(save);}};
