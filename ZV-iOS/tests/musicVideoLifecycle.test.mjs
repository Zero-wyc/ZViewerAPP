import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
const compile = ts.transpileModule(readFileSync(new URL('../src/components/MusicVideo.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function hooks() {
  const slots = [], effects = [], queue = []; let cursor = 0, effect = 0;
  const changed = (a,b) => !a || a.length !== b.length || a.some((value,index) => value !== b[index]);
  const react = {
    useState(initial) { const key=cursor++; if (!(key in slots)) slots[key]=typeof initial==='function'?initial():initial; return [slots[key],value=>{slots[key]=typeof value==='function'?value(slots[key]):value;}]; },
    useRef(initial) { const key=cursor++; if (!(key in slots)) slots[key]={current:initial};return slots[key]; },
    useCallback(fn,deps) { const key=cursor++;if(!(key in slots)||changed(slots[key].deps,deps))slots[key]={fn,deps};return slots[key].fn; },
    useEffect(fn,deps) { const key=effect++, old=effects[key];if(!old||changed(old.deps,deps))queue.push(()=>{old?.cleanup?.();effects[key]={deps,cleanup:fn()};}); },
  };
  return {react,render(fn){cursor=0;effect=0;const tree=fn();for(const fn of queue.splice(0))fn();return tree;},dispose(){effects.forEach(value=>value.cleanup?.());}};
}
function emitter() { const listeners=new Map();return {addListener(event,fn){const values=listeners.get(event)||new Set();values.add(fn);listeners.set(event,values);return {remove(){values.delete(fn);}};},emit(event,value){for(const fn of [...listeners.get(event)||[]])fn(value);}}; }
function contains(root,type) { if(!root||typeof root!=='object')return false;if(root.type===type)return true;return [root.props?.children].flat(Infinity).some(child=>contains(child,type)); }
async function mount(resolveWait) {
  const runtime=hooks(), nativeEvents=emitter(), audioEvents=emitter(), replacements=[], seeks=[];let phase='active', listener, position=0, plays=0, pauses=0, resolutions=0;
  const player={...nativeEvents,currentTime:0,playbackRate:1,playing:false,duration:0,preparing:false,seeking:false,sourceIdentity:'',configure(){},play(){plays++;this.playing=true;},pause(){pauses++;this.playing=false;},async replaceAsync(source){replacements.push(source?.identity??null);this.sourceIdentity=source?.identity??'';this.duration=source?100:0;}};
  Object.defineProperty(player,'currentTime',{get(){return position;},set(value){position=value;seeks.push(value);}});
  const audio={...audioEvents,currentTime:5,playing:true}, video={player,snapshot:{id:1}}, session={serverUrl:'https://fixture.invalid',accessToken:'fixture',user:{id:1}};
  const request=async()=>({settings:{dashDisabled:true}});
  const app={get currentState(){return phase;},addEventListener(_event,fn){listener=fn;return {remove(){listener=null;}};}};
  const jsx=(type,props)=>({type,props});
  const fallback=new Proxy({},{get:(_target,key)=>key==='ui'?{}:String(key)});
  const modules={react:runtime.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-native':{AppState:app,Text:'Text',View:'View'},'@/state/appearance':{useAppearance:()=>({styles:value=>value})},'@/state/session':{useSession:()=>({session,request})},'@/lib/preferences':{readPreference:async()=>({entries:{}}),writePreference:async()=>{}},'@/lib/mediaAdapter':{NativeMediaAdapter},'@/lib/biliNative':{defaultBiliPolicy:{},playbackSource:async state=>{resolutions++;if(resolveWait)await resolveWait(state);return {uri:state.sourceUrl,identity:state.sourceUrl,options:[],headers:{},slaves:[],contentType:'progressive'};}},'./VlcVideo':{useVlcVideo:()=>video,VlcVideo:'NativeDecoration'}};
  const exports={};vm.runInNewContext(compile,{exports,require:name=>modules[name]||fallback,setTimeout,clearTimeout});
  let tree, trackKey='bili:BVfirst:1', expanded=true;const setPure=()=>{};
  const render=()=>{tree=runtime.render(()=>exports.MusicVideo({trackKey,expanded,pure:false,setPure,audio,control(){},children:()=>null}));};
  const settle=async()=>{for(let n=0;n<3;n++){render();await tick();}};
  await settle();
  return {audio,player,replacements,seeks,get plays(){return plays;},get pauses(){return pauses;},get resolutions(){return resolutions;},get tree(){return tree;},render,settle,app(next){phase=next;listener(next);},track(next){trackKey=next;},expand(next){expanded=next;},dispose:runtime.dispose};
}

test('background immediately stops decoration and synchronization before React commits; foreground restores current binding', async()=>{
 const video=await mount();try{
  assert(video.replacements.some(value=>value?.includes('BVfirst')));
  const before=video.seeks.length,plays=video.plays;
  video.app('background');assert(video.pauses>0);
  video.audio.currentTime=30;video.audio.emit('timeUpdate',{currentTime:30});
  assert.equal(video.seeks.length,before);assert.equal(video.plays,plays);
  await tick();assert.equal(video.replacements.at(-1),null);
  video.track('bili:BVsecond:2');await video.settle();assert(!contains(video.tree,'NativeDecoration'));
  video.app('active');await video.settle();assert(contains(video.tree,'NativeDecoration'));assert(video.replacements.at(-1).includes('BVsecond'));
 }finally{video.dispose();}
});

test('a late old resolver after background cannot mount or seek decoration',async()=>{
 let resolve;const pending=new Promise(done=>{resolve=done;});const video=await mount(()=>pending);try{
  video.app('inactive');const before=video.seeks.length;resolve();await video.settle();
  assert.equal(video.replacements.at(-1),null);assert.equal(video.seeks.length,before);
 }finally{video.dispose();}
});

test('a decoration seek failure stops its retry loop while primary audio keeps playing',async()=>{
 const video=await mount();try{
  video.player.emit('statusChange',{status:'error',error:{code:'VLC_SEEK'}});await video.settle();
  assert(!contains(video.tree,'NativeDecoration'),'failure removes the native surface instead of retaining its gray frame');
  assert.equal(video.replacements.at(-1),null,'failure releases only the decoration input');
  const before=video.seeks.length,plays=video.plays,resolutions=video.resolutions;
  video.audio.currentTime=40;video.audio.emit('timeUpdate',{currentTime:40});
  await video.settle();assert.equal(video.resolutions,resolutions,'rendering the fallback must not restart the failed input');
  assert.equal(video.seeks.length,before);assert.equal(video.plays,plays);assert.equal(video.audio.playing,true);
  video.app('background');await tick();video.app('active');await video.settle();
  assert(video.replacements.at(-1)?.includes('BVfirst'));
 }finally{video.dispose();}
});

test('collapsed full player or missing binding removes the surface and releases decoration without pausing main audio',async()=>{
 const video=await mount();try{
  assert(contains(video.tree,'NativeDecoration'));
  video.expand(false);await video.settle();
  assert(!contains(video.tree,'NativeDecoration'));assert.equal(video.replacements.at(-1),null);assert.equal(video.audio.playing,true);
  video.expand(true);await video.settle();assert(contains(video.tree,'NativeDecoration'));
  video.track('ncm:371362');await video.settle();
  assert(!contains(video.tree,'NativeDecoration'));assert.equal(video.replacements.at(-1),null);assert.equal(video.audio.playing,true);
 }finally{video.dispose();}
});
