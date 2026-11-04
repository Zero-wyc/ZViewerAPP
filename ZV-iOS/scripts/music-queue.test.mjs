import assert from 'node:assert/strict';
import test from 'node:test';
import { activeMusicQueue, musicKey, QueueCursor, sourceQueue } from '../src/lib/musicQueue.ts';
import { applyCollection, completeCollection } from '../src/lib/musicCollection.ts';

const song = songId => ({ songId, name: `Song ${songId}`, artist: 'Artist', album: '', cover: '', durationMs: 1000, vip: false });
const mixed = [
  { ...song(1), id: 1 },
  { ...song(0), id: 2, biliBvid: 'BV17x411w7KC', biliCid: 11 },
  { ...song(3), id: 3 },
  { ...song(0), id: 4, biliBvid: 'BV17x411w7KC', biliCid: 22 },
];

test('source lists retain room order and never include tracks from the other source', () => {
  assert.deepEqual(sourceQueue(mixed, 'ncm').map(item => item.id), [1, 3]);
  assert.deepEqual(sourceQueue(mixed, 'bili').map(item => item.id), [2, 4]);
  assert.deepEqual(activeMusicQueue(mixed, null), sourceQueue(mixed, 'ncm'));
  assert.deepEqual(activeMusicQueue(mixed, 'bili:BV17x411w7KC:11'), sourceQueue(mixed, 'bili'));
});

test('next, previous, shuffle and the order boundary stay within the current source', () => {
  for (const source of ['ncm', 'bili']) {
    const items = sourceQueue(mixed, source); const cursor = new QueueCursor();
    cursor.select(items, items[0].id);
    assert.equal(cursor.advance(items, musicKey(items[0]), 'next', false, false)?.id, items[1].id);
    assert.equal(cursor.advance(items, musicKey(items[1]), 'next', false, false), null);
    assert.equal(cursor.advance(items, musicKey(items[1]), 'prev')?.id, items[0].id);
    for (let attempt = 0; attempt < 20; attempt++) {
      assert.ok(items.includes(cursor.advance(items, musicKey(items[0]), 'next', true)));
    }
  }
});

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function batchPort(initial = mixed) {
  const queue = [...initial]; const events = [];
  return { queue, events, port: {
    check() {},
    async clear() { events.push('clear'); queue.length = 0; },
    async add(item) { events.push(`add:${item.songId}`); queue.push(item); },
    async playFirst(item) { events.push(`play:${item.songId}`); },
    progress() {},
  } };
}

test('playlist play all waits for clear ACK, replaces the entire mixed queue, then starts the first song', async () => {
  const ack = deferred(); const { queue, events, port } = batchPort();
  const clear = port.clear;
  port.clear = async () => { events.push('clear-request'); await ack.promise; await clear(); };
  const work = applyCollection([song(10), song(20)], true, port);
  assert.deepEqual(queue, mixed);
  assert.deepEqual(events, ['clear-request']);
  ack.resolve(); assert.equal(await work, 2);
  assert.deepEqual(queue.map(item => item.songId), [10, 20]);
  assert.deepEqual(events, ['clear-request', 'clear', 'add:10', 'add:20', 'play:10']);
});

test('append all preserves both source lists and never starts or clears playback', async () => {
  const { queue, events, port } = batchPort();
  await applyCollection([song(10), song(20)], false, port);
  assert.deepEqual(queue, [...mixed, song(10), song(20)]);
  assert.deepEqual(events, ['add:10', 'add:20']);
});

test('denied clear cannot add songs, start playback or remove the old queue', async () => {
  const { queue, events, port } = batchPort();
  port.clear = async () => { throw new Error('denied'); };
  await assert.rejects(applyCollection([song(10)], true, port), /0\/1.*denied/);
  assert.deepEqual(queue, mixed); assert.deepEqual(events, []);
});

test('losing permission during clear ACK stops subsequent queue writes', async () => {
  const { events, port } = batchPort(); let allowed = true;
  port.check = () => { if (!allowed) throw new Error('permission changed'); };
  port.clear = async () => { events.push('clear'); allowed = false; };
  await assert.rejects(applyCollection([song(10)], true, port), /permission changed/);
  assert.deepEqual(events, ['clear']);
});

test('an add failure reports partial completion and cannot start an unconfirmed playlist', async () => {
  const { events, port } = batchPort();
  port.add = async item => { if (item.songId === 20) throw new Error('offline'); events.push(`add:${item.songId}`); };
  await assert.rejects(applyCollection([song(10), song(20)], true, port), /1\/2.*offline/);
  assert.deepEqual(events, ['clear', 'add:10']);
});

test('playlist pagination loads every page before replacing the old queue', async () => {
  const initial = Array.from({ length: 100 }, (_, index) => song(index + 1));
  const requests = []; const { queue, port } = batchPort();
  const ncm = async path => {
    assert.deepEqual(queue, mixed);
    requests.push(path);
    return { songs: Array.from({ length: 5 }, (_, index) => ({ id: 101 + index, name: `Song ${101 + index}`, dt: 1000 })) };
  };
  const all = await completeCollection(ncm, { playlistId: 7, title: 'Playlist', total: 105 }, initial, new AbortController().signal, () => {});
  assert.equal(all.length, 105);
  assert.deepEqual(requests, ['/playlist/track/all?id=7&limit=100&offset=100']);
  await applyCollection(all, true, port);
  assert.equal(queue.length, 105); assert.deepEqual(queue.map(item => item.songId), Array.from({ length: 105 }, (_, index) => index + 1));
});

test('incomplete or invalid playlists preserve the old queue', async () => {
  const { queue, events, port } = batchPort();
  await assert.rejects(completeCollection(async () => ({ songs: [] }), { playlistId: 7, title: 'Playlist', total: 101 }, Array.from({ length: 100 }, (_, index) => song(index + 1)), new AbortController().signal, () => {}), /未完整加载/);
  await assert.rejects(applyCollection([song(0)], true, port), /无效歌曲/);
  assert.deepEqual(queue, mixed); assert.deepEqual(events, []);
});
