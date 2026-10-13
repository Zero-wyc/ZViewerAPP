import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { checkAbort } from '../src/lib/cancellation.ts';
import { addLibraryEntry } from '../src/lib/mediaLibrary.ts';
import { addAnimeEpisode } from '../src/lib/animeSources.ts';
import { queueFmSong } from '../src/lib/personalFm.ts';
import { addSelectedBili } from '../src/lib/biliSelectionFlow.ts';
import { MovieAddTransaction } from '../src/lib/movieAddition.ts';
import { biliGrid, posterHeight, normalizeBiliCatalog, chooseBiliPage } from '../src/lib/biliCatalog.ts';
const { AbortController: RNAbortController } = createRequire(import.meta.url)('abort-controller');

test('RN cancellation without throwIfAborted permits active work and rejects aborted work', () => {
  const controller = new RNAbortController(); assert.equal(typeof controller.signal.throwIfAborted, 'undefined');
  checkAbort(controller.signal); controller.abort(); assert.throws(() => checkAbort(controller.signal), { name: 'AbortError' });
});
for (const kind of ['jellyfin', 'emby']) test(`${kind} single episode and whole season add under the actual RN AbortController`, async () => {
  const added = []; const paths = []; const controller = new RNAbortController();
  const request = async path => { paths.push(path); return path.includes('/browse') ? { entries: [{ type: 'file', embyType: 'Episode', name: '第二集', path: 'episode-2', indexNumber: 2, parentIndexNumber: 1 }, { type: 'file', embyType: 'Episode', name: '第一集', path: 'episode-1', indexNumber: 1, parentIndexNumber: 1 }] } : { videoUrl: `/api/${kind}/proxy?mountId=1&path=episode-1`, format: 'hls', duration: 300, multiVersion: true }; };
  const add = async value => added.push(value);
  await addLibraryEntry(request, kind, { id: 1, serverUrl: 'https://library.invalid' }, { name: '单集', path: 'episode-1', type: 'file' }, false, add, controller.signal);
  await addLibraryEntry(request, kind, { id: 1 }, { name: '整季', path: 'season', type: 'directory' }, true, add, controller.signal);
  assert.equal(added.length, 2); assert.equal(added[0].path, 'episode-1'); assert.deepEqual(added[1].pages.map(value => value.path), ['episode-1', 'episode-2']);
  assert(paths.every(path => path.startsWith(`/api/${kind}/`))); assert.equal(added[1].pages[1].cid, undefined);
  controller.abort(); await assert.rejects(addLibraryEntry(request, kind, { id: 1 }, { path: 'ep', name: '取消', type: 'file' }, false, add, controller.signal), { name: 'AbortError' }); assert.equal(added.length, 2);
});
test('Kazumi resolve/add retains HLS headers and does not proxy an already-owned API', async () => {
  const added = []; const controller = new RNAbortController(); const episode = { id: 'ep-1', title: 'HD 高清', episodeNumber: 1, playbackParams: {} };
  const request = async () => ({ url: 'https://cdn.invalid/master.m3u8?sign=a%2Fb', format: 'hls', headers: { Referer: 'https://source.invalid/detail', 'User-Agent': 'fixture', Origin: 'https://source.invalid' } });
  await addAnimeEpisode(request, 'kazumi', 'DM84', '示例番剧', episode, async value => added.push(value), controller.signal);
  const url = new URL(added[0].url, 'https://site.invalid'); assert.equal(url.pathname, '/api/stream/kazumi/proxy'); assert.equal(url.searchParams.get('referer'), 'https://source.invalid/detail'); assert.equal(url.searchParams.get('url'), 'https://cdn.invalid/master.m3u8?sign=a%2Fb');
  await addAnimeEpisode(async () => ({ url: '/api/stream/kazumi/proxy?url=owned', format: 'hls' }), 'kazumi', 'DM84', '示例', episode, async value => added.push(value), controller.signal);
  assert.equal(added[1].url, '/api/stream/kazumi/proxy?url=owned');
  await assert.rejects(addAnimeEpisode(async () => { controller.abort(); return {}; }, 'kazumi', 'DM84', '示例', episode, async value => added.push(value), controller.signal), { name: 'AbortError' }); assert.equal(added.length, 2);
});
test('FM native-compatible upsert/restore selects the actual queue item; late cancellation/host loss cannot play', async () => {
  const song = { songId: 7, name: '歌曲', artist: '', album: '', cover: '', durationMs: 100, vip: false }; const controller = new RNAbortController();
  const result = await queueFmSong(song, controller.signal, { isHost: () => true, upsert: async () => {}, restore: async () => [{ ...song, id: 42 }] }); assert.equal(result.added.id, 42);
  await assert.rejects(queueFmSong(song, controller.signal, { isHost: () => true, upsert: async () => controller.abort(), restore: async () => { throw new Error('must not restore'); } }), { name: 'AbortError' });
  await assert.rejects(queueFmSong(song, new RNAbortController().signal, { isHost: () => false, upsert: async () => { throw new Error('must not add'); }, restore: async () => [] }), /房主/);
});
test('Bili card selection resolves once and adds canonical media with autoplay, never ephemeral URLs', async () => {
  const steps = []; let value; let active = true;
  await addSelectedBili({ bvid: 'BV1UHpw6LESy', title: '公主殿下', cover: 'https://i0.hdslb.com/cover.jpg' }, { active: () => active, status: () => {}, resolve: async url => { steps.push('resolve'); assert(url.includes('BV1UHpw6LESy')); return { title: '公主殿下', videoUrl: 'http://127.0.0.1:1234/private/proxy', currentQn: 80, sessionVersion: 1, currentPage: 1, pages: [{ page: 1, cid: 42512224146, part: '视频' }] }; }, add: async (media, play) => { steps.push('add-play'); assert.equal(play, true); value = media; active = false; } });
  assert.deepEqual(steps, ['resolve', 'add-play']); assert.equal(value.cid, 42512224146); assert(value.url.includes('cid=42512224146')); assert(!JSON.stringify(value).includes('127.0.0.1'));
  await assert.rejects(addSelectedBili({ bvid: 'BV1UHpw6LESy', title: '错误' }, { active: () => true, status: () => {}, resolve: async () => { throw new Error('resolve failed'); }, add: async () => { throw new Error('must not write'); } }), /resolve failed/);
});
test('Bili add/play retry after a late playback failure does not create a duplicate movie', async () => {
  const flow = new MovieAddTransaction(); let creates = 0; let plays = 0; const value = { source: 'bilibili', title: '视频', url: 'https://www.bilibili.com/video/BV1UHpw6LESy' };
  const port = { status: () => {}, create: async () => { creates++; return { ...value, id: 8 }; }, patchLocalOnly: async () => {}, refresh: async () => {}, play: async () => { if (++plays === 1) throw new Error('temporary play failure'); } };
  await assert.rejects(flow.run('room', value, true, port), /temporary/); await flow.run('room', value, true, port); assert.equal(creates, 1); assert.equal(plays, 2);
});
test('Bili image DTOs, large CIDs and PGC identity survive metadata-only selection', () => {
  const [item] = normalizeBiliCatalog({ result: [{ bvid: 'BV1UHpw6LESy', title: '<em>公主</em>殿下', pic: '//i0.hdslb.com/c.jpg', duration: '4:01', author: '作者' }] }, 'search', true);
  assert.equal(item.title, '公主殿下'); assert.equal(item.cover, 'https://i0.hdslb.com/c.jpg'); assert.equal(item.duration, 241);
  const result = chooseBiliPage(item, { title: '视频', pages: [{ page: 2, cid: 42512224146, part: '第二 P' }] }); assert(result.url.includes('p=2')); assert.equal(result.cid, 42512224146);
  const pgc = chooseBiliPage({ bvid: '', title: '番剧', seasonId: 900, url: 'https://www.bilibili.com/bangumi/play/ss900' }, { title: '番剧' }, { page: 2, cid: 102, epId: 42, part: '第二集' }); assert(pgc.url.includes('/ep42?cid=102'));
});
test('portrait and landscape grids never overflow and cover sizes keep original wide/square/portrait ratios', () => {
  const widths = [280, 358, 720, 780, 960, 1200];
  for (const width of widths) { const grid = biliGrid(width); assert(grid.columns * grid.width + (grid.columns - 1) * grid.gap <= width + 0.001); for (const [w, h] of [[1920, 1080], [720, 720], [1080, 1920]]) assert(Math.abs(grid.width / posterHeight(grid.width, w, h) - w / h) < 0.00001); }
  assert.equal(biliGrid(358).columns, 1); assert(biliGrid(720).columns > 1); assert(biliGrid(960).columns >= 3);
});
