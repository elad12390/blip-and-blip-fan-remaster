// The adapter owns the browser lifecycle; the native engine owns game simulation.
// Packaged module imports carry one content-derived release revision. The native
// loader and WASM must use it too, so a refresh cannot mix engine generations.
const releaseVersion=new URL(import.meta.url).searchParams.get('v');
const resourceURL=path=>releaseVersion?`${path}?v=${encodeURIComponent(releaseVersion)}`:path;
export class Engine {
  constructor({ onFrame, onCommands, onGpuForget, gpu=()=>false, onState, onCheckpoint, onDeath, onComplete, onProgress, onError }) {
    Object.assign(this,{onFrame,onCommands,onGpuForget,gpu,onState,onCheckpoint,onDeath,onComplete,onProgress,onError});
  }
  async load() {
    if(this.promise)return this.promise;
    this.promise=new Promise((resolve,reject)=>{
      let failed=false;
      const fail=error=>{if(failed)return;failed=true;this.ready=false;this.module=null;this.promise=null;this.running=false;clearInterval(this.poll);script.remove();reject(error);};
      const module=window.Module={
        canvas:document.querySelector('#native-screen'),
        noInitialRun:true,
        locateFile:path=>resourceURL(`core/${path}`),
        print:message=>console.debug('[game]',message),
        printErr:message=>console.warn('[game]',message),
        setStatus:message=>this.onProgress?.(message),
        monitorRunDependencies:left=>this.onProgress?.(left?`Preparing ${left} game resources…`:'Starting engine…'),
        onFrame:(...args)=>this.onFrame?.(module,...args),
        onCommands:(...args)=>this.onCommands?.(module,...args),
        onGpuForget:(...args)=>this.onGpuForget?.(module,...args),
        onCheckpoint:state=>this.onCheckpoint?.(this.parse(state)),
        onDeath:state=>this.onDeath?.(this.parse(state)),
        onComplete:state=>this.onComplete?.(this.parse(state)),
        onState:state=>{this.state=this.parse(state);this.onState?.(this.state);},
        onRuntimeInitialized:async()=>{try{if(failed)return;this.module=module;await this.loadResources(module);if(failed||this.module!==module)return;module._bb_set_gpu?.(this.gpu()?1:0);this.applyViewport();this.ready=true;resolve(this);}catch(error){fail(error);}},
        onAbort:reason=>{const error=Error(`Game engine stopped: ${reason}`);if(this.running)this.onError?.(error);fail(error);},
      };
      const script=document.createElement('script');script.src=resourceURL('core/blipblop.js');script.onerror=()=>fail(Error('The game engine could not be downloaded. Check your connection and retry.'));document.head.append(script);
    }).catch(error=>{this.promise=null;throw error;});
    return this.promise;
  }
  async loadResources(module) {
    const response=await fetch(resourceURL('data-manifest.json'));
    if(!response.ok)throw Error('The game data manifest could not be downloaded.');
    const manifest=await response.json();
    module.FS.mkdirTree('/data');
    let cache=null;
    try{cache=await globalThis.caches?.open('blip-blop-assets-v1');}catch{}
    let loaded=0,index=0,stopped=false;
    const loadVariant=async(item,compressed)=>{
        const url=`data/${encodeURIComponent(compressed?item.compressedName:item.name)}?sha=${item.sha256}`;
        const verify=async asset=>{
          if(!asset.ok)throw Error(`Could not download ${item.name}. Please retry.`);
            let bytes=new Uint8Array(await asset.arrayBuffer());
            // HTTP may already have decoded Content-Encoding:gzip. The final
            // original-file digest is authoritative for either response shape.
            if(compressed&&bytes[0]===0x1f&&bytes[1]===0x8b){
              const decoded=new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
              bytes=new Uint8Array(await decoded.arrayBuffer());
            }
            if(bytes.length!==item.bytes)throw Error(`Incomplete game file: ${item.name}. Please retry.`);
            if(globalThis.crypto?.subtle){
              const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
              const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
              if(hash!==item.sha256)throw Error(`Game file verification failed: ${item.name}.`);
            }
            return bytes;
        };
        let stored=null;
        if(cache)try{stored=await cache.match(url);}catch{}
        if(stored){
          try{return await verify(stored);}
          catch{try{await cache.delete(url);}catch{}}
        }
        const asset=await fetch(url);
        const backup=cache?asset.clone():null;
        const bytes=await verify(asset);
        if(backup)try{await cache.put(url,backup);}catch{}
        return bytes;
    };
    const worker=async()=>{
      try{
        while(!stopped&&index<manifest.files.length){
          const item=manifest.files[index++];
          let bytes;
          if(item.compressedName&&typeof DecompressionStream!=='undefined'){
            try{bytes=await loadVariant(item,true);}
            catch{bytes=await loadVariant(item,false);}
          }else{
            bytes=await loadVariant(item,false);
          }
          if(stopped)return;
          module.FS.writeFile(`/data/${item.name}`,bytes,{canOwn:true});loaded+=item.bytes;
          this.onProgress?.(`Loading original game data (${loaded}/${manifest.totalBytes})`);
        }
      }catch(error){stopped=true;throw error;}
    };
    await Promise.all(Array.from({length:4},worker));
    this.onProgress?.('Original game data verified. Starting…');
  }
  parse(value){if(typeof value==='number')value=this.module?.UTF8ToString(value);if(typeof value==='string'){try{return JSON.parse(value);}catch{return {};}}return value??{};}
  start({mode,player,part,upgrades,players=1}){
    const m=this.module;if(!m)throw Error('Engine is not loaded.');
    this.applyViewport();
    m._bb_set_upgrades?.(mode==='roguelite'?upgrades.armor:0,mode==='roguelite'?upgrades.firepower:0,mode==='roguelite'?upgrades.supply:0);
    m._bb_set_players?.(players);
    m._bb_start?.(mode==='roguelite'?1:0,player,part??0);
    if(!this.running){this.running=true;try{m.callMain([]);}catch(error){this.running=false;throw error;}this.poll=setInterval(()=>{
      if(m._bb_state_json){this.state=this.parse(m._bb_state_json());this.onState?.(this.state);}
    },200);}
  }
  input(mask){this.module?._bb_set_input?.(mask);}
  setViewport(width,height=480){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
    this.viewport={width:Math.max(240,Math.min(1600,Math.round(width/height*480))),height:480};
    this.applyViewport();
  }
  applyViewport(){if(this.viewport)this.module?._bb_set_viewport?.(this.viewport.width,this.viewport.height);}
  input2(mask){this.module?._bb_set_input2?.(mask);}
  pause(value){this.module?._bb_pause?.(value?1:0);}
  volume(value){this.module?._bb_volume?.(Math.round(value*128));}
  stop(){this.input(0);this.pause(true);}
}
