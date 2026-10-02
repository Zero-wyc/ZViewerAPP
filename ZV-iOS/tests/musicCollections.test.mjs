import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyCollection, completeCollection, openNcmPlaylist, openDaily, dailySongs, localDate } from '../src/lib/musicCollection.ts';
import { PersonalFm } from '../src/lib/personalFm.ts';
const song = id => ({ songId: id, name: `Song ${id}`, artist: 'Artist', album: '', cover: '', durationMs: 1000, vip: false });
const raw = id => ({ id, name: `Song ${id}`, dt: 1000 });
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('daily defaults to local today; history selection uses detail endpoint and history failure retains today', async () => {
  const paths=[]; const today=localDate(); const ncm=async path=>{paths.push(path);return path==='/history/recommend/songs'?{data:{dates:['2026-01-01','2026-01-01','invalid']}}:{data:{dailySongs:[raw(1)]}};};
  const opened=await openDaily(ncm);assert.equal(opened.collection.daily.date,today);assert.deepEqual(opened.collection.daily.dates,[today,'2026-01-01']);assert(paths.includes('/recommend/songs'));
  await dailySongs(ncm,'2026-01-01');assert(paths.includes('/history/recommend/songs/detail?date=2026-01-01'));
  const fallback=await openDaily(async path=>{if(path==='/history/recommend/songs')throw Error('VIP denied');return {data:{songs:[raw(2)]}};});assert.equal(fallback.songs[0].songId,2);assert.deepEqual(fallback.collection.daily.dates,[today]);assert(fallback.collection.daily.historyNote);
});
test('entire playlist loads in order beyond 100 before queue replacement', async () => {
  const calls = []; const ncm = async path => { const params = new URL('http://local' + path).searchParams; const offset = Number(params.get('offset')); calls.push(path); return path.startsWith('/playlist/detail') ? { playlist: { name: 'Whole', trackCount: 235 } } : { songs: Array.from({ length: Math.min(100, 235-offset) }, (_,i) => raw(offset+i+1)) }; };
  const opened = await openNcmPlaylist(ncm, 1); assert.equal(opened.songs.length,100); assert.equal(opened.collection.title,'Whole');
  const all = await completeCollection(ncm, opened.collection, opened.songs, new AbortController().signal,()=>{});
  assert.deepEqual(all.map(s=>s.songId), Array.from({length:235},(_,i)=>i+1)); assert.equal(calls.length,4);
  const queue=[song(999)]; let played; await applyCollection(all,true,{check(){},clear:async()=>{queue.length=0;},add:async s=>{queue.push(s);},playFirst:async s=>{played=s;},progress(){}});
  assert.deepEqual(queue,all); assert.equal(played.songId,1);
});
test('missing/partial/repeated pagination fails before clearing and unknown count exhausts pages', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(completeCollection(async()=>({songs:[]}), {playlistId:1,total:101}, [song(1)], signal,()=>{}),/尚未替换/);
  const initial=Array.from({length:100},(_,i)=>song(i+1));
  await assert.rejects(completeCollection(async()=>({songs:initial.map(s=>raw(s.songId))}), {playlistId:1,total:200}, initial, signal,()=>{}),/重复/);
  const all=await completeCollection(async()=>({songs:[]}),{playlistId:1},initial,signal,()=>{}); assert.equal(all.length,100);
  await assert.rejects(completeCollection(async()=>{throw Error('offline');},{playlistId:1,total:200},initial,signal,()=>{}),/offline/);
});
test('append preserves current playback and duplicate order, writes await acknowledgements', async () => {
  const log=[]; let pending=false;
  await applyCollection([song(1),song(1),song(2)],false,{check(){},clear:async()=>assert.fail('append cleared queue'),add:async s=>{assert.equal(pending,false); pending=true; await tick(); log.push(s.songId); pending=false;},playFirst:async()=>assert.fail('append changed playback'),progress(){}});
  assert.deepEqual(log,[1,1,2]);
});
test('invalid collection/cancel/failed acknowledgement never incorrectly auto-plays', async () => {
  const log=[]; const port={check(){},clear:async()=>log.push('clear'),add:async s=>{if(s.songId===2)throw Error('rejected');log.push(s.songId);},playFirst:async()=>log.push('play'),progress(){}};
  await assert.rejects(applyCollection([],true,port),/没有/); assert.deepEqual(log,[]);
  await assert.rejects(applyCollection([song(1),song(2),song(3)],true,port),/1\/3.*rejected/); assert.deepEqual(log,['clear',1]);
  const abort=new AbortController(); log.length=0;
  await assert.rejects(applyCollection([song(1),song(2)],true,{...port,check:()=>abort.signal.throwIfAborted(),add:async()=>{log.push(1);abort.abort();}}),/1\/2/); assert.deepEqual(log,['clear',1]);
});
test('FM continues past initial batch and 200 history limit without finite queue boundary', async () => {
  let id=1, fetched=0; const played=[]; const fm=new PersonalFm({fetch:async()=>{fetched++;return Array.from({length:3},()=>song(id++));},play:async s=>played.push(s.songId),change(){}});
  await fm.refill(); await fm.start(); for(let i=0;i<220;i++){await fm.next();await tick();}
  assert.equal(played.length,221); assert.equal(new Set(played).size,221); assert(fetched>70); assert.equal(fm.state.history.length,200); assert.equal(fm.isActive(`ncm:${played.at(-1)}`),true); fm.dispose();
});
test('FM repeated small server batches still roam while excluding immediate current',async()=>{
  const played=[]; const fm=new PersonalFm({fetch:async()=>[song(1),song(2),song(3)],play:async s=>played.push(s.songId),change(){}});
  await fm.start(); for(let i=0;i<30;i++){await fm.next();await tick();} assert.equal(played.length,31); assert(played.every((v,i)=>i===0||v!==played[i-1])); fm.dispose();
});
test('FM refill coalesces, late old mode fetch ignored and default empty-mode fallback',async()=>{
  const old=deferred(); const calls=[];const fm=new PersonalFm({fetch:async mode=>{calls.push(mode);return mode==='DEFAULT'&&calls.length===1?old.promise:mode==='EXPLORE'?[]:[song(9),song(10)];},play:async()=>{},change(){}});
  const a=fm.refill();const b=fm.refill();await tick();assert.equal(calls.length,1);
  await fm.changeMode('EXPLORE'); old.resolve([song(1)]);await Promise.all([a,b]);assert.equal(fm.state.current.songId,9);assert.deepEqual(calls,['DEFAULT','EXPLORE','DEFAULT']);fm.dispose();
});
test('FM double start and refill during play neither duplicates selection nor loses fresh candidates',async()=>{
  const play=deferred();let id=1;const played=[];const fm=new PersonalFm({fetch:async()=>Array.from({length:3},()=>song(id++)),play:async s=>{played.push(s.songId);await play.promise;},change(){}});
  await fm.refill();const a=fm.start();const b=fm.start();await fm.refill();play.resolve();await Promise.all([a,b]);assert.deepEqual(played,[1]);assert.deepEqual(fm.state.pool.map(s=>s.songId),[2,3,4,5,6]);fm.dispose();
});
test('FM stop/reset cancel pending selection; previous restores history and failed next retries',async()=>{
  const wait=deferred();const fm=new PersonalFm({fetch:async()=>[song(1),song(2),song(3)],play:async(_,signal)=>{await wait.promise;signal.throwIfAborted();},change(){}});
  await fm.refill();const start=fm.start();fm.stop();wait.resolve();await assert.rejects(start);assert.equal(fm.state.active,false);fm.dispose();
  let fail=false;const history=new PersonalFm({fetch:async()=>[song(1),song(2),song(3)],play:async()=>{if(fail)throw Error('offline');},change(){}});
  await history.start(); fail=true;await assert.rejects(history.next(),/offline/);assert.equal(history.state.current.songId,1);fail=false;await history.next();await history.prev();assert.equal(history.state.current.songId,1);history.dispose();
});
