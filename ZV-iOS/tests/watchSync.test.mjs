import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WatchSync, watchStateChanged } from '../src/lib/watchSync.ts';
const state = { sourceUrl: 'https://cdn.example/video.m3u8', isPlaying: true, currentTime: 40, playbackRate: 1 };
test('server authority wins over alternating stale host heartbeat samples', () => {
  const sync = new WatchSync();
  for (let now = 0; now < 60000; now += 2000) {
    assert(sync.accepts('server', now));
    assert(!sync.accepts('host', now + 100));
    assert.equal(sync.target({ ...state, currentTime: now / 1000 + 40 }, now / 1000 + 37, true, false, now), null);
  }
  assert(sync.accepts('host', 65000), 'legacy hosts remain usable without server samples');
});
test('progress-only server samples do not cancel Bili source resolution', () => {
  assert(!watchStateChanged(state, { ...state, currentTime: 300, updatedAt: Date.now() }));
  assert(watchStateChanged(state, { ...state, sourceUrl: 'https://cdn.example/other.m3u8' }));
  assert(watchStateChanged(state, { ...state, isPlaying: false }));
});
test('loading, seeking and settling inputs reject drift corrections', () => {
  const sync = new WatchSync();
  assert.equal(sync.target(state, 0, false, false, 0), null);
  assert.equal(sync.target(state, 0, true, true, 0), null);
  assert.equal(sync.target(state, 0, true, false, 0), 40);
  assert.equal(sync.target({ ...state, currentTime: 43 }, 0, true, false, 3000), null);
  assert.equal(sync.target({ ...state, currentTime: 51 }, 0, true, false, 11000), 51);
  assert.equal(sync.target({ ...state, currentTime: NaN }, 0, true, false, 30000), null);
});
