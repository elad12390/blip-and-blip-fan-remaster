import { mkdir, readdir, copyFile, stat, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'web'),destination=path.join(root,'artifacts/site');
await mkdir(path.join(root,'artifacts'),{recursive:true});
const target=await mkdtemp(path.join(root,'artifacts/site-build-'));
const files=[];
async function copyDirectory(from,to){
  await mkdir(to,{recursive:true});
  for(const entry of await readdir(from,{withFileTypes:true})){
    if(entry.name==='core-qa')continue;
    const src=path.join(from,entry.name),dest=path.join(to,entry.name);
    if(entry.isDirectory())await copyDirectory(src,dest);
    else if(entry.isFile()){
      const info=await stat(src);
      if(info.size>25*1024*1024)throw Error(`${path.relative(source,src)} exceeds the 25 MiB asset limit. Split it before packaging.`);
      await copyFile(src,dest);
      const hash=createHash('sha256');for await(const chunk of createReadStream(src))hash.update(chunk);
      files.push({path:path.relative(source,src),bytes:info.size,sha256:hash.digest('hex')});
    }
  }
}
await copyDirectory(source,target);
for(const required of ['index.html','core/blipblop.js','core/blipblop.wasm']){
  if(!files.some(f=>f.path===required))throw Error(`Missing required browser build: ${required}`);
}
await writeFile(path.join(target,'build-manifest.json'),JSON.stringify({version:1,files},null,2));
// Replace only this script's generated output, preventing stale QA files or
// removed assets from surviving subsequent builds.
await rm(destination,{recursive:true,force:true});
await rename(target,destination);
console.log(`Packaged ${files.length} files (${(files.reduce((s,f)=>s+f.bytes,0)/1048576).toFixed(1)} MiB).`);
