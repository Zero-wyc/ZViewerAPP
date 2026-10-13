import test from 'node:test';
import assert from 'node:assert/strict';
import { create } from 'zustand';
import { createHash } from 'node:crypto';
import { loadTs } from './test-ts-module.mjs';
const { initialMusicVolume } = loadTs(new URL('../src/upstream/modules/music/utils/volume.ts', import.meta.url));
const { usePersonalFmStore: fm, fetchPersonalFmPool, advancePersonalFm } = loadTs(new URL('../src/upstream/modules/music/personal-fm.ts', import.meta.url), { zustand: { create } }, { URLSearchParams });
const song = (id) => ({ songId: id, name: `Song ${id}`, artist: '', album: '', cover: '', durationMs: 1000, vip: false });
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('initial volume is 50%, server default applies, saved volume including mute wins', () => {
  assert.equal(initialMusicVolume(null), .5);
  assert.equal(initialMusicVolume(null, 35), .35);
  assert.equal(initialMusicVolume('0', 35), 0);
  assert.equal(initialMusicVolume('1', 35), 1);
  for (const invalid of ['', 'garbage', '1oops', '-1', '2', 'Infinity']) {
    assert.equal(initialMusicVolume(invalid, 35), .35);
  }
  for (const invalid of [-1, 101, NaN]) assert.equal(initialMusicVolume(null, invalid), .5);
});

test('FM requests deduplicate and filter repeated/current/history songs', async () => {
  fm.getState().reset();
  fm.getState().activate('room', song(1));
  fm.getState().setHistory([song(2)]);
  const wait = deferred();
  let count = 0;
  const request = async () => { count++; return wait.promise; };
  const first = fetchPersonalFmPool(request);
  assert.equal(fetchPersonalFmPool(request), first);
  wait.resolve([1, 2, 3, 3, 4].map((id) => ({ id, name: String(id) })));
  await first;
  assert.equal(count, 1);
  assert.deepEqual(Array.from(fm.getState().pool, s => s.songId), [3, 4]);
});

test('mode changes invalidate old responses and use current mode/submode with fallback', async () => {
  fm.getState().reset();
  const wait = deferred();
  const old = fetchPersonalFmPool(() => wait.promise);
  fm.getState().setMode('SCENE_RCMD');
  fm.getState().setSubmode('NIGHT_EMO');
  const urls = [];
  await fetchPersonalFmPool(async (url) => {
    urls.push(url);
    return urls.length === 1 ? [] : [{ id: 9, name: 'New' }];
  });
  wait.resolve([{ id: 8, name: 'Old' }]);
  await old;
  assert.match(urls[0], /mode=SCENE_RCMD.*submode=NIGHT_EMO/);
  assert.equal(urls[1], '/api/music/ncm/personal_fm');
  assert.deepEqual(Array.from(fm.getState().pool, s => s.songId), [9]);
});

test('FM automatically enqueues and plays successive candidates, refilling on exhaustion', async () => {
  fm.getState().reset();
  fm.getState().activate('room', song(1));
  fm.getState().setPool([song(2), song(3)]);
  const events = [];
  let refills = 0;
  for (const id of [1, 2, 3, 4]) {
    await advancePersonalFm('room', `ncm:${id}`, {
      refill: async () => { refills++; fm.getState().setPool([song(4), song(5)]); },
      enqueue: async (s) => { events.push(`enqueue:${s.songId}`); },
      play: (s) => { events.push(`play:${s.songId}`); },
      isCurrent: () => true,
    });
  }
  assert.deepEqual(events, [2, 3, 4, 5].flatMap((id) => [`enqueue:${id}`, `play:${id}`]));
  assert.equal(refills, 1);
  assert.equal(fm.getState().activeKey, 'ncm:5');
  assert.deepEqual(Array.from(fm.getState().history, s => s.songId), [1, 2, 3, 4]);
});

test('FM waits for queue acknowledgement before switching and preserves candidate on denial', async () => {
  fm.getState().reset(); fm.getState().activate('room', song(1)); fm.getState().setPool([song(2)]);
  const wait = deferred(); const played = [];
  const next = advancePersonalFm('room', 'ncm:1', {
    refill: async () => {}, enqueue: () => wait.promise,
    play: (s) => played.push(s.songId), isCurrent: () => true,
  });
  assert.deepEqual(played, []);
  assert.equal(fm.getState().activeKey, 'ncm:1');
  wait.resolve(); await next;
  assert.deepEqual(played, [2]);
  fm.getState().setPool([song(3)]);
  await assert.rejects(advancePersonalFm('room', 'ncm:2', {
    refill: async () => {}, enqueue: async () => { throw new Error('denied'); },
    play: () => assert.fail(), isCurrent: () => true,
  }), /denied/);
  assert.equal(fm.getState().activeKey, 'ncm:2');
  assert.equal(fm.getState().pool[0].songId, 3);
});

