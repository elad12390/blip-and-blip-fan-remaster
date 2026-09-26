import { mkdir, readdir, copyFile, stat, readFile, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');

function versionURL(url,revision){
  const hashIndex=url.indexOf('#');
  const fragment=hashIndex<0?'':url.slice(hashIndex);
  const base=hashIndex<0?url:url.slice(0,hashIndex);
  const queryIndex=base.indexOf('?');
  const pathname=queryIndex<0?base:base.slice(0,queryIndex);
  const params=new URLSearchParams(queryIndex<0?'':base.slice(queryIndex+1));
  params.set('v',revision);
  return `${pathname}?${params}${fragment}`;
}

function stampHTML(html,revision){
  return html.replace(/(\b(?:src|href)\s*=\s*)(["'])([^"']+)\2/gi,(match,prefix,quote,url)=>{
    if(/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)||!/\.(?:css|m?js)(?:[?#]|$)/i.test(url))return match;
    return `${prefix}${quote}${versionURL(url,revision)}${quote}`;
  });
}

function stampModule(source,revision){
  // The authored modules use native relative static imports. Handle dynamic
  // imports and re-exports too, while leaving external/bare specifiers alone.
  const rewrite=(match,prefix,quote,url)=>`${prefix}${quote}${versionURL(url,revision)}${quote}`;
  return source
    .replace(/(\b(?:from|import)\s*)(["'])(\.{1,2}\/[^"'\r\n]+\.m?js(?:[?#][^"'\r\n]*)?)\2/g,rewrite)
    .replace(/(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"'\r\n]+\.m?js(?:[?#][^"'\r\n]*)?)\2/g,rewrite);
}

async function describeFile(file,relative){
  const hash=createHash('sha256');let bytes=0;
  for await(const chunk of createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
  return {path:relative,bytes,sha256:hash.digest('hex')};
}

export async function buildSite({source=path.join(root,'web'),destination=path.join(root,'artifacts/site')}={}){
  const parent=path.dirname(destination);
  await mkdir(parent,{recursive:true});
  const target=await mkdtemp(path.join(parent,'site-build-'));
  const files=[];
  async function copyDirectory(from,to){
    await mkdir(to,{recursive:true});
    for(const entry of await readdir(from,{withFileTypes:true})){
      if(entry.name==='core-qa')continue;
      const src=path.join(from,entry.name),dest=path.join(to,entry.name);
      if(entry.isDirectory())await copyDirectory(src,dest);
      else if(entry.isFile()){
        const relative=path.relative(source,src).split(path.sep).join('/');
        const info=await stat(src);
        if(info.size>25*1024*1024)throw Error(`${relative} exceeds the 25 MiB asset limit. Split it before packaging.`);
        await copyFile(src,dest);
        files.push(await describeFile(dest,relative));
      }
    }
  }
  try{
    await copyDirectory(source,target);
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    for(const required of ['index.html','core/blipblop.js','core/blipblop.wasm']){
      if(!files.some(f=>f.path===required))throw Error(`Missing required browser build: ${required}`);
    }
    // Include generated engine bytes in the revision, not just Git HEAD. This
    // prevents two native builds of one commit from sharing a stale WASM URL.
    // The fingerprint uses original copied bytes, so stamping stays deterministic.
    const revision=createHash('sha256')
      .update(await readFile(fileURLToPath(import.meta.url)))
      .update(JSON.stringify(files)).digest('hex');
    for(let i=0;i<files.length;i++){
      const file=files[i],builtPath=path.join(target,file.path);
      const isHTML=file.path==='index.html';
      const isModule=file.path.startsWith('js/')&&/\.m?js$/.test(file.path);
      if(!isHTML&&!isModule)continue;
      const original=await readFile(builtPath,'utf8');
      const stamped=isHTML?stampHTML(original,revision):stampModule(original,revision);
      if(stamped!==original){
        await writeFile(builtPath,stamped);
        // Manifest hashes describe published bytes, including revision queries.
        files[i]=await describeFile(builtPath,file.path);
      }
    }
    const manifest={version:1,revision,files};
    await writeFile(path.join(target,'build-manifest.json'),JSON.stringify(manifest,null,2));
    // Replace only this script's generated output, preventing stale QA files or
    // removed assets from surviving subsequent builds.
    await rm(destination,{recursive:true,force:true});
    await rename(target,destination);
    return manifest;
  }catch(error){
    await rm(target,{recursive:true,force:true});
    throw error;
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {revision,files}=await buildSite();
  console.log(`Packaged ${files.length} files (${(files.reduce((s,f)=>s+f.bytes,0)/1048576).toFixed(1)} MiB), release ${revision.slice(0,12)}.`);
}
