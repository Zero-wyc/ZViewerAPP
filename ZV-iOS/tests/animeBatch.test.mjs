import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { addAnimeEpisodes } from '../src/lib/animeSources.ts';

// This is the AbortController implementation installed by React Native 0.86.
const { AbortController } = createRequire(import.meta.url)('abort-controller');
const episode = (id, episodeNumber = 1) => ({
  id, title: `第 ${episodeNumber} 集`, episodeNumber,
  playbackParams: { url: `https://source.invalid/watch/${id}`, line: 2, token: 'fixture-token' },
});

for (const kind of ['anime', 'kazumi', 'anisubs']) {
  test(`${kind} batch retains episode identity and retries only failed additions`, async () => {
    const entries = [episode('ep-1', 1), episode('ep-2', 2), episode('ep-3', 3)];
    const writes = []; const resolved = []; let failSecond = true;
    const request = async (path, options) => {
      assert.equal(path, `/api/stream/${kind}/resolve`);
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body); resolved.push(body);
      assert.equal(body.source, 'source-with-identity');
      assert.deepEqual(body.episode, entries.find(item => item.id === body.episode.id));
      if (body.episode.id === 'ep-2' && failSecond) throw new Error('resolve unavailable');
      return { url: `https://cdn.invalid/${body.episode.id}.m3u8`, format: 'hls' };
    };
    const add = async value => {
      // ani-subs resolves at playback, so exercise the add API failure there.
      if (kind === 'anisubs' && value.sourceMeta.episode.id === 'ep-2' && failSecond) throw new Error('add unavailable');
      writes.push(value);
    };
    const result = await addAnimeEpisodes(request, kind, 'source-with-identity', '示例番剧', entries, add, new AbortController().signal);
    assert.deepEqual(result.added, ['ep-1', 'ep-3']);
    assert.deepEqual(result.failures, [{ id: 'ep-2', message: kind === 'anisubs' ? 'add unavailable' : 'resolve unavailable' }]);
    assert.equal(writes.length, 2);
    failSecond = false;
    const retry = await addAnimeEpisodes(request, kind, 'source-with-identity', '示例番剧', entries.filter(item => !result.added.includes(item.id)), add);
    assert.deepEqual(retry, { added: ['ep-2'], failures: [] });
    assert.equal(writes.length, 3);
    assert.deepEqual(writes.map(item => item.title), ['示例番剧 · 第 1 集', '示例番剧 · 第 3 集', '示例番剧 · 第 2 集']);
    if (kind === 'anisubs') {
      assert.deepEqual(resolved, []);
      for (const value of writes) {
        assert.equal(value.source, 'anime');
        assert.equal(value.url, `anisubs://source-with-identity/${value.sourceMeta.episode.id}`);
        assert.equal(value.sourceMeta.sourceId, 'source-with-identity');
        assert.equal(value.sourceMeta.originalTitle, value.title);
        assert.deepEqual(value.sourceMeta.episode, entries.find(item => item.id === value.sourceMeta.episode.id));
      }
    } else {
      assert.deepEqual(resolved.map(item => item.episode.id), ['ep-1', 'ep-2', 'ep-3', 'ep-2']);
      assert(writes.every(value => value.source === (kind === 'anime' ? 'mp4' : kind) && value.format === 'hls'));
    }
  });
}

test('a failed add after successful resolution is reported and does not prevent later episodes', async () => {
  const written = [];
  const result = await addAnimeEpisodes(async () => ({ url: '/api/stream/kazumi/proxy?url=fixture' }), 'kazumi', 'DM84', '示例', [episode('first'), episode('second', 2)], async value => {
    if (value.title.endsWith('第 1 集')) throw new Error('room disconnected');
    written.push(value);
  });
  assert.deepEqual(result, { added: ['second'], failures: [{ id: 'first', message: 'room disconnected' }] });
  assert.equal(written.length, 1);
});

test('duplicate episodes are added once and invalid identifiers cannot mutate the room', async () => {
  const first = episode('same'); const writes = []; let resolutions = 0;
  const result = await addAnimeEpisodes(async () => { resolutions++; return { url: '/api/stream/anime/proxy?url=fixture' }; }, 'anime', 'legacy', '示例', [first, { ...first, title: '重复项' }, episode(''), episode('')], async value => writes.push(value));
  assert.deepEqual(result, { added: ['same'], failures: [{ id: '', message: '集数信息无效' }] });
  assert.equal(resolutions, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].title, '示例 · 第 1 集');
});

test('resolved video and audio preserve signed URLs and required proxy headers', async () => {
  const headers = { Referer: 'https://source.invalid/watch?a=1&b=2', 'User-Agent': 'Fixture Client/1', Origin: 'https://source.invalid', Cookie: 'fixture=value', Ignored: 'discard' };
  const videoUrl = 'https://cdn.invalid/video.m3u8?sign=a%2Fb&name=中文';
  const audioUrl = 'https://cdn.invalid/audio.m4a?sign=audio%2Ftoken';
  const writes = [];
  await addAnimeEpisodes(async () => ({ url: videoUrl, audioUrl, headers, format: 'hls' }), 'kazumi', 'DM84', '示例', [episode('one')], async value => writes.push(value));
  for (const [proxyUrl, original] of [[writes[0].url, videoUrl], [writes[0].audioUrl, audioUrl]]) {
    const parsed = new URL(proxyUrl, 'https://server.invalid');
    assert.equal(parsed.pathname, '/api/stream/kazumi/proxy');
    assert.equal(parsed.searchParams.get('url'), original);
    assert.equal(parsed.searchParams.get('referer'), headers.Referer);
    assert.equal(parsed.searchParams.get('userAgent'), headers['User-Agent']);
    assert.equal(parsed.searchParams.get('origin'), headers.Origin);
    assert.equal(parsed.searchParams.get('cookie'), headers.Cookie);
    assert.equal(parsed.searchParams.has('Ignored'), false);
  }
});

test('already cancelled RN signal prevents resolution and additions', async () => {
  const controller = new AbortController(); controller.abort();
  assert.equal(controller.signal.throwIfAborted, undefined);
  await assert.rejects(addAnimeEpisodes(async () => assert.fail('must not resolve'), 'kazumi', 'DM84', '示例', [episode('one')], async () => assert.fail('must not add'), controller.signal), { name: 'AbortError' });
});

test('RN cancellation during resolution stops this and all following additions', async () => {
  const controller = new AbortController(); let resolves = 0; let writes = 0;
  await assert.rejects(addAnimeEpisodes(async (_path, options) => {
    assert.equal(options.signal, controller.signal); resolves++; controller.abort();
    return { url: 'https://cdn.invalid/video.m3u8' };
  }, 'kazumi', 'DM84', '示例', [episode('one'), episode('two', 2)], async () => { writes++; }, controller.signal), { name: 'AbortError' });
  assert.equal(resolves, 1); assert.equal(writes, 0);
});

test('RN cancellation after an add prevents starting the next episode', async () => {
  const controller = new AbortController(); const writes = [];
  await assert.rejects(addAnimeEpisodes(async () => assert.fail('ani-subs must resolve later'), 'anisubs', 'source', '示例', [episode('one'), episode('two', 2)], async value => { writes.push(value); controller.abort(); }, controller.signal), { name: 'AbortError' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].sourceMeta.episode.id, 'one');
});
