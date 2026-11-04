import assert from 'node:assert/strict';
import test from 'node:test';
import { getWatchPlaybackUrl, watchPlaybackUrl } from '../src/lib/streamPush.ts';
import {
  canSwitchLibraryPlayback,
  fetchLibraryMovieSource,
  libraryMediaSourceId,
  libraryMoviePlaybackUrl,
  libraryMovieSourceUrl,
  resolveMoviePlaybackSource,
} from '../src/lib/movieSourceResolver.ts';

test('library playback switches follow public and intranet mount policy', () => {
  for (const serverUrl of ['nas', 'https://nas.home.arpa', 'http://192.168.1.2', 'http://[::ffff:192.168.1.2]', 'http://[::ffff:100.64.1.2]', 'http://[::1]', 'http://[fd00::1]']) {
    assert.equal(canSwitchLibraryPlayback({ serverUrl }), false, serverUrl);
  }
  for (const serverUrl of ['http://media.example', 'https://[2606:4700::1111]', 'http://[::ffff:8.8.8.8]']) {
    assert.equal(canSwitchLibraryPlayback({ serverUrl }), true, serverUrl);
  }
  assert.equal(canSwitchLibraryPlayback({}), true);
});

test('watch tickets preserve server prefixes without using the publisher key', () => {
  assert.equal(
    watchPlaybackUrl('https://nas.example:16667/edge', 'room-1', '/live/room-1.flv?ticket=read-only'),
    'https://nas.example:16667/edge/live/room-1.flv?ticket=read-only',
  );
  assert.equal(
    watchPlaybackUrl('http://nas.example:16667/edge', 'room-1', '/live/room-1.flv?ticket=read-only', 'http://flv.example:8888/flv'),
    'http://flv.example:8888/flv/live/room-1.flv?ticket=read-only',
  );
  assert.throws(
    () => watchPlaybackUrl('https://nas.example', 'room-1', '/live/publisher-secret.flv?ticket=read-only'),
    /无效的观看地址/,
  );
  assert.throws(
    () => watchPlaybackUrl('https://nas.example', 'room-1', '/live/room-1.flv?ticket=a&ticket=b'),
    /无效的观看地址/,
  );
});

test('watch ticket acquisition uses the current room API and rejects stale sessions', async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push([path, init]);
    return { success: true, url: '/live/room-2.flv?ticket=admitted' };
  };
  assert.equal(
    await getWatchPlaybackUrl(request, 'https://nas.example/edge', 'room-2'),
    'https://nas.example/edge/live/room-2.flv?ticket=admitted',
  );
  assert.equal(calls[0][0], '/api/stream-push/watch/room-2');
  assert.equal(
    await getWatchPlaybackUrl(request, 'https://nas.example/edge', 'room-2', undefined, () => true, 'http://flv.example:8888/flv'),
    'http://flv.example:8888/flv/live/room-2.flv?ticket=admitted',
  );
  assert.equal(await getWatchPlaybackUrl(request, 'https://nas.example', 'room-2', undefined, () => false).catch(error => error.message), '服务器连接已变更，请重新连接直播');
});

test('mounted resource refresh reconstructs member URLs by movieId', async () => {
  const unused = async () => { throw new Error('unexpected resolve request'); };
  assert.equal(
    (await resolveMoviePlaybackSource({ movieId: 7, sourceType: 'ftp', sourceUrl: '/expired' }, 'https://nas.example', unused)).sourceUrl,
    '/api/ftp/stream?movieId=7',
  );
  assert.equal(
    (await resolveMoviePlaybackSource({ movieId: 8, sourceType: 'server-files', sourceUrl: '/old/path' }, 'https://nas.example', unused)).sourceUrl,
    '/api/server-files/proxy?movieId=8',
  );
  assert.equal(
    (await resolveMoviePlaybackSource({ movieId: 9, sourceType: 'webdav', sourceUrl: '/old' }, 'https://nas.example', unused)).sourceUrl,
    '/api/webdav/stream?movieId=9',
  );
  let directPath = '';
  const direct = await resolveMoviePlaybackSource(
    { movieId: 10, sourceType: 'openlist', sourceUrl: '/expired', noProxyFallback: true },
    'https://nas.example',
    async path => { directPath = path; return { success: true, directUrl: 'https://cdn.example/new.mkv?sig=local' }; },
  );
  assert.equal(directPath, '/api/direct-resolve/movie?movieId=10');
  assert.equal(direct.sourceUrl, 'https://cdn.example/new.mkv?sig=local');
  assert.equal(direct.noProxyFallback, true);
});

test('Emby/Jellyfin refresh keeps direct policy and stable room URLs separate', async () => {
  const calls = [];
  const request = async path => {
    calls.push(path);
    return {
      success: true,
      videoUrl: '/api/emby/stream?movieId=11&ms=ms-1',
      streamUrl: '/api/emby/stream?movieId=11&ms=ms-1',
      directUrl: 'https://emby.example/Videos/item?MediaSourceId=ms-1',
      resolvedDirectUrl: 'https://cdn.example/signed/item.mkv?token=device-only',
      format: 'mkv',
      duration: 120,
      audioCodec: 'aac',
      multiVersion: true,
      mediaSourceId: 'ms-1',
      versions: [],
    };
  };
  const stream = await resolveMoviePlaybackSource(
    { movieId: 11, sourceType: 'emby', sourceUrl: '/api/emby/stream?movieId=11&ms=ms-1', noProxyFallback: false },
    'https://nas.example/edge',
    request,
  );
  assert.match(calls[0], /^\/api\/emby\/movie-source\?movieId=11&ms=ms-1$/);
  assert.equal(stream.sourceUrl, 'https://nas.example/edge/api/emby/stream?movieId=11&ms=ms-1');
  assert.equal(stream.noProxyFallback, false);

  calls.length = 0;
  const direct = await resolveMoviePlaybackSource(
    { movieId: 11, sourceType: 'emby', sourceUrl: '/api/emby/stream?movieId=11&ms=ms-1', noProxyFallback: true },
    'https://nas.example/edge',
    request,
  );
  assert.match(calls[0], /&direct=1$/);
  assert.equal(direct.sourceUrl, 'https://cdn.example/signed/item.mkv?token=device-only');
  assert.equal(libraryMediaSourceId(direct.sourceUrl), undefined);
  const media = await request('/api/emby/movie-source?movieId=11&ms=ms-1&direct=1');
  assert.equal(libraryMovieSourceUrl(media, true, 'https://nas.example/edge'), 'https://emby.example/Videos/item?MediaSourceId=ms-1');
  assert.equal(libraryMoviePlaybackUrl(media, true, 'https://nas.example/edge'), 'https://cdn.example/signed/item.mkv?token=device-only');
  assert.equal(libraryMediaSourceId('/api/jellyfin/stream?movieId=11&ms=ms-2'), 'ms-2');
  assert.match((await fetchLibraryMovieSource(request, 'jellyfin', 11, '/api/jellyfin/stream?ms=ms-2', true)).directUrl, /emby\.example/);
});
