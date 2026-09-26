import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'blip-release-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source=path.join(root,'web'),destination=path.join(root,'dist');
  const files={
    'index.html':'<link rel="stylesheet" href="play.css"><script type="module" src="js/app.js"></script><script src="https://example.test/external.js"></script>',
    'play.css':'body { color: green; }',
    'js/app.js':"import { value } from './dep.js';\nimport './side-effect.js?theme=dark#boot';\nexport { value } from '../js/dep.js';\nconst lazy=()=>import('./lazy.js');\nimport external from 'external-package';\nimport remote from 'https://example.test/remote.js';",
    'js/dep.js':'export const value=1;',
    'js/side-effect.js':'window.sideEffect=true;',
    'js/lazy.js':'export const lazy=true;',
    'core/blipblop.js':'const nativeEngine=true;',
    'core/blipblop.wasm':Buffer.from([0,97,115,109,1,0,0,0]),
    'core-qa/blipblop.js':'const diagnosticEngine=true;',
    'core-qa/blipblop.wasm':Buffer.from([1,2,3]),
    'data-manifest.json':'{"files":[],"totalBytes":0}',
  };
  for(const [name,bytes] of Object.entries(files)){
    const file=path.join(source,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
  }
  return {source,destination,files};
}

test('a packaged release versions the module graph and stylesheet, with hashes of the actual published bytes',async t=>{
  const f=await fixture(t),manifest=await buildSite(f);
  assert.match(manifest.revision,/^[a-f0-9]{64}$/);
  const html=await readFile(path.join(f.destination,'index.html'),'utf8');
  assert.ok(html.includes(`href="play.css?v=${manifest.revision}"`));
  assert.ok(html.includes(`src="js/app.js?v=${manifest.revision}"`));
  assert.ok(html.includes('src="https://example.test/external.js"'),'external resources are untouched');
  const module=await readFile(path.join(f.destination,'js/app.js'),'utf8');
  for(const expected of [
    `from './dep.js?v=${manifest.revision}'`,
    `import './side-effect.js?theme=dark&v=${manifest.revision}#boot'`,
    `from '../js/dep.js?v=${manifest.revision}'`,
    `import('./lazy.js?v=${manifest.revision}')`,
  ])assert.ok(module.includes(expected),expected);
  assert.ok(module.includes("from 'external-package'"));
  assert.ok(module.includes("from 'https://example.test/remote.js'"));
  assert.equal(await readFile(path.join(f.source,'js/app.js'),'utf8'),f.files['js/app.js'],'packaging never edits authored modules');
  assert.equal(manifest.files.some(file=>file.path.startsWith('core-qa/')),false);
  await assert.rejects(access(path.join(f.destination,'core-qa')));
  for(const file of manifest.files){
    const bytes=await readFile(path.join(f.destination,file.path));
    assert.equal(file.bytes,bytes.length,file.path);
    assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'),file.path);
  }
  assert.deepEqual(JSON.parse(await readFile(path.join(f.destination,'build-manifest.json'),'utf8')),manifest);
});

test('release revisions are reproducible but change when only generated WASM changes',async t=>{
  const f=await fixture(t),first=await buildSite(f),second=await buildSite(f);
  assert.deepEqual(second,first);
  await writeFile(path.join(f.source,'core/blipblop.wasm'),Buffer.from([0,97,115,109,2,0,0,0]));
  const rebuilt=await buildSite(f);
  assert.notEqual(rebuilt.revision,first.revision,'ignored native artifacts still participate in cache invalidation');
  assert.ok((await readFile(path.join(f.destination,'index.html'),'utf8')).includes(`?v=${rebuilt.revision}`));
});

test('versioned Engine requests matching native JS, WASM and manifest while preserving verified data cache URLs',async t=>{
  const {Engine}=await import('../web/js/engine.js?v=release-test-2026');
  const descriptors=new Map(),scripts=[],requested=[],cacheKeys=[],writes=[];
  const asset=Buffer.from([1,3,7]);
  const sha256=createHash('sha256').update(asset).digest('hex');
  const manifest={files:[{name:'level.lvl',bytes:asset.length,sha256}],totalBytes:asset.length};
  for(const [name,value] of Object.entries({
    window:{},
    document:{querySelector:()=>({}),createElement:()=>({remove(){}}),head:{append:script=>scripts.push(script)}},
    fetch:async url=>{requested.push(url);return url.startsWith('data-manifest.json')?new Response(JSON.stringify(manifest)):new Response(asset);},
    caches:{open:async()=>({match:async key=>{cacheKeys.push(key);return undefined;},put:async key=>{cacheKeys.push(key);}})},
  })){
    descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  t.after(()=>{for(const [name,descriptor] of descriptors)descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name];});
  const engine=new Engine({}),loaded=engine.load();
  assert.equal(scripts[0].src,'core/blipblop.js?v=release-test-2026');
  assert.equal(window.Module.locateFile('blipblop.wasm'),'core/blipblop.wasm?v=release-test-2026');
  window.Module.FS={mkdirTree(){},writeFile:(name,bytes)=>writes.push({name,bytes})};
  await window.Module.onRuntimeInitialized();await loaded;
  assert.equal(requested[0],'data-manifest.json?v=release-test-2026');
  const dataURL=`data/level.lvl?sha=${sha256}`;
  assert.deepEqual(requested.slice(1),[dataURL]);
  assert.deepEqual(cacheKeys,[dataURL,dataURL],'content-verified asset cache remains shared between releases');
  assert.equal(writes[0].name,'/data/level.lvl');assert.deepEqual([...writes[0].bytes],[1,3,7]);
});
