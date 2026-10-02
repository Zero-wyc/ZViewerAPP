import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { QueueCursor, musicKey } from '../src/lib/musicQueue.ts';
import { ScopedCache } from '../src/lib/scopedCache.ts';
import { VoiceBinding } from '../src/lib/voiceBinding.ts';
import { VideoTap, seekTarget } from '../src/lib/videoGesture.ts';
import { neteaseImageUrl } from '../src/lib/neteaseImage.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
const movies = [{ id: 1, source: 'bilibili', url: 'https://www.bilibili.com/video/BV1test', title: 'A', cid: 101 }, { id: 2, source: 'bilibili', url: 'https://www.bilibili.com/video/BV2test', title: 'B', cid: 202 }];
const state = { sourceType: 'bilibili', sourceUrl: 'http://127.0.0.1:9333/proxy', cid: 101, isPlaying: true, currentTime: 42 };
for (const order of [['state', 'current', 'list'], ['list', 'state', 'current'], ['current', 'list', 'state']]) test(`room resolves authoritative URL/cid after event order ${order.join('/')}`, () => {
  const room = new RoomPlayback(); for (const event of order) { if (event === 'state') room.state(state); if (event === 'list') room.list(movies); if (event === 'current') room.current(1); }
  assert.equal(room.value().movieId, 1); assert.equal(new URL(room.value().sourceUrl).searchParams.get('cid'), '101'); assert(!room.value().sourceUrl.includes('9333')); assert.equal(room.value().currentTime, 42);
});
test('waiting switch, late old state, null source and room reset never restore an old movie', () => {
  const room = new RoomPlayback(); room.current(1); room.state({ ...state, currentMovieId: 1 }); room.current(2); room.list(movies); assert.equal(room.value(), null);
  room.state({ ...state, sourceUrl: 'https://cdn.invalid/new', currentMovieId: 2, cid: 202 }); assert.equal(room.value().movieId, 2);
  room.state({ ...state, currentMovieId: 1 }); assert.equal(room.value().movieId, 2);
  room.current(null); assert.equal(room.value(), null); room.reset(); assert.equal(room.value(), null);
});
test('state for a new movie can arrive before current-movie without adopting the old cid', () => {
  const room = new RoomPlayback(); room.list(movies); room.current(1); room.state({ ...state, currentMovieId: 2, cid: 202 }); assert.equal(room.value(), null); room.current(2); assert.equal(room.value().cid, 202);
});
test('duplicate music queue [A,A,B] advances by item id, including previous and removed-current handling', () => {
  const items = [{ id: 10, songId: 1 }, { id: 11, songId: 1 }, { id: 12, songId: 2 }]; const cursor = new QueueCursor(); cursor.select(items, 10);
  assert.equal(cursor.advance(items, 'ncm:1', 'next').id, 11); assert.equal(cursor.advance(items, 'ncm:1', 'next').id, 12); assert.equal(cursor.advance(items, 'ncm:2', 'prev').id, 11);
  assert.equal(cursor.advance(items.filter(item => item.id !== 11), 'ncm:1', 'next').id, 12); assert.equal(cursor.advance([], null, 'next'), null); assert.equal(musicKey({ songId: 0, biliBvid: 'BV1', biliCid: 202 }), 'bili:BV1:202');
});
test('order mode stops manual navigation at either boundary, while sequence wraps', () => {
  const items = [{ id: 10, songId: 1 }, { id: 11, songId: 2 }]; const cursor = new QueueCursor(); cursor.select(items, 10);
  assert.equal(cursor.advance(items, 'ncm:1', 'prev', false, false), null);
  assert.equal(cursor.advance(items, 'ncm:1', 'next', false, false).id, 11);
  assert.equal(cursor.advance(items, 'ncm:2', 'next', false, false), null);
  assert.equal(cursor.advance(items, 'ncm:2', 'next').id, 10);
});
test('a future movie state without cid never inherits the previous movie cid', () => {
  const room = new RoomPlayback(); room.list(movies); room.current(1); room.state({ ...state, currentMovieId: 1 });
  room.state({ sourceType: 'bilibili', sourceUrl: 'https://www.bilibili.com/video/BV2test', currentMovieId: 2, isPlaying: false, currentTime: 0 });
  room.current(2); assert.equal(room.value().cid, 202); assert.equal(room.value().isPlaying, false);
  room.current(null); room.state({ currentMovieId: 2, sourceType: 'url', sourceUrl: 'https://example.invalid/old.mp4', isPlaying: true, currentTime: 0 }); assert.equal(room.value(), null);
});
test('cache coalesces identical scope and separates account/server/quality/cid', async () => {
  const cache = new ScopedCache(); let calls = 0; const work = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.get('s1:u1:cid1:qn64', work), cache.get('s1:u1:cid1:qn64', work)]), [1, 1]);
  for (const key of ['s2:u1:cid1:qn64', 's1:u2:cid1:qn64', 's1:u1:cid2:qn64', 's1:u1:cid1:qn80']) await cache.get(key, work);
  assert.equal(calls, 5);
});
test('cache discards pending results after logout and enforces size/TTL', async () => {
  const cache = new ScopedCache(1, 2); let finish; const old = cache.get('old', () => new Promise(resolve => { finish = resolve; })); cache.clear(); finish('old'); await assert.rejects(old, /会话/);
  let count = 0; await cache.get('a', async () => ++count); await cache.get('b', async () => ++count); await cache.get('a', async () => ++count); assert.equal(count, 3);
  await new Promise(resolve => setTimeout(resolve, 5)); await cache.get('a', async () => ++count); assert.equal(count, 4);
});
test('voice ACK gate rejects old media ACKs after either connection changes or disconnect', () => {
  const gate = new VoiceBinding(); const old = gate.begin('main-1', 'media-1'); assert(gate.accepts(old, 'main-1', 'media-1'));
  const next = gate.begin('main-2', 'media-2'); assert(!gate.accepts(old, 'main-1', 'media-1')); assert(!gate.accepts(next, 'main-1', 'media-2')); assert(gate.accepts(next, 'main-2', 'media-2')); gate.invalidate(); assert(!gate.accepts(next, 'main-2', 'media-2'));
});
test('video double taps respect regions, adjacent points, time, cancel and duration bounds', () => {
  const gesture = new VideoTap(); assert.equal(gesture.tap(150, 100, 0, 300, false), null); assert.equal(gesture.tap(151, 101, 200, 300, false), 'toggle'); assert.equal(gesture.tap(150, 100, 250, 300, false), null);
  gesture.cancel(); gesture.tap(10, 10, 1000, 300, true); assert.equal(gesture.tap(11, 10, 1100, 300, true), 'back'); gesture.tap(290, 10, 2000, 300, false); assert.equal(gesture.tap(290, 10, 2100, 300, false), null);
  gesture.tap(10, 10, 3000, 300, true); assert.equal(gesture.tap(290, 10, 3100, 300, true), null); gesture.cancel(); gesture.tap(10, 10, 4000, 300, true); assert.equal(gesture.tap(10, 10, 4400, 300, true), null);
  assert.equal(seekTarget(4, -15, 300), 0); assert.equal(seekTarget(299, 15, 300), 300); assert.equal(seekTarget(20, 15, 0), null);
});
test('Netease images preserve signed query fields, limit upgrades to their host and reject credentials', () => {
  const image = new URL(neteaseImageUrl('//p1.music.126.net/a.jpg?param=40y40&signature=abc', 300)); assert.equal(image.protocol, 'https:'); assert.equal(image.searchParams.get('param'), '300y300'); assert.equal(image.searchParams.get('signature'), 'abc');
  assert.equal(new URL(neteaseImageUrl('http://other.example/a?param=40y40')).protocol, 'http:'); assert.equal(neteaseImageUrl('http://user:pass@example.com/a'), ''); assert.equal(neteaseImageUrl('file:///a'), '');
});
test('Netease banners retain original wide artwork while album covers keep their square crop', () => {
  const raw = 'http://p1.music.126.net/banner.jpg?param=300y300&quality=89&token=signed';
  const banner = new URL(neteaseImageUrl(raw, null));
  assert.equal(banner.protocol, 'https:'); assert.equal(banner.searchParams.has('param'), false);
  assert.equal(banner.searchParams.get('quality'), '89'); assert.equal(banner.searchParams.get('token'), 'signed');
  assert.equal(new URL(neteaseImageUrl(raw)).searchParams.get('param'), '300y300');
  assert.equal(neteaseImageUrl('https://cdn.example/banner.jpg?param=original&signature=abc', null), 'https://cdn.example/banner.jpg?param=original&signature=abc');
});
test('cancelled media resolution cannot write, invalidation retains paused progress and same-URL delete/readd loads again', async () => {
  let finish; const native = { currentTime: 0, duration: 300, playbackRate: 1, playing: false, sources: [], play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync(source) { this.sources.push(source); this.currentTime = 0; } };
  const adapter = new NativeMediaAdapter(native, async () => new Promise(resolve => { finish = resolve; })); const value = { sourceUrl: 'https://example.com/a', isPlaying: false, currentTime: 42 };
  const task = adapter.apply(value, 'https://service.example', 'token'); await new Promise(resolve => setImmediate(resolve)); adapter.cancelPending(); finish({ uri: value.sourceUrl, identity: value.sourceUrl, headers: {}, slaves: [], contentType: 'progressive' }); await task; assert.equal(native.sources.length, 0);
  const regular = new NativeMediaAdapter(native); await regular.apply(value, 'https://service.example', 'token'); native.currentTime = 95; regular.invalidate(); await regular.apply(value, 'https://service.example', 'token'); assert.equal(native.currentTime, 95); assert.equal(native.playing, false);
  await regular.apply(null, 'https://service.example', 'token'); await regular.apply(value, 'https://service.example', 'token'); assert.equal(native.sources.length, 4);
});
