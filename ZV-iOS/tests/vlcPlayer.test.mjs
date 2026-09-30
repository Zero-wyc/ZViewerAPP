import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
import { nativeVideoSource } from '../src/lib/media.ts';
const server = 'https://service.example';
function fixture(available = true) {
  const snapshots = []; const calls = [];
  const view = { async play() { calls.push('play'); }, async pause() { calls.push('pause'); }, async stop() { calls.push('stop'); }, async seek(ms) { calls.push(['seek', ms]); } };
  const player = new VlcPlayer(value => snapshots.push(value), available);
  return { snapshots, calls, view, player };
}
const state = { sourceUrl: '/api/server-files/proxy?path=custom%3Avideos%2FS01E01.mkv', sourceType: 'server-files', format: 'mkv', currentTime: 120, isPlaying: true };

test('early play survives native initialization and start-paused callbacks', async () => {
  const f = fixture(); const adapter = new NativeMediaAdapter(f.player); const events = [];
  f.player.addListener('playingChange', event => events.push(event.isPlaying));
  await adapter.apply(state, server, 'token'); const snapshot = f.snapshots.at(-1);
  assert.equal(snapshot.autoplay, true); assert.equal(f.player.preparing, true);
  f.player.attach(snapshot.id, f.view); f.player.playingChanged(snapshot.id, false);
  assert.deepEqual(events, []); // Initial paused notification is not a room pause.
  f.calls.length = 0; f.player.loaded(snapshot.id, 1446200);
  assert.equal(f.player.preparing, false); assert.ok(f.calls.includes('play'));
  await adapter.apply({ ...state, isPlaying: false }, server, 'token');
  assert.equal(f.snapshots.at(-1).autoplay, false);
  f.calls.length = 0; f.player.loaded(snapshot.id, 1446200);
  assert.ok(f.calls.includes('pause')); assert.ok(!f.calls.includes('play'));
});

test('VLC adapts milliseconds, initial seek, rate and the shared room clock', async () => {
  const f = fixture(); const adapter = new NativeMediaAdapter(f.player);
  await adapter.apply(state, server, 'token'); const snapshot = f.snapshots.at(-1);
  assert.equal(snapshot.initialTime, 120);
  f.player.attach(snapshot.id, f.view); f.player.loaded(snapshot.id, 1446200);
  assert.deepEqual(f.calls.find(Array.isArray), ['seek', 120000]); assert.equal(f.player.duration, 1446.2);
  f.player.progress(snapshot.id, 125000); assert.equal(f.player.currentTime, 125);
  f.player.playingChanged(snapshot.id, true); assert.equal(f.player.playing, true);
  f.player.playbackRate = 1.25; assert.equal(f.snapshots.at(-1).rate, 1.25);
});

test('switching MP4/MKV/HLS sources stops the previous VLC view and ignores old callbacks', async () => {
  const f = fixture(); await f.player.replaceAsync(nativeVideoSource(state, server, 'token'));
  const id = f.snapshots.at(-1).id; f.player.attach(id, f.view); f.player.play(); f.player.loaded(id, 1446200);
  await f.player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://cdn.example/film.mp4' }, server, 'token'));
  f.player.progress(id, 999000); f.player.playingChanged(id, true);
  assert.ok(f.calls.includes('stop')); assert.equal(f.player.currentTime, 0); assert.equal(f.player.playing, false);
  assert.match(f.snapshots.at(-1).source.uri, /film.mp4/);
  await f.player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://cdn.example/film.m3u8' }, server, 'token'));
  assert.equal(f.snapshots.at(-1).source.contentType, 'hls');
});

test('paused initial load stays paused when a delayed first-play callback arrives', async () => {
  const f = fixture(); const adapter = new NativeMediaAdapter(f.player);
  await adapter.apply({ ...state, isPlaying: false }, server, 'token');
  const id = f.snapshots.at(-1).id; f.player.attach(id, f.view); f.player.playingChanged(id, true); f.player.loaded(id, 1446200);
  assert.equal(f.player.playing, false); assert.ok(f.calls.includes('pause')); assert.equal(f.player.currentTime, 120);
});

test('pause while preparing cancels an earlier requested native start', async () => {
  const f = fixture(); const adapter = new NativeMediaAdapter(f.player);
  await adapter.apply(state, server, 'token'); const id = f.snapshots.at(-1).id; f.player.attach(id, f.view);
  await adapter.apply({ ...state, isPlaying: false }, server, 'token');
  f.player.playingChanged(id, true); f.player.loaded(id, 1446200);
  assert.equal(f.player.playing, false); assert.ok(f.calls.filter(call => call === 'pause').length >= 2);
});

test('track changes stay local and a new movie clears stale track IDs and subtitle URLs', async () => {
  const f = fixture(); await f.player.replaceAsync(nativeVideoSource(state, server, 'token')); const id = f.snapshots.at(-1).id;
  f.player.tracks(id, { audio: [{ id: 3, name: 'Japanese' }], video: [], subtitle: [{ id: 5, name: 'Chinese' }] });
  f.player.configure({ tracks: { audio: 3, subtitle: 5 }, volume: 30, subtitleDelay: 1, subtitleUri: 'https://cdn.example/subtitle.srt' });
  assert.equal(f.player.mediaTracks.audio[0].id, 3);
  await f.player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://cdn.example/new.mkv' }, server, 'token'));
  f.player.tracks(id, { audio: [{ id: 99, name: 'stale' }], video: [], subtitle: [] });
  assert.deepEqual(f.player.mediaTracks.audio, []); assert.deepEqual(f.player.mediaSettings.tracks, {}); assert.equal(f.player.mediaSettings.subtitleUri, undefined); assert.equal(f.player.mediaSettings.volume, 30);
});

test('token refresh preserves VLC position without changing the room source', async () => {
  const f = fixture(); const adapter = new NativeMediaAdapter(f.player);
  await adapter.apply(state, server, 'old'); let id = f.snapshots.at(-1).id;
  f.player.attach(id, f.view); f.player.loaded(id, 1446200); f.player.progress(id, 160000);
  await adapter.apply(state, server, 'new');
  assert.equal(f.snapshots.at(-1).initialTime, 160); assert.equal(new URL(f.snapshots.at(-1).source.uri).searchParams.get('token'), 'new');
  assert.doesNotMatch(state.sourceUrl, /token=/);
});

test('missing native module reports a rebuild requirement and disposal stops all writes', async () => {
  const missing = fixture(false);
  await assert.rejects(missing.player.replaceAsync(nativeVideoSource(state, server, 'token')), /Expo Go/);
  const f = fixture(); await f.player.replaceAsync(nativeVideoSource(state, server, 'token'));
  const id = f.snapshots.at(-1).id; f.player.attach(id, f.view); const count = f.snapshots.length;
  f.player.dispose(); f.player.progress(id, 99000); f.player.play(); f.player.currentTime = 70;
  await f.player.replaceAsync(null); assert.equal(f.snapshots.length, count); assert.ok(f.calls.includes('stop'));
});
