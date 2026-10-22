import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { resolveAggregateSource } from '../src/lib/aggregatePlayback.ts';
import { nativeVideoSource } from '../src/lib/media.ts';
import { canonicalSelection } from '../src/lib/sources.ts';
import { addCmsEpisodes } from '../src/lib/cmsSources.ts';
import { isUnverifiedBiliHdr } from '../src/lib/resolvers.ts';

const proxy = (path, token = '') => `/api/stream/kazumi/proxy?${new URLSearchParams({ url: `https://media.example/${path}`, ...(token ? { token } : {}) })}`;
const meta = { sourceId: 'fixture', originalTitle: 'fixture', episode: { id: 'one', title: '1', episodeNumber: 1, playbackParams: {} } };

test('an unlabelled old Kazumi state cannot attach its URL or audio to another legacy movie', () => {
  const room = new RoomPlayback();
  const first = { id: 1, source: 'kazumi', title: 'first', url: proxy('first.mp4') };
  const next = { id: 2, source: 'kazumi', title: 'next', url: proxy('next.m3u8'), format: 'hls' };
  room.list([first, next]); room.current(1); room.state({ sourceType: 'kazumi', sourceUrl: first.url, currentTime: 40, isPlaying: true });
  room.current(2);
  const result = room.state({ sourceType: 'kazumi', sourceUrl: first.url, audioUrl: proxy('old-audio.m4a'), currentTime: 0, isPlaying: true });
  assert.equal(result.sourceUrl, next.url); assert.equal(result.audioUrl, undefined); assert.equal(result.movieId, 2); assert.equal(result.format, 'hls');
});

test('metadata-based Kazumi resolution fails explicitly instead of playing an older signed URL', async () => {
  await assert.rejects(resolveAggregateSource({ sourceType: 'kazumi', sourceMeta: meta, sourceUrl: proxy('old.mp4') }, async () => { throw new Error('provider unavailable'); }), /provider unavailable/);
});

test('adding metadata-based proxy records removes the adding account token and entry-point host', () => {
  const result = canonicalSelection({ source: 'kazumi', title: 'fixture', sourceMeta: meta, url: `https://old.example/prefix${proxy('video.mp4', 'old-account')}`, audioUrl: `https://old.example${proxy('audio.m4a', 'old-account')}` }, 'https://current.example', 'current-account');
  assert(result.url.startsWith('/api/stream/kazumi/proxy?')); assert(!JSON.stringify(result).includes('old-account')); assert(!JSON.stringify(result).includes('old.example'));
});

test('explicit direct aggregate policy applies to the separate audio track too', async () => {
  const source = await resolveAggregateSource({ sourceType: 'kazumi', sourceMeta: meta, sourceUrl: 'kazumi://fixture/one', serverProxy: false }, async () => ({ url: 'https://media.example/video.mp4', audioUrl: 'https://media.example/audio.m4a', headers: { Referer: 'https://site.example/' } }));
  const native = nativeVideoSource(source, 'https://server.example/prefix', 'viewer');
  assert.equal(native.serverApi, false); assert.equal(native.slaves[0].serverApi, false); assert.equal(native.slaves[0].uri, 'https://media.example/audio.m4a');
});

test('legacy Kazumi audio rebases its own proxy and site headers without the adding account token', async () => {
  const oldAudio = `http://127.0.0.1:9999${proxy('audio.m4a', 'old-account')}&referer=https%3A%2F%2Faudio.example%2F`;
  const source = await resolveAggregateSource({ sourceType: 'kazumi', sourceUrl: proxy('video.mp4', 'old-account'), audioUrl: oldAudio, serverProxy: true }, async () => assert.fail('legacy records do not have metadata to resolve'));
  const audio = nativeVideoSource(source, 'https://current.example/prefix', 'viewer').slaves[0];
  const uri = new URL(audio.uri);
  assert.equal(uri.origin, 'https://current.example'); assert.equal(uri.pathname, '/prefix/api/stream/kazumi/proxy'); assert.equal(uri.searchParams.get('url'), 'https://media.example/audio.m4a'); assert.equal(uri.searchParams.get('referer'), 'https://audio.example/'); assert.equal(uri.searchParams.get('token'), 'viewer'); assert(!audio.uri.includes('old-account'));
});

const cms = { id: 'display-id', title: 'fixture', playGroups: [{ name: 'group', episodes: [0, 1, 2].map(index => ({ index, title: `${index}`, playbackParams: { vodId: 'real-id', playFromIndex: 4, episodeIndex: index + 10 } })) }] };
test('CMS batches retain failed selections and continue through later episodes with actual playback identities', async () => {
  const calls = [];
  const result = await addCmsEpisodes('source', cms, 0, ['0', '1', '2', '2'], async selection => { calls.push(selection.sourceMeta); if (selection.sourceMeta.episodeIndex === 11) throw new Error('add failed'); });
  assert.deepEqual(result.added, ['0', '2']); assert.deepEqual(result.failures, [{ id: '1', message: 'add failed' }]);
  assert.deepEqual(calls.map(value => [value.vodId, value.playFromIndex, value.episodeIndex]), [['real-id', 4, 10], ['real-id', 4, 11], ['real-id', 4, 12]]);
});

test('leaving a CMS picker stops the remaining batch after the in-flight add returns', async () => {
  const controller = new AbortController(); let calls = 0;
  const result = await addCmsEpisodes('source', cms, 0, ['0', '1'], async () => { calls++; controller.abort(); }, controller.signal);
  assert.equal(calls, 1); assert.deepEqual(result, { added: ['0'], failures: [], cancelled: true });
});

test('CMS rejects mismatched anime metadata and invalid episode indices before adding', () => {
  const value = { source: 'cms', title: 'fixture', url: 'cms://fixture/one', sourceMeta: meta };
  assert.throws(() => canonicalSelection(value, 'https://server.example', 'viewer'), /元数据无效/);
  assert.throws(() => canonicalSelection({ ...value, sourceMeta: { sourceId: 'fixture', vodId: 'one', playFromIndex: 0, episodeIndex: -1 } }, 'https://server.example', 'viewer'), /元数据无效/);
});

test('HDR/Dolby metadata cannot bypass conservative filtering by omitting the isHdr flag', () => {
  for (const source of [{ currentQn: 125 }, { currentQn: 126, isHdr: false }, { hdrType: 'HDR10' }, { hdrType: 'unknown' }, { videoCodec: 'dvh1.05.06' }, { videoCodec: 'dvhe.05.09' }]) assert.equal(isUnverifiedBiliHdr(source), true);
  for (const source of [{ currentQn: 80, videoCodec: 'avc1.640033' }, { hdrType: 'SDR', isHdr: false }, { hdrType: 'none' }]) assert.equal(isUnverifiedBiliHdr(source), false);
});
