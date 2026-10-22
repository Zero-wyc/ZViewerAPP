import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeVideoSource } from '../src/lib/media.ts';
import { detectLibraryHls } from '../src/lib/libraryHls.ts';

const server = 'https://server.example/prefix';
test('an MP4-labelled library route uses the dynamic relay only after an HLS response MIME', async () => {
  const source = nativeVideoSource({ sourceType: 'emby', sourceUrl: '/api/emby/stream?movieId=7', format: 'mp4' }, server, 'fixture');
  const progressive = await detectLibraryHls(source, server, 'fixture', async () => 'video/mp4');
  assert.equal(progressive, source); assert.equal(progressive.libraryHls, undefined);
  const adaptive = await detectLibraryHls(source, server, 'fixture', async uri => { assert(uri.startsWith(server + '/api/emby/stream?')); return 'application/vnd.apple.mpegurl; charset=utf-8'; });
  assert.equal(adaptive.contentType, 'hls'); assert.deepEqual(adaptive.libraryHls, { serverUrl: server, accessToken: 'fixture' });
});
test('HLS MIME detection never probes another origin, server prefix or non-library API', async () => {
  let calls = 0; const head = async () => { calls++; return 'application/x-mpegurl'; };
  for (const source of [
    nativeVideoSource({ sourceUrl: 'https://media.example/video.mp4' }, server, 'fixture'),
    { ...nativeVideoSource({ sourceUrl: '/api/server-files/stream?movieId=7' }, server, 'fixture') },
    { ...nativeVideoSource({ sourceUrl: '/api/emby/stream?movieId=7' }, server, 'fixture'), uri: 'https://server.example/other/api/emby/stream?movieId=7' },
  ]) assert.equal(await detectLibraryHls(source, server, 'fixture', head), source);
  assert.equal(calls, 0);
});
test('failed MIME probe keeps progressive playback, while cancellation remains cancellation', async () => {
  const source = nativeVideoSource({ sourceType: 'jellyfin', sourceUrl: '/api/jellyfin/stream?movieId=7', format: 'mp4' }, server, 'fixture');
  assert.equal(await detectLibraryHls(source, server, 'fixture', async () => { throw Error('HEAD unavailable'); }), source);
  const controller = new AbortController();
  await assert.rejects(detectLibraryHls(source, server, 'fixture', async () => { controller.abort(); return 'application/x-mpegurl'; }, controller.signal), /取消/);
});
