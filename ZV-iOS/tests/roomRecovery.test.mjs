import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomPlayback, requestRoomPlayback } from '../src/lib/roomPlayback.ts';
import { moviePlayback } from '../src/lib/sources.ts';

const movie = { id: 4, source: 'emby', title: '剧集', url: '/api/emby/stream?movieId=4&ep=1', path: 'ep-1', currentPage: 1 };
const other = { id: 5, source: 'url', title: '另一影片', url: 'https://media.invalid/other.mp4' };
const recovery = { ...moviePlayback(movie), currentMovieId: 4, currentTime: 900, isPlaying: false, playbackRate: 1.5 };

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
