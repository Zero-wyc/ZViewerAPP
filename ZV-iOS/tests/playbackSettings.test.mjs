import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
import { playbackAfterSettings } from '../src/lib/playbackSettings.ts';
import { waitForPlayerReady } from '../src/lib/playerReady.ts';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';
import { nativeVideoSource } from '../src/lib/media.ts';

const movie = { id: 1, title: 'fixture', source: 'mp4', url: 'https://media.example/video.mp4', playsvideoEnabled: false };
const initial = { movieId: movie.id, sourceUrl: movie.url, sourceType: 'mp4', isPlaying: true, currentTime: 0, playbackRate: 1 };

test('browser-only policy confirmation preserves a later pause, rate and clock without replacing VLC', async () => {
  const room = new RoomPlayback(); room.list([movie]); room.current(movie.id); room.state(initial);
  const player = { currentTime: 0, playbackRate: 1, playing: false, duration: 200, replacements: 0,
    play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync() { this.replacements++; } };
  const adapter = new NativeMediaAdapter(player);
  await adapter.apply(initial, 'https://server.example', 'fixture');
  player.currentTime = 60; player.playbackRate = 1.5; player.pause();
  const latestIntent = { ...initial, isPlaying: false, playbackRate: 1.5, currentTime: 60 };
  const confirmed = room.list([{ ...movie, playsvideoEnabled: true }]);
  const applied = playbackAfterSettings(confirmed, latestIntent, player);
  room.state(applied); await adapter.apply(applied, 'https://server.example', 'fixture');
  assert.equal(applied.playsvideoEnabled, true); assert.equal(applied.currentTime, 60);
  assert.equal(room.value().isPlaying, false); assert.equal(room.value().playbackRate, 1.5);
  assert.equal(player.playing, false); assert.equal(player.playbackRate, 1.5); assert.equal(player.replacements, 1);
});

test('paused native media-ready event finishes settings confirmation and applies the initial seek without playing', async () => {
  let snapshot; const commands = [];
  const player = new VlcPlayer(value => { snapshot = value; }, true);
  const native = { async play() { commands.push('play'); }, async pause() { commands.push('pause'); }, async stop() {}, async seek(time) { commands.push(['seek', time]); return time; } };
  await player.replaceAsync(nativeVideoSource(initial, 'https://server.example', 'fixture'));
  player.attach(snapshot.id, native, true); player.currentTime = 42; player.playbackRate = 1.5; player.pause();
  const pending = waitForPlayerReady(player, new AbortController().signal, 100);
  // ZViewerPausedMediaReady forwards the paused input's first media info through
  // onFirstPlay as well, so no synthetic playing callback is needed.
  player.loaded(snapshot.id, 200000); await pending;
  assert.equal(player.preparing, false); assert.equal(player.playing, false);
  assert.equal(player.currentTime, 42); assert.equal(player.playbackRate, 1.5);
  assert(commands.some(value => Array.isArray(value) && value[0] === 'seek' && value[1] === 42000));
  assert(!commands.includes('play')); player.dispose();
});

test('HLS settings wait for a confirmed native seek rather than the first-play or optimistic clock', async context => {
  let now = 1000; context.mock.method(Date, 'now', () => now);
  let snapshot; let settle; const player = new VlcPlayer(value => { snapshot = value; }, true);
  const native = { async play() {}, async pause() {}, async stop() {}, seek() { return new Promise(resolve => { settle = resolve; }); } };
  await player.replaceAsync({ ...nativeVideoSource({ sourceUrl: 'https://media.example/vod.m3u8' }, 'https://server.example', 'fixture'), duration: 634.584 });
  const revision = snapshot.id; player.attach(revision, native, true); player.currentTime = 81.043; player.playbackRate = 1.5; player.pause();
  let completed = false; const pending = waitForPlayerReady(player, new AbortController().signal, 1000).then(() => { completed = true; });
  player.loaded(revision, 0); await Promise.resolve();
  assert.equal(completed, false); assert.equal(player.duration, 634.584);
  now += 7000; player.progress(revision, 90000);
  assert.equal(player.seeking, true); assert.equal(completed, false);
  settle(81043); await pending;
  assert.equal(player.currentTime, 81.043); assert.equal(player.seeking, false);
  assert.equal(player.playing, false); assert.equal(player.playbackRate, 1.5); player.dispose();
});

test('HLS first-play without a VOD duration does not complete settings confirmation', async () => {
  let snapshot; const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource({ sourceUrl: 'https://media.example/vod.m3u8' }, 'https://server.example', 'fixture'));
  let completed = false; const pending = waitForPlayerReady(player, new AbortController().signal, 1000).then(() => { completed = true; });
  player.loaded(snapshot.id, 0); await Promise.resolve(); assert.equal(completed, false);
  player.durationChanged(snapshot.id, 634634); await pending; assert.equal(completed, true); player.dispose();
});

test('a native seek failure remains an application failure after the media has loaded', async () => {
  let snapshot; let rejectSeek; const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource(initial, 'https://server.example', 'fixture'));
  player.attach(snapshot.id, { async play() {}, async pause() {}, async stop() {}, seek() { return new Promise((_, reject) => { rejectSeek = reject; }); } }, true);
  player.currentTime = 81.043; const pending = waitForPlayerReady(player, new AbortController().signal, 1000);
  player.loaded(snapshot.id, 200000); rejectSeek(Error('seek did not settle'));
  await assert.rejects(pending, /拖动进度失败/); assert.equal(player.readyForSettings, false); player.dispose();
});

test('late native seek retains its remaining confirmation budget after media preparation timeout', async () => {
  let snapshot, settle; const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource(initial, 'https://server.example', 'fixture'));
  player.attach(snapshot.id, { async play() {}, async pause() {}, async stop() {}, seek() { return new Promise(resolve => { settle = resolve; }); } }, true);
  player.currentTime = 81.043; player.loaded(snapshot.id, 200000);
  assert(player.seekConfirmationDeadline > Date.now() + 34000);
  let completed = false; const pending = waitForPlayerReady(player, new AbortController().signal, 10).then(() => { completed = true; });
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(completed, false);
  settle(81043); await pending; assert.equal(completed, true); player.dispose();
});

test('an expired native confirmation budget does not extend settings application indefinitely', async context => {
  let now = 1000; context.mock.method(Date, 'now', () => now);
  let snapshot; const player = new VlcPlayer(value => { snapshot = value; }, true);
  await player.replaceAsync(nativeVideoSource(initial, 'https://server.example', 'fixture'));
  player.attach(snapshot.id, { async play() {}, async pause() {}, async stop() {}, seek() { return new Promise(() => {}); } }, true);
  player.currentTime = 81.043; player.loaded(snapshot.id, 200000);
  now += 36000;
  await assert.rejects(waitForPlayerReady(player, new AbortController().signal, 10), /媒体准备超时/);
  player.dispose();
});
