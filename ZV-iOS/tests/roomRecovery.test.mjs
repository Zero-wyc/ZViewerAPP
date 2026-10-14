import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback, requestRoomPlayback } from '../src/lib/roomPlayback.ts';
import { moviePlayback } from '../src/lib/sources.ts';
import { NativeMediaAdapter } from '../src/lib/mediaAdapter.ts';

const movie = { id: 4, source: 'emby', title: '剧集', url: '/api/emby/stream?movieId=4&ep=1', path: 'ep-1', currentPage: 1 };
const other = { id: 5, source: 'url', title: '另一影片', url: 'https://media.invalid/other.mp4' };
const recovery = { ...moviePlayback(movie), currentMovieId: 4, currentTime: 900, isPlaying: false, playbackRate: 1.5 };

test('web controls without movieId and server heartbeats with currentMovieId reuse the same Kazumi input', async () => {
  const film = { id: 101, source: 'kazumi', title: '番剧', url: '/api/stream/kazumi/proxy?url=https%3A%2F%2Fcdn.example%2Ffilm.m3u8', format: 'hls' };
  const room = new RoomPlayback(); room.list([film]); room.current(film.id);
  const native = { currentTime: 0, playbackRate: 1, playing: false, duration: 1459, sources: [], play() { this.playing = true; }, pause() { this.playing = false; }, async replaceAsync(source) { this.sources.push(source); this.currentTime = 0; } };
  const adapter = new NativeMediaAdapter(native);
  const state = { sourceUrl: film.url, sourceType: 'kazumi', format: 'hls', currentTime: 40, isPlaying: true };
  await adapter.apply(room.state({ ...state, currentMovieId: 101 }), 'https://server.example', 'token');
  native.currentTime = 80;
  await adapter.apply(room.state({ ...state, currentTime: 82, isPlaying: false }), 'https://server.example', 'token');
  assert.equal(room.value().movieId, 101); assert.equal(native.playing, false);
  await adapter.apply(room.state({ ...state, currentMovieId: 101, currentTime: 82, isPlaying: false }), 'https://server.example', 'token');
  await adapter.apply(room.state({ ...state, currentTime: 82 }), 'https://server.example', 'token');
  assert.equal(native.sources.length, 1); assert.equal(native.currentTime, 80); assert.equal(native.playing, true);
});

for (const order of [['list', 'recovery', 'current'], ['recovery', 'current', 'list'], ['recovery', 'list', 'current']]) {
  test(`host registration restores progress across ${order.join('/')} and a duplicate current-movie`, () => {
    const room = new RoomPlayback();
    for (const event of order) {
      if (event === 'list') room.list([movie, other]);
      if (event === 'recovery') room.state(recovery);
      if (event === 'current') room.current(movie.id);
      assert.equal(room.hostMovieToActivate, undefined);
    }
    assert.equal(room.value().currentTime, 900); assert.equal(room.value().isPlaying, false);
    assert.equal(room.value().playbackRate, 1.5);
    room.current(movie.id);
    assert.equal(room.hostMovieToActivate, undefined); assert.equal(room.value().currentTime, 900);
    // An actual play-movie selecting another film still activates from zero.
    assert.equal(room.current(other.id), null);
    assert.equal(room.hostMovieToActivate, other);
    room.state({ ...moviePlayback(room.hostMovieToActivate), currentTime: 0, isPlaying: true });
    assert.equal(room.value().currentTime, 0); assert.equal(room.value().isPlaying, true);
  });
}

test('host starts a new room film and an updated episode when no matching recovery exists', () => {
  const room = new RoomPlayback(); room.list([movie]); room.current(movie.id);
  assert.equal(room.hostMovieToActivate, movie);
  room.state(recovery);
  const next = { ...movie, path: 'ep-2', currentPage: 2, url: '/api/emby/stream?movieId=4&ep=2' };
  room.list([next]);
  assert.equal(room.hostMovieToActivate, next);
  room.state({ ...moviePlayback(next), currentTime: 0, isPlaying: true });
  assert.equal(room.value().currentTime, 0); assert.equal(room.hostMovieToActivate, undefined);
});

test('delayed room-state ACKs cannot revive a disconnected room or overwrite a newer movie selection', () => {
  const callbacks = [];
  const socket = { timeout() { return { emit(event, payload, callback) { assert.equal(event, 'watch-together-request-state'); assert.equal(payload.roomId, 'room'); callbacks.push(callback); } }; } };
  const room = new RoomPlayback(); room.list([movie, other]); room.current(movie.id);
  let generation = 1; let selection = 1;
  const request = () => {
    const version = generation; const operation = selection; const revision = room.revision;
    requestRoomPlayback(socket, 'room', () => version === generation && operation === selection && revision === room.revision,
      value => room.state(value));
  };
  request(); generation++; room.reset();
  callbacks.shift()(null, { success: true, data: { state: recovery } });
  assert.equal(room.value(), null);

  room.list([movie, other]); room.current(movie.id); request();
  selection++; room.current(other.id);
  const next = { ...moviePlayback(other), currentTime: 12, isPlaying: true };
  room.state(next);
  callbacks.shift()(null, { success: true, data: { state: recovery } });
  assert.equal(room.value().movieId, other.id); assert.equal(room.value().currentTime, 12);

  request(); callbacks.shift()(null, { success: true, data: { state: { ...next, currentTime: 20 } } });
  assert.equal(room.value().currentTime, 20);
  request(); callbacks.shift()(null, { success: false, data: { state: recovery } });
  assert.equal(room.value().movieId, other.id);
});


test('switching Jellyfin to Kazumi cannot reuse the prior library URL from a web control message', () => {
  const jellyfin = { id: 102, source: 'jellyfin', title: 'NAS', url: '/api/jellyfin/stream?movieId=102&ep=1', format: 'mkv' };
  const kazumi = { id: 101, source: 'kazumi', title: 'HLS', url: '/api/stream/kazumi/proxy?url=https%3A%2F%2Fcdn.example%2Fshow.m3u8', format: 'hls' };
  const room = new RoomPlayback(); room.list([jellyfin, kazumi]); room.current(102);
  room.state({ ...moviePlayback(jellyfin), currentTime: 100, isPlaying: true });
  room.current(101);
  const next = room.state({ sourceUrl: jellyfin.url, sourceType: 'jellyfin', format: 'mkv', currentTime: 0, isPlaying: true });
  assert.equal(next.movieId, 101); assert.equal(next.sourceType, 'kazumi');
  assert.equal(next.sourceUrl, kazumi.url); assert.equal(next.format, 'hls');
  const stale = room.state({ ...moviePlayback(jellyfin), currentTime: 150, isPlaying: true });
  assert.equal(stale.movieId, 101); assert.equal(stale.sourceUrl, kazumi.url);
});
