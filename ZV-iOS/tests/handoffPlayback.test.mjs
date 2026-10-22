import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
import { nativeVideoSource } from '../src/lib/media.ts';
import { resolveAggregateSource, aggregateProxy } from '../src/lib/aggregatePlayback.ts';
import { MusicAuthority } from '../src/lib/musicAuthority.ts';
import { PlayerDisplay } from '../src/lib/playerDisplay.ts';

const movie = { id: 2, source: 'anime', title: 'fixture', url: 'anisubs://fixture/ep1', serverProxy: true, playsvideoEnabled: false, sourceMeta: { sourceId: 'fixture', originalTitle: 'fixture', episode: { id: 'ep1', title: '1', episodeNumber: 1, playbackParams: {} } } };
const state = { movieId: 2, sourceUrl: '/api/stream/anisubs/proxy?url=https%3A%2F%2Fmedia.example%2Fvideo.m3u8', sourceType: 'anime', format: 'hls', isPlaying: false, currentTime: 42, playbackRate: 1.5 };
test('ani-subs resolved URL survives all state/list/current arrival orders', () => {
  for (const order of ['slc', 'scl', 'lsc', 'lcs', 'csl', 'cls']) {
    const coordinator = new RoomPlayback();
    for (const action of order) { if (action === 's') coordinator.state(state); if (action === 'l') coordinator.list([movie]); if (action === 'c') coordinator.current(2); }
    assert.equal(coordinator.value().sourceUrl, state.sourceUrl, order);
    assert.equal(coordinator.value().playsvideoEnabled, false);
    assert.equal(coordinator.value().isPlaying, false);
  }
});
test('cross-provider snapshots clear Bili identity/audio and reject retired movie state', () => {
  const coordinator = new RoomPlayback();
  coordinator.list([{ id: 1, source: 'bilibili', title: 'BV', url: 'https://www.bilibili.com/video/BV1xx411c7mD', cid: 7 }, movie]);
  coordinator.current(1); coordinator.state({ ...state, movieId: 1, sourceType: 'bilibili', cid: 7, audioUrl: 'https://media.example/audio.m4s' });
  coordinator.current(2); coordinator.state(state);
  assert.equal(coordinator.value().cid, undefined); assert.equal(coordinator.value().audioUrl, undefined);
  coordinator.state({ ...state, movieId: 1, cid: 7 }); assert.equal(coordinator.value().movieId, 2);
});
test('same URL proxy change reloads VLC and preserves pause/position/rate; browser preference does not reload VLC', async () => {
  const player = { currentTime: 0, playbackRate: 1, playing: false, duration: 200, count: 0, play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync() { this.count++; this.currentTime = 0; } };
  const adapter = new NativeMediaAdapter(player);
  const initial = { ...state, sourceType: 'mp4', sourceUrl: 'https://media.example/video.mp4', serverProxy: false };
  await adapter.apply(initial, 'https://server.example', 'fixture'); player.currentTime = 81;
  await adapter.apply({ ...initial, serverProxy: true }, 'https://server.example', 'fixture');
  assert.equal(player.count, 2); assert.equal(player.currentTime, 81); assert.equal(player.playing, false); assert.equal(player.playbackRate, 1.5);
  await adapter.apply({ ...initial, serverProxy: true, playsvideoEnabled: true }, 'https://server.example', 'fixture'); assert.equal(player.count, 2);
});
test('saved Kazumi proxy uses current entry point and never retains the adding user token', async () => {
  const url = 'http://127.0.0.1:9999/old/api/stream/kazumi/proxy?url=https%3A%2F%2Fmedia.example%2Fvideo.mp4&token=adding-user&referer=https%3A%2F%2Fsite.example%2F';
  assert.equal(aggregateProxy(url).url, 'https://media.example/video.mp4');
  const resolved = await resolveAggregateSource({ sourceUrl: url, sourceType: 'kazumi', serverProxy: true }, async () => { throw Error('unused'); });
  const native = nativeVideoSource(resolved, 'https://current.example/prefix', 'viewer');
  assert(native.uri.startsWith('https://current.example/prefix/api/stream/kazumi/proxy?')); assert(!native.uri.includes('adding-user')); assert(!native.uri.includes('127.0.0.1'));
  const direct = nativeVideoSource({ ...resolved, serverProxy: false }, 'https://current.example/prefix', 'viewer');
  assert.equal(direct.uri, 'https://media.example/video.mp4'); assert.equal(direct.serverApi, false);
});
test('music server position is not advanced twice and suppresses competing host clocks', () => {
  const authority = new MusicAuthority(); const sample = { trackKey: 'ncm:1', isPlaying: true, positionSec: 25, updatedAt: 1000 };
  assert.equal(authority.sample(sample, 'server', 21000).updatedAt, 21000);
  assert.equal(authority.sample(sample, 'host', 22000), null);
  assert(authority.sample(sample, 'host', 29000));
  assert.equal(authority.correction({ ...sample, positionSec: 0, isPlaying: false }, 25, true, false, 30000), 0);
  assert.equal(authority.correction(sample, 0, true, false, 31000), null);
});
test('late decoded portrait dimensions rotate fullscreen without relocking a manual unlock', async () => {
  const calls = []; const display = new PlayerDisplay({ supported: async () => true, landscape: async () => false, lock: async value => { calls.push(value); }, unlock: async () => { calls.push('auto'); } }, () => {});
  await display.start(); await display.setFullscreen(true); await display.videoSize(1080, 1920); await display.toggleOrientation(); await display.videoSize(720, 1280);
  assert.deepEqual(calls, ['landscape', 'portrait', 'auto']);
  await display.videoSize(1920, 1080); await display.setFullscreen(false); assert.deepEqual(calls.slice(-2), ['landscape', 'auto']);
});

test('late VLC HLS length enables duration without resetting an earlier seek or accepting retired callbacks', async () => {
  const { VlcPlayer } = await import('../src/lib/vlcPlayer.ts');
  let snapshot; const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource(state, 'https://server.example', 'fixture'));
  const first = snapshot.id; player.currentTime = 42; player.loaded(first, 0);
  player.durationChanged(first, 634634); player.loaded(first, 0);
  assert.equal(player.duration, 634.634); assert.equal(player.currentTime, 42);
  await player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://media.example/new.mp4' }, 'https://server.example', 'fixture'));
  player.durationChanged(first, 999999); assert.equal(player.duration, 0); player.dispose();
});
