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
  const native = player(); let finish; let started;
  const loading = new Promise(resolve => { started = resolve; });
  native.replaceAsync = async function(source) { this.sources.push(source); if (this.sources.length === 1) await new Promise(resolve => { finish = resolve; started(); }); this.currentTime = 0; };
  const adapter = new NativeMediaAdapter(native);
  const first = adapter.apply(state, server, 'token'); await loading;
  const next = adapter.apply({ ...state, sourceUrl: '/api/jellyfin/stream?movieId=2', currentTime: 120 }, server, 'token');
  finish(); await Promise.all([first, next]);
  assert.equal(native.currentTime, 120); assert.match(native.sources.at(-1).uri, /movieId=2/); assert.equal(adapter.busy, false);
});

test('unsupported new sources stop the old movie and permit retry', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  await adapter.apply(state, server, 'token');
  await assert.rejects(adapter.apply({ ...state, sourceType: 'unsupported' }, server, 'token'), /先解析/);
  assert.equal(native.playing, false);
  await adapter.apply(state, server, 'token', 1); assert.equal(native.playing, true);
});

test('dispose stops playback and prevents all queued native writes', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  const task = adapter.apply(state, server, 'token'); adapter.dispose(); await task;
  assert.equal(native.sources.length, 0); assert.equal(native.playing, false);
  await adapter.apply(state, server, 'token'); assert.equal(native.sources.length, 0);
});

test('a reused stream URL reloads a different episode or movie at its own position', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  const first = { ...state, movieId: 1, currentPage: 1, currentTime: 900 };
  await adapter.apply(first, server, 'token');
  await adapter.apply({ ...first, currentPage: 2, currentTime: 0 }, server, 'token');
  assert.equal(native.currentTime, 0); assert.equal(native.sources.length, 2);
  native.currentTime = 200;
  await adapter.apply({ ...first, movieId: 2, currentTime: 12 }, server, 'token');
  assert.equal(native.currentTime, 12); assert.equal(native.sources.length, 3);
});

test('token rotation during native replacement preserves the initial seek until it is applied', async () => {
  const native = player(); let finish; let started;
  const loading = new Promise(resolve => { started = resolve; });
  native.replaceAsync = async function(source) {
    this.sources.push(source); this.currentTime = 0;
    if (this.sources.length === 1) await new Promise(resolve => { finish = resolve; started(); });
  };
  const adapter = new NativeMediaAdapter(native);
  const first = adapter.apply({ ...state, currentTime: 95 }, server, 'old'); await loading;
  const rotated = adapter.apply({ ...state, currentTime: 96 }, server, 'new');
  finish(); await Promise.all([first, rotated]);
  assert.equal(native.currentTime, 95); assert.equal(native.sources.length, 2);
  assert.equal(native.sources.at(-1).headers.Authorization, 'Bearer new');
});
