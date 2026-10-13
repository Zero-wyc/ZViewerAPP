import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addSelectedBili, biliPartSelection, biliMusicItem } from '../src/lib/biliSelectionFlow.ts';

const bvid = 'BV1UHpw6LESy';
const media = { title: '多 P 视频', videoUrl: 'http://127.0.0.1:9123/private/proxy', audioUrl: 'http://127.0.0.1:9123/private/audio', resolvedUrl: `https://www.bilibili.com/video/${bvid}`, currentQn: 80, sessionVersion: 1, duration: 180, currentPage: 1, pages: [{ page: 1, cid: 101, part: '第一 P', duration: 60 }, { page: 2, cid: 102, part: '第二 P', duration: 120 }] };

test('a manually selected P replaces the parsed first P consistently for movie, music and association', () => {
  const value = biliPartSelection(`https://www.bilibili.com/video/${bvid}?cid=101&p=1`, media, media.pages[1]);
  assert.equal(value.cid, 102); assert.equal(value.currentPage, 2); assert.equal(value.duration, 120);
  assert.equal(new URL(value.url).searchParams.get('cid'), '102'); assert.equal(new URL(value.url).searchParams.get('p'), '2');
  const song = biliMusicItem(value); assert.equal(song.biliBvid, bvid); assert.equal(song.biliCid, 102); assert.equal(song.durationMs, 120000);
  assert.equal(value.pages, undefined); assert.equal(value.audioUrl, undefined); assert(!value.url.includes('127.0.0.1'));
});
test('native resolved identity converts a clipboard short link to a durable BV music item', () => {
  const value = biliPartSelection('分享视频 https://b23.tv/testShort', { ...media, currentPage: 2 });
  assert.equal(biliMusicItem(value).biliCid, 102); assert(value.url.includes(`/video/${bvid}`));
  const whole = biliPartSelection(bvid, media, undefined, true); assert.deepEqual(whole.pages, media.pages); assert.equal(whole.duration, 180);
});
test('PGC episode selection preserves the exact episode for watch and association and rejects unsupported music identity', () => {
  const episode = { page: 2, cid: 802, epId: 902, seasonId: 900, part: '第二集', duration: 1200 };
  const value = biliPartSelection('ss900', { ...media, resolvedUrl: 'https://www.bilibili.com/bangumi/play/ep901', epId: 901, seasonId: 900, pages: [episode] }, episode);
  assert(value.url.includes('/ep902?cid=802')); assert.equal(value.epId, 902); assert.equal(value.seasonId, 900); assert.equal(value.cliOnly, true);
  assert.throws(() => biliMusicItem(value), /暂不支持番剧/);
});
test('invalid CID and unresolved short links cannot create malformed music queue items', () => {
  assert.throws(() => biliPartSelection(bvid, { ...media, pages: [], cid: 0 }), /分 P 身份/);
  assert.throws(() => biliMusicItem({ title: '无身份', source: 'bilibili', url: `https://www.bilibili.com/video/${bvid}` }), /有效的 BV/);
  assert.throws(() => biliMusicItem({ title: '短链接', source: 'bilibili', url: 'https://b23.tv/testShort', cid: 101 }), /有效的 BV/);
});
test('closing the picker or changing account during resolve prevents all destination writes', async () => {
  let active = true; let writes = 0;
  await assert.rejects(addSelectedBili({ bvid, title: '取消选择' }, { active: () => active, status: () => {}, resolve: async () => { active = false; return media; }, add: async () => { writes++; } }), /已取消/);
  assert.equal(writes, 0);
});
test('search P selection uses the same resolved identity when dispatching to the music queue', async () => {
  let added;
  await addSelectedBili({ bvid, title: '第二 P 搜索结果', url: `https://www.bilibili.com/video/${bvid}?p=2&cid=102` }, { active: () => true, status: () => {}, resolve: async () => media, add: async (value, playNow) => { assert.equal(playNow, true); added = biliMusicItem(value); } });
  assert.equal(added.biliCid, 102); assert.equal(added.biliBvid, bvid); assert.equal(added.name, '第二 P 搜索结果'); assert.equal(added.durationMs, 120000);
});
