import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MovieAddTransaction } from '../src/lib/movieAddition.ts';
import { addAnimeEpisodes } from '../src/lib/animeSources.ts';
import { canonicalSelection } from '../src/lib/sources.ts';

test('a batch refresh failure can be retried after later episodes without duplicating its successful POST', async () => {
  const flow = new MovieAddTransaction(); const writes = []; let refreshes = 0;
  const episodes = ['one', 'two', 'three'].map((id, index) => ({ id, title: id, episodeNumber: index + 1, playbackParams: {} }));
  const port = {
    create: async value => { const movie = { ...value, id: writes.length + 1 }; writes.push(movie); return movie; },
    patchLocalOnly: async () => {}, status: () => {}, play: async () => assert.fail('batch must not autoplay'),
    refresh: async () => { if (++refreshes === 2) throw new Error('refresh unavailable'); },
  };
  const add = value => flow.run('server:user:room', value, false, port).then(() => {});
  const request = async () => assert.fail('ani-subs resolves at playback');
  const result = await addAnimeEpisodes(request, 'anisubs', 'source', '示例', episodes, add);
  assert.deepEqual(result.added, ['one', 'three']);
  assert.deepEqual(result.failures, [{ id: 'two', message: 'refresh unavailable' }]);
  const retry = await addAnimeEpisodes(request, 'anisubs', 'source', '示例', [episodes[1]], add);
  assert.deepEqual(retry, { added: ['two'], failures: [] });
  assert.equal(writes.length, 3); assert.equal(refreshes, 4);
  // A later explicit addition after successful completion is a new transaction.
  await addAnimeEpisodes(request, 'anisubs', 'source', '示例', [episodes[1]], add);
  assert.equal(writes.length, 4);
});

test('pending add retries preserve the cliOnly patch and never reuse another room or a reset transaction', async () => {
  const flow = new MovieAddTransaction(); let creates = 0; let patches = 0; let refreshFails = true;
  const value = { source: 'bilibili', title: '示例', url: 'https://www.bilibili.com/bangumi/play/ep42', cliOnly: true };
  const port = { create: async () => ({ ...value, cliOnly: false, id: ++creates }), patchLocalOnly: async () => { patches++; },
    status: () => {}, play: async () => {}, refresh: async () => { if (refreshFails) throw new Error('refresh unavailable'); } };
  await assert.rejects(flow.run('room-a', value, false, port), /refresh unavailable/);
  await assert.rejects(flow.run('room-b', value, false, port), /refresh unavailable/);
  assert.equal(creates, 2); assert.equal(patches, 2);
  refreshFails = false; await flow.run('room-a', value, false, port);
  assert.equal(creates, 2); assert.equal(patches, 2);
  flow.reset(); await flow.run('room-b', value, false, port);
  assert.equal(creates, 3); assert.equal(patches, 3);
});

for (const kind of ['kazumi', 'anime']) test(`${kind} rotating signed URLs cannot duplicate an already-created episode after refresh failure`, async () => {
  const flow = new MovieAddTransaction(); const pending = new Map(); const writes = []; const resolved = []; let refreshes = 0;
  const episodes = ['one', 'two', 'three'].map((id, index) => ({ id, title: id, episodeNumber: index + 1, playbackParams: {} }));
  const request = async (_path, { body }) => {
    const { episode } = JSON.parse(body); resolved.push(episode.id);
    return { url: `https://cdn.invalid/${episode.id}.m3u8?sign=rotation-${resolved.length}`, audioUrl: `https://cdn.invalid/${episode.id}.m4a?sign=audio-${resolved.length}`, format: 'hls' };
  };
  const port = {
    create: async value => { const movie = { ...value, id: writes.length + 1 }; writes.push(movie); return movie; },
    patchLocalOnly: async () => {}, status: () => {}, play: async () => assert.fail('batch must not autoplay'),
    refresh: async () => { if (++refreshes === 2) throw new Error('refresh unavailable'); },
  };
  const add = value => flow.run('server:user:room', canonicalSelection(value, 'https://server.invalid', 'fixture-session'), false, port).then(() => {});
  const first = await addAnimeEpisodes(request, kind, 'source', '示例', episodes, add, undefined, pending);
  assert.deepEqual(first, { added: ['one', 'three'], failures: [{ id: 'two', message: 'refresh unavailable' }] });
  assert.equal(writes.length, 3); assert.equal(pending.size, 1);
  const retry = await addAnimeEpisodes(request, kind, 'source', '示例', [episodes[1]], add, undefined, pending);
  assert.deepEqual(retry, { added: ['two'], failures: [] });
  assert.deepEqual(resolved, ['one', 'two', 'three'], 'unfinished additions must reuse the original signed selection');
  assert.equal(writes.length, 3); assert.equal(refreshes, 4); assert.equal(pending.size, 0);
  // Completion releases the cached URL so a later explicit addition resolves
  // a fresh signature and creates a new item as requested.
  await addAnimeEpisodes(request, kind, 'source', '示例', [episodes[1]], add, undefined, pending);
  assert.deepEqual(resolved, ['one', 'two', 'three', 'two']); assert.equal(writes.length, 4);
  assert.match(new URL(writes[3].url, 'https://server.invalid').searchParams.get('url'), /rotation-4$/);
  assert.equal(pending.size, 0);
});

test('pending anime selections are isolated by provider, source, series and episode identity', async () => {
  const pending = new Map(); const resolved = [];
  const episode = { id: 'same-id', title: 'one', episodeNumber: 1, playbackParams: {} };
  const request = async (path, { body }) => { resolved.push([path, JSON.parse(body).source]); return { url: `https://cdn.invalid/video.mp4?sign=${resolved.length}` }; };
  const fail = async () => { throw new Error('add unavailable'); };
  for (const [kind, source, name, id] of [['kazumi', 'a', 'first', 'same-id'], ['anime', 'a', 'first', 'same-id'], ['kazumi', 'b', 'first', 'same-id'], ['kazumi', 'a', 'second', 'same-id'], ['kazumi', 'a', 'first', 'next-id']]) {
    await addAnimeEpisodes(request, kind, source, name, [{ ...episode, id }], fail, undefined, pending);
  }
  assert.equal(resolved.length, 5); assert.equal(pending.size, 5);
  const retried = [];
  await addAnimeEpisodes(request, 'kazumi', 'a', 'first', [episode], async value => retried.push(value), undefined, pending);
  assert.equal(resolved.length, 5); assert.equal(pending.size, 4);
  assert.equal(new URL(retried[0].url, 'https://server.invalid').searchParams.get('url'), 'https://cdn.invalid/video.mp4?sign=1');
});