test('leaving room, ordinary playback, mode change or user action cancels pending FM', async () => {
  for (const cancel of [() => fm.getState().reset(), () => fm.getState().deactivate(), () => fm.getState().setMode('EXPLORE'), () => fm.getState().invalidate()]) {
    fm.getState().reset(); fm.getState().activate('room', song(1)); fm.getState().setPool([song(2)]);
    const wait = deferred(); const allowed = true;
    const next = advancePersonalFm('room', 'ncm:1', {
      refill: async () => {}, enqueue: () => wait.promise,
      play: () => assert.fail('stale request must not start playback'), isCurrent: () => allowed,
    });
    cancel(); wait.resolve(); await next;
  }
});

test('losing playback control while awaiting queue acknowledgement cannot start a song', async () => {
  fm.getState().reset(); fm.getState().activate('room', song(1)); fm.getState().setPool([song(2)]);
  const wait = deferred(); let allowed = true;
  const next = advancePersonalFm('room', 'ncm:1', {
    refill: async () => {}, enqueue: () => wait.promise,
    play: () => assert.fail(), isCurrent: () => allowed,
  });
  allowed = false; wait.resolve(); await next;
  assert.equal(fm.getState().activeKey, 'ncm:1');
});

test('other rooms and non-FM tracks do not request or enqueue recommendations', async () => {
  fm.getState().reset(); fm.getState().activate('room', song(1));
  for (const [room, key] of [['other', 'ncm:1'], ['room', 'ncm:99'], ['room', null]]) {
    await advancePersonalFm(room, key, {
      refill: async () => assert.fail(), enqueue: async () => assert.fail(),
      play: () => assert.fail(), isCurrent: () => true,
    });
  }
});

test('native Harmony WBI matches Go vectors, including UTF-8 and transmitted sanitization', () => {
  const { wbiMixinKey, wbiQuery } = loadTs(new URL('../ZV-HarmonyOS/entry/src/main/ets/services/BilibiliWbi.ets', import.meta.url));
  assert.equal(wbiMixinKey('7cd084941338484aae1ad9425b84077c','4932caff0ff746eab6f01bf08b70ac45'),'ea1db124af3c7062474693fa704f4ff8');
  const key=wbiMixinKey('abcdefghijklmnopqrstuvwxyzABCDEF','GHIJKLMNOPQRSTUVWXYZ0123456789_-');
  assert.equal(key,'UVsc1ixGpYkF6dTJBRfXHjQtDCoNmMPn');
  const params=new Map([['search_type','video'],['keyword',"中文 搜索!'()*"],['page','2'],['wts','1702204169'],['empty','']]);
  const query=wbiQuery(params);
  assert.equal(query,'keyword=%E4%B8%AD%E6%96%87%20%E6%90%9C%E7%B4%A2&page=2&search_type=video&wts=1702204169');
  params.set('w_rid',createHash('md5').update(query+key).digest('hex'));
  const transmitted=new URLSearchParams(wbiQuery(params));
  assert.equal(transmitted.get('keyword'),'中文 搜索');
  assert.equal(params.get('keyword'),"中文 搜索!'()*");
  transmitted.delete('w_rid');
  assert.equal(createHash('md5').update(wbiQuery(new Map(transmitted))+key).digest('hex'),params.get('w_rid'));
});
test('empty or failed refills keep the active song and never repeat it as a fake continuation', async () => {
  fm.getState().reset(); fm.getState().activate('room',song(1)); fm.getState().setPool([song(1)]);
  const deps={refill:async()=>{},enqueue:async()=>assert.fail(),play:()=>assert.fail(),isCurrent:()=>true};
  await assert.rejects(advancePersonalFm('room','ncm:1',deps),/新的漫游/);
  await assert.rejects(advancePersonalFm('room','ncm:1',{...deps,refill:async()=>{throw Error('offline')}}),/offline/);
  assert.equal(fm.getState().activeKey,'ncm:1');
});
test('resetting a room rejects an old refill even when the same room ID is reused', async () => {
  fm.getState().reset();const wait=deferred(); const old=fetchPersonalFmPool(()=>wait.promise);
  fm.getState().reset();fm.getState().activate('room',song(9));
  wait.resolve([{id:8,name:'old room'}]);await old;
  assert.equal(fm.getState().pool.length,0);assert.equal(fm.getState().current.songId,9);
});
test('FM history is bounded to 100 songs',async()=>{
  fm.getState().reset();fm.getState().activate('room',song(101));fm.getState().setHistory(Array.from({length:100},(_,i)=>song(i+1)));fm.getState().setPool([song(102)]);
  await advancePersonalFm('room','ncm:101',{refill:async()=>{},enqueue:async()=>{},play:()=>{},isCurrent:()=>true});
  assert.equal(fm.getState().history.length,100);assert.equal(fm.getState().history[0].songId,2);assert.equal(fm.getState().history[99].songId,101);
});

test('an empty stale mode response cannot start a fallback request against a new session', async () => {
  fm.getState().reset();fm.getState().setMode('EXPLORE');
  const wait=deferred();let requests=0;
  const old=fetchPersonalFmPool(()=>{requests++;return wait.promise});
  fm.getState().reset();wait.resolve([]);await old;
  assert.equal(requests,1);assert.equal(fm.getState().pool.length,0);
});
