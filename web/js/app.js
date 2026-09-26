import { readSave, writeSave, SAVE_KEY, normalizeSave, UPGRADE_DEFS, upgradeCost, purchaseUpgrade, settleRun, checkpointRun, recordScore, getHighScores } from './progression.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';
import { Engine } from './engine.js';
import { CAMPAIGN, partName } from './campaign.js';
const $=selector=>document.querySelector(selector);
let save=readSave(),mode=save.mode,player=0,paused=false,playing=false,runId=null,lastState={},deathActive=false,toastTimer,startAttempt=0,resumedRun=false;
const renderer=new Renderer($('#screen'));
renderer.mode=save.settings.graphics;
const persist=()=>{if(!writeSave(save))toast('Browser storage is unavailable. Export your progress in Credits & preservation notes.');};
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function setMode(value){mode=value;save.mode=mode;document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('#progression-summary').hidden=mode!=='roguelite';$('#continue-button').hidden=mode!=='roguelite'||!save.checkpoint;$('#shard-count').textContent=save.shards;persist();}
function setGraphics(value){renderer.mode=value;save.settings.graphics=value;$('#graphics-select').value=value;$('#visual-toggle').textContent=value==='original'?'Lighting: off':value==='depth'?'Depth view':'Lighting: on';persist();}
function updateTouch(){const show=save.settings.touch==='on'||(save.settings.touch==='auto'&&matchMedia('(pointer: coarse)').matches);$('#touch-controls').classList.toggle('show',show);$('#game-stage').classList.toggle('touch-active',show);}
const engine=new Engine({
  onFrame:(m,...args)=>{renderer.draw(m,...args);$('#loading').hidden=true;},
  onProgress:message=>{if(!message)return;const match=String(message).match(/\((\d+)\/(\d+)\)/);$('#loading-status').textContent=match?`Preparing original assets · ${(Number(match[1])/1048576).toFixed(1)} / ${(Number(match[2])/1048576).toFixed(1)} MiB`:message;if(match)$('#loading-bar').style.width=`${Math.min(100,100*Number(match[1])/Number(match[2]))}%`;},
  onState:state=>{lastState=state;renderer.state=state;$('#stage-label').textContent=state.level??partName(state.part);for(const id of ['#health-status','#fullscreen-health']){$(id).hidden=mode!=='roguelite'||!state.inGame;$(id).textContent=`HP ${Math.max(0,state.hp??0)} / ${state.maxHp??5}`;}},
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
async function start(continueRun=false){
  const attempt=++startAttempt;
  const checkpoint=continueRun&&mode==='roguelite'?save.checkpoint:null;
  resumedRun=!!checkpoint;
  player=checkpoint?.player??Number($('#hero-select').value);
  runId=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;deathActive=false;paused=false;playing=true;$('#home').hidden=true;$('#play').hidden=false;document.body.classList.add('playing');
  $('#pause-overlay').hidden=true;$('#death-overlay').hidden=true;$('#complete-overlay').hidden=true;$('#loading').hidden=true;$('#mode-label').textContent=mode.toUpperCase();$('#pause-workshop').hidden=mode!=='roguelite';
  $('#pause-save-note').textContent=mode==='roguelite'?'Stage checkpoints are saved automatically on this device.':'Original mode uses the original rules. Persistent upgrades are disabled.';
  updateTouch();
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
function controls(){showInfo(`<p class="eyebrow">FIELD MANUAL</p><h2>Ready. Aim. Blop.</h2><p>Hold a direction to move or aim diagonally. Shoot while moving, jump across gaps, and save your cow bombs for crowded encounters.</p><table class="controls-table"><tr><td>Move & aim</td><td><kbd>ARROWS</kbd> or <kbd>WASD</kbd></td></tr><tr><td>Fire</td><td><kbd>J</kbd> or <kbd>Z</kbd></td></tr><tr><td>Jump</td><td><kbd>SPACE</kbd> or <kbd>K</kbd></td></tr><tr><td>Cow bomb</td><td><kbd>L</kbd> or <kbd>C</kbd></td></tr><tr><td>Continue dialogue</td><td><kbd>ENTER</kbd></td></tr><tr><td>Pause</td><td><kbd>ESC</kbd> or <kbd>P</kbd></td></tr></table><p><b>Local co-op:</b> player 1 uses WASD + F (fire), G (jump), H (cow). Player 2 uses arrows + J (fire), K (jump), L (cow).</p><p><b>Touch:</b> use the left joystick to move and aim, with the three action buttons on the right. Landscape gives you more room.</p><p><b>Gamepad:</b> left stick / D-pad to move, X or right trigger to fire, A to jump, B for a cow bomb, Start to pause.</p><label>Touch controls <select id="touch-setting"><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hidden</option></select></label>`);$('#touch-setting').value=save.settings.touch;$('#touch-setting').addEventListener('change',e=>{save.settings.touch=e.target.value;persist();updateTouch();});}
function credits(){showInfo(`<p class="eyebrow">PRESERVATION NOTES</p><h2>From 2002, with love.</h2><p>Blip & Blop: Balls of Steel was created by Loaded Studio. This browser adaptation uses the recovered campaign and artwork, with the published C++ gameplay source as its preservation reference.</p><p>Sources: <a href="https://www.vins.co.il/download/Blip-and-Blop" target="_blank" rel="noreferrer">original download</a>, <a href="https://github.com/benkaraban/blip-blop" target="_blank" rel="noreferrer">published original source</a>, and <a href="https://github.com/smartties/Blip-Blop-for-Android" target="_blank" rel="noreferrer">SDL Android port</a>.</p><p><b>Visuals:</b> depth and normal maps are inferred from the original pixels and sprite silhouettes. They represent surface relief, not recovered 3D geometry. Original pixels remain selectable.</p><p><b>Progress:</b> Roguelite saves are local to this browser and device. Original mode has no persistent upgrades. Export a backup before clearing browser storage.</p><button id="export-save" class="secondary-button">Export progress</button><label class="secondary-button">Import progress <input id="import-save" type="file" accept="application/json" style="max-width:190px"></label>`);
  $('#export-save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(save,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='blip-blop-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('#import-save').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('File too large');const raw=JSON.parse(await file.text());if(raw.version!==1)throw Error('Unsupported save');save=normalizeSave(raw);persist();setMode(save.mode);setGraphics(save.settings.graphics);toast('Progress imported.');}catch{toast('That file is not a supported Blip & Blop save.');}};
}
$('#campaign-list').innerHTML=CAMPAIGN.map((stage,i)=>`<article class="campaign-card"><span>0${i+1}</span><h3>${stage.name}</h3><p>${stage.subtitle}</p></article>`).join('');
document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
$('#graphics-select').onchange=e=>setGraphics(e.target.value);
$('#start-button').onclick=()=>start(false);$('#continue-button').onclick=()=>start(true);
$('#pause-button').onclick=()=>pauseGame(!paused);$('#resume-button').onclick=()=>pauseGame(false);$('#exit-button').onclick=title;$('#death-exit').onclick=title;
$('#complete-exit').onclick=title;
$('#loading-exit').onclick=title;$('#scores-button').onclick=scores;
$('#retry-button').onclick=()=>start(true);$('#death-workshop').onclick=workshop;$('#pause-workshop').onclick=workshop;$('#workshop-button').onclick=workshop;
$('#workshop-continue').onclick=()=>{$('#workshop-dialog').close();if(playing&&!$('#death-overlay').hidden)start(true);};
$('#visual-toggle').onclick=()=>setGraphics(renderer.mode==='original'?'enhanced':'original');
$('#help-button').onclick=()=>{if(playing)pauseGame(true);controls();};$('#credits-button').onclick=credits;
$('#volume').value=save.settings.volume;$('#volume').oninput=e=>{save.settings.volume=Number(e.target.value);engine.volume(save.settings.volume);persist();};
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#game-stage').requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser. Landscape mode gives you more room.');}};
$('#fullscreen-pause').onclick=()=>pauseGame(!paused);
$('#fullscreen-exit').onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();$('#screen').focus();};
document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused)pauseGame(true);});
window.addEventListener('blur',()=>{if(playing&&!paused)pauseGame(true);});
window.addEventListener('storage',e=>{if(e.key===SAVE_KEY&&!playing){save=readSave();setMode(save.mode);}});

setMode(mode);setGraphics(save.settings.graphics);updateTouch();
window.blipBlop={engine,renderer,get state(){return lastState;},get save(){return structuredClone(save);}};
