import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
const server = 'https://service.example';
const state = { sourceUrl: '/api/jellyfin/stream?movieId=1', sourceType: 'jellyfin', currentTime: 40, isPlaying: true, playbackRate: 1 };
function player() {
  return { currentTime: 0, playing: false, playbackRate: 1, duration: 300, sources: [],
    play() { this.playing = true; }, pause() { this.playing = false; },
    async replaceAsync(source) { this.sources.push(source); this.currentTime = 0; } };
}

test('state updates do not seek to a stale broadcast time', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  await adapter.apply(state, server, 'token');
  native.currentTime = 80;
  await adapter.apply({ ...state, currentTime: 42, isPlaying: false }, server, 'token');
  assert.equal(native.currentTime, 80); assert.equal(native.playing, false); assert.equal(native.sources.length, 1);
});

test('token rotation preserves native position and replaces only authentication', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  await adapter.apply(state, server, 'old'); native.currentTime = 95;
  await adapter.apply(state, server, 'new');
  assert.equal(native.currentTime, 95); assert.equal(native.sources.at(-1).headers.Authorization, 'Bearer new');
});

test('a slow old load cannot overwrite a newer source', async () => {
  const native = player(); let finish;
  native.replaceAsync = async function(source) { this.sources.push(source); if (this.sources.length === 1) await new Promise(resolve => { finish = resolve; }); this.currentTime = 0; };
  const adapter = new NativeMediaAdapter(native);
  const first = adapter.apply(state, server, 'token'); await Promise.resolve();
  const next = adapter.apply({ ...state, sourceUrl: '/api/jellyfin/stream?movieId=2', currentTime: 120 }, server, 'token');
  finish(); await Promise.all([first, next]);
  assert.equal(native.currentTime, 120); assert.match(native.sources.at(-1).uri, /movieId=2/); assert.equal(adapter.busy, false);
});

test('unsupported new sources stop the old movie and permit retry', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  await adapter.apply(state, server, 'token');
  await assert.rejects(adapter.apply({ ...state, audioUrl: 'https://cdn.example/audio' }, server, 'token'), /分离音轨/);
  assert.equal(native.playing, false);
  await adapter.apply(state, server, 'token', 1); assert.equal(native.playing, true);
});

test('dispose stops playback and prevents all queued native writes', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  const task = adapter.apply(state, server, 'token'); adapter.dispose(); await task;
  assert.equal(native.sources.length, 0); assert.equal(native.playing, false);
  await adapter.apply(state, server, 'token'); assert.equal(native.sources.length, 0);
});
