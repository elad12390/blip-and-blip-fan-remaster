#!/usr/bin/env python3
"""Incremental parallel Emscripten build of the complete preserved game engine."""
from pathlib import Path
import os, sys, subprocess, concurrent.futures
ROOT=Path(__file__).resolve().parent.parent
os.environ['EM_CONFIG']=str(ROOT/'toolchains/emsdk/.emscripten')
CC=str(ROOT/'toolchains/emsdk/install/emscripten/em++')
QA='--qa' in sys.argv
BUILD=ROOT/('build/objects-qa' if QA else 'build/objects');BUILD.mkdir(parents=True,exist_ok=True)
OUTPUT=ROOT/('web/core-qa' if QA else 'web/core');OUTPUT.mkdir(parents=True,exist_ok=True)
COMMON=['-std=c++17','-O2','-DPLATFORM_LINUX','-fexceptions','-I'+str(ROOT/'native/src'),'-I'+str(ROOT/'enhancements'),'-sUSE_SDL=2','-sUSE_SDL_MIXER=2','-sSDL2_MIXER_FORMATS=["ogg","mp3","mod"]','-Wno-deprecated','-Wno-write-strings','-Wno-return-type','-Wno-header-guard']
if QA: COMMON += ['-DBB_QA=1']
sources=sorted((ROOT/'native/src').glob('*.cpp'))+sorted((ROOT/'native/src/menus').glob('*.cpp'))+[ROOT/'enhancements/browser_material.cpp']
headers=list((ROOT/'native/src').rglob('*.h'))+list((ROOT/'enhancements').glob('*.h'))
header_time=max([p.stat().st_mtime for p in headers]+[Path(__file__).stat().st_mtime])
def compile_one(src):
 obj=BUILD/('_'.join(src.relative_to(ROOT).parts)+'.o')
 if not obj.exists() or obj.stat().st_mtime<max(src.stat().st_mtime,header_time):
  proc=subprocess.run([CC,*COMMON,'-c',str(src),'-o',str(obj)],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  if proc.returncode: raise RuntimeError(str(src)+'\n'+proc.stdout)
  if proc.stdout: print(proc.stdout,flush=True)
 return str(obj)
with concurrent.futures.ThreadPoolExecutor(max_workers=min(8,os.cpu_count() or 4)) as pool:
 objects=list(pool.map(compile_one,sources))
exports=['_main','_bb_start','_bb_set_input','_bb_set_input2','_bb_set_players','_bb_set_upgrades','_bb_pause','_bb_set_viewport','_bb_volume','_bb_state_json']
if QA: exports += ['_bb_qa_water_regression','_bb_qa_weapon','_bb_qa_health','_bb_qa_hit_player','_bb_qa_die','_bb_qa_finish_level','_bb_qa_cows','_bb_qa_pickup_health','_bb_qa_damage','_bb_qa_state_json']
import json
subprocess.run([CC,*COMMON,*objects,'-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=268435456','-sSTACK_SIZE=4194304','-sFORCE_FILESYSTEM=1','-sEXIT_RUNTIME=0','-sEXPORTED_FUNCTIONS='+json.dumps(exports),'-sEXPORTED_RUNTIME_METHODS=["ccall","cwrap","callMain","FS","UTF8ToString","HEAPU8"]','-o',str(OUTPUT/'blipblop.js')],check=True)
print('Built complete browser game:',OUTPUT/'blipblop.js',flush=True)
