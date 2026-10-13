import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { moviePlayback } from '../src/lib/sources.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';

for (const kind of ['jellyfin', 'emby']) test(`${kind} episode changes wait for a fresh host state instead of seeking to the previous episode position`, async () => {
  const movie = { id: 4, source: kind, title: '剧集', url: `/api/${kind}/stream?movieId=4&ep=1`, path: 'ep-1', currentPage: 1 };
  const room = new RoomPlayback(); room.list([movie]); room.current(movie.id);
  room.state({ ...moviePlayback(movie), currentTime: 900, isPlaying: true });
  const next = { ...movie, url: `/api/${kind}/stream?movieId=4&ep=2`, path: 'ep-2', currentPage: 2 };
  assert.equal(room.list([next]), null);
  assert.equal(room.currentId, movie.id);
  const fresh = room.state({ ...moviePlayback(next), currentTime: 0, isPlaying: true });
  const player = { currentTime: 900, duration: 1800, playbackRate: 1, playing: true, play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync() {} };
  await new NativeMediaAdapter(player).apply(fresh, 'https://room.invalid', 'token');
  assert.equal(player.currentTime, 0); assert.equal(player.playing, true);
});

test('library version changes retain the same episode position and early new-episode state survives its list update', () => {
  const movie = { id: 4, source: 'emby', title: '剧集', url: '/api/emby/stream?movieId=4&ep=1&ms=1080', path: 'ep-1', currentPage: 1 };
  const room = new RoomPlayback(); room.list([movie]); room.current(movie.id);
  room.state({ ...moviePlayback(movie), currentTime: 900, isPlaying: false });
  const otherVersion = { ...movie, url: '/api/emby/stream?movieId=4&ep=1&ms=4k' };
  assert.equal(room.list([otherVersion]).currentTime, 900); assert.equal(room.value().isPlaying, false);
  const next = { ...otherVersion, url: '/api/emby/stream?movieId=4&ep=2', path: 'ep-2', currentPage: 2 };
  assert.equal(room.state({ ...moviePlayback(next), currentTime: 0, isPlaying: true }), null);
  assert.equal(room.list([next]).currentTime, 0); assert.equal(room.value().sourceUrl, next.url);
});

for (const kind of ['jellyfin', 'emby']) test(`${kind} accepts an early Android/HarmonyOS episode state without carrying over iOS-only fields`, () => {
  const movie = { id: 4, source: kind, title: '剧集', url: `/api/${kind}/stream?movieId=4&ep=1`, path: 'ep-1', currentPage: 1 };
  const room = new RoomPlayback(); room.list([movie]); room.current(4);
  room.state({ ...moviePlayback(movie), currentMovieId: 4, currentTime: 900, isPlaying: true });
  const next = { ...movie, path: 'ep-2', currentPage: 2, url: `/api/${kind}/stream?movieId=4&ep=2` };
  // Shared clients send the complete SyncStateDto: no movieId/currentPage.
  const state = { sourceType: kind, sourceUrl: `https://room.invalid${next.url}&token=other-device`, currentTime: 0, isPlaying: true };
  assert.equal(room.state(state), null);
  const value = room.list([next]);
  assert.equal(value.currentTime, 0); assert.equal(value.currentPage, 2);
  assert.equal(value.currentMovieId, undefined); assert.equal(value.sourceUrl, next.url);
  assert.equal(room.state({ ...state, sourceUrl: movie.url, currentTime: 905 }), null);
  assert.equal(room.state(state).currentTime, 0);
});

test('early direct-link episode state survives a movie-list update without currentPage', () => {
  const movie = { id: 4, source: 'emby', title: '剧集', url: 'https://media.invalid/episode-1.mp4', path: 'ep-1', currentPage: 1 };
  const room = new RoomPlayback(); room.list([movie]); room.current(4);
  room.state({ ...moviePlayback(movie), currentTime: 900, isPlaying: true });
  const next = { ...movie, url: 'https://media.invalid/episode-2.mp4', path: 'ep-2', currentPage: 2 };
  room.state({ sourceType: 'emby', sourceUrl: next.url, currentTime: 0, isPlaying: false });
  const value = room.list([next]);
  assert.equal(value.currentTime, 0); assert.equal(value.currentPage, 2); assert.equal(value.isPlaying, false);
});

test('a path-only episode update waits for a fresh state even when the URL and page are reused', () => {
  const movie = { id: 4, source: 'emby', title: '剧集', url: '/api/emby/stream?movieId=4', path: 'old-episode', currentPage: 1 };
  const room = new RoomPlayback(); room.list([movie]); room.current(4);
  room.state({ ...moviePlayback(movie), currentTime: 900, isPlaying: true });
  assert.equal(room.list([{ ...movie, path: 'new-episode' }]), null);
});
