import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';
const server = 'https://service.example';
const state = { sourceUrl: '/api/jellyfin/stream?movieId=1', sourceType: 'jellyfin', currentTime: 40, isPlaying: true, playbackRate: 1 };
test('native failure survives room heartbeats until explicit retry', async () => {
  const native = player(); let resolutions = 0;
  const adapter = new NativeMediaAdapter(native, async (...args) => { resolutions++; const { nativeVideoSource } = await import('../src/lib/media.ts'); return nativeVideoSource(...args); });
  await adapter.apply(state, server, 'token'); adapter.nativeFailed();
  for (let clock = 41; clock <= 50; clock++) await adapter.apply({ ...state, currentTime: clock }, server, 'token');
  assert.equal(adapter.failed, true); assert.equal(native.playing, false); assert.equal(resolutions, 1); assert.equal(native.sources.length, 1);
  adapter.invalidate(); await adapter.apply(state, server, 'token');
  assert.equal(adapter.failed, false); assert.equal(native.playing, true); assert.equal(resolutions, 2); assert.equal(native.sources.length, 2);
});
test('resolution failure does not loop on broadcasts and a different movie can recover', async () => {
  const native = player(); let resolutions = 0;
  const adapter = new NativeMediaAdapter(native, async (value, ...args) => { resolutions++; if (!value.movieId) throw Error('upstream unavailable'); const { nativeVideoSource } = await import('../src/lib/media.ts'); return nativeVideoSource(value, ...args); });
  await assert.rejects(adapter.apply(state, server, 'token'), /upstream unavailable/);
  await adapter.apply({ ...state, currentTime: 44 }, server, 'token');
  assert.equal(resolutions, 1); assert.equal(adapter.failed, true);
  await adapter.apply({ ...state, movieId: 2 }, server, 'token');
  assert.equal(resolutions, 2); assert.equal(adapter.failed, false); assert.equal(native.playing, true);
});
test('a native error during initial attachment cannot be cleared or resumed by its completion', async () => {
  const native = player(); const adapter = new NativeMediaAdapter(native);
  native.replaceAsync = async function(source) { this.sources.push(source); adapter.nativeFailed(); };
  await adapter.apply(state, server, 'token');
  assert.equal(adapter.failed, true); assert.equal(native.playing, false);
  await adapter.apply({ ...state, currentTime: 42 }, server, 'token');
  assert.equal(native.sources.length, 1); assert.equal(adapter.failed, true); assert.equal(native.playing, false);
});
test('an old input failure during resolution cannot hide a successfully attached new movie', async () => {
  const native = player(); let finish; let resolving;
  const waiting = new Promise(resolve => { resolving = resolve; });
  const adapter = new NativeMediaAdapter(native, async (value, ...args) => {
    if (value.movieId === 2) { resolving(); await new Promise(resolve => { finish = resolve; }); }
    const { nativeVideoSource } = await import('../src/lib/media.ts'); return nativeVideoSource(value, ...args);
  });
  await adapter.apply(state, server, 'token');
  const next = adapter.apply({ ...state, movieId: 2 }, server, 'token'); await waiting;
  adapter.nativeFailed(); finish(); await next;
  assert.equal(adapter.failed, false); assert.equal(native.playing, true); assert.equal(native.sources.length, 2);
});
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

test('clock, duration and play/pause updates do not resolve a fresh signed URL or restart VLC', async () => {
  const native = player(); let resolutions = 0;
  const adapter = new NativeMediaAdapter(native, async () => ({ uri: `https://cdn.example/video?signature=${++resolutions}`, identity: 'movie-1', contentType: 'progressive', headers: {}, options: [], slaves: [] }));
  await adapter.apply(state, server, 'token'); native.currentTime = 80;
  await adapter.apply({ ...state, currentTime: 42, duration: 400, isPlaying: false }, server, 'token');
  await adapter.apply({ ...state, currentTime: 44, duration: 400, playbackRate: 1.5 }, server, 'token');
  assert.equal(resolutions, 1); assert.equal(native.sources.length, 1);
  assert.equal(native.currentTime, 80); assert.equal(native.playing, true); assert.equal(native.playbackRate, 1.5);
  adapter.invalidate(); await adapter.apply(state, server, 'token');
  assert.equal(resolutions, 2); assert.equal(native.sources.length, 2); assert.equal(native.currentTime, 80);
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

test('native relay lifecycle survives control updates and releases each retired or cleared input', async () => {
  const native = player(); const released = [];
  const adapter = new NativeMediaAdapter(native, async state => ({ uri: `http://127.0.0.1/local-${state.movieId}`, identity: `movie-${state.movieId}`, contentType: 'hls', headers: {}, options: [], slaves: [], dispose() { released.push(state.movieId); } }));
  await adapter.apply({ ...state, movieId: 1 }, server, 'token');
  await adapter.apply({ ...state, movieId: 1, isPlaying: false }, server, 'token');
  assert.deepEqual(released, []);
  await adapter.apply({ ...state, movieId: 2 }, server, 'token'); assert.deepEqual(released, [1]);
  await adapter.apply(null, server, 'token'); assert.deepEqual(released, [1, 2]);
  await adapter.apply({ ...state, movieId: 3 }, server, 'token'); adapter.dispose();
  assert.deepEqual(released, [1, 2, 3]);
});

test('a resolved relay is released when native attachment fails', async () => {
  const native = player(); let releases = 0;
  native.replaceAsync = async () => { throw Error('native attach failed'); };
  const adapter = new NativeMediaAdapter(native, async () => ({ uri: 'http://127.0.0.1/local', identity: 'movie', contentType: 'hls', headers: {}, options: [], slaves: [], dispose() { releases++; } }));
  await assert.rejects(adapter.apply(state, server, 'token'), /native attach failed/);
  assert.equal(releases, 1); adapter.dispose(); assert.equal(releases, 1);
});
