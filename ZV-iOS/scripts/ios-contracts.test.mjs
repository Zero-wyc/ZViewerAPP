import assert from 'node:assert/strict';
import test from 'node:test';
import { firstCommentPage, ncmCommentsPath, readNcmComments } from '../src/lib/songComments.ts';
import { landscapeColumns } from '../src/lib/roomLayout.ts';
import { screenShareExpiry } from '../src/lib/screenShareSession.ts';
import { getWatchPlaybackUrl, watchPlaybackUrl } from '../src/lib/streamPush.ts';
import {
  canSwitchLibraryPlayback,
  fetchLibraryMovieSource,
  libraryMediaSourceId,
  libraryMoviePlaybackUrl,
  libraryMovieSourceUrl,
  resolveMoviePlaybackSource,
} from '../src/lib/movieSourceResolver.ts';

test('NCM comments use the supported nested response and cursor/time pagination', () => {
  const url = new URL(ncmCommentsPath(123, null, firstCommentPage), 'https://nas.example');
  assert.equal(url.pathname, '/api/music/ncm/comment/new');
  assert.equal(url.searchParams.get('sortType'), '3');
  assert.equal(url.searchParams.get('pageNo'), '1');
  assert.equal(url.searchParams.get('cursor'), '0');
  const page = readNcmComments(JSON.stringify({ code: 200, data: { comments: [{ commentId: 4, content: 'test' }], totalCount: 99, cursor: 'next', hasMore: true } }), null, firstCommentPage);
  assert.equal(page.count, 99);
  assert.equal(new URL(ncmCommentsPath(123, null, page.next), 'https://nas.example').searchParams.get('cursor'), 'next');
  const floor = readNcmComments(JSON.stringify({ code: 200, data: { comments: [{ commentId: 5 }], totalCount: 3, time: 200, hasMore: true } }), 4, firstCommentPage);
  const replies = new URL(ncmCommentsPath(123, 4, floor.next), 'https://nas.example');
  assert.equal(replies.pathname, '/api/music/ncm/comment/floor');
  assert.equal(replies.searchParams.get('time'), '200');
  assert.equal(replies.searchParams.get('parentCommentId'), '4');
  assert.throws(() => readNcmComments('{"code":301}', null, firstCommentPage), /登录网易云/);
  assert.equal(readNcmComments('{"code":200,"data":{"comments":[],"hasMore":true,"cursor":"0"}}', null, firstCommentPage).next, null);
});

test('iPad room columns leave room for controls and widen comments without overflow', () => {
  for (const width of [620, 800, 980, 1120, 1340]) {
    const columns = landscapeColumns(width);
    assert.equal(columns.media.width + columns.sidebar.width + 12, width);
    assert.ok(columns.media.width >= 360);
    assert.ok(columns.sidebar.width <= 440);
    if (width >= 900) assert.ok(columns.sidebar.width >= 360);
  }
});

test('broadcast authorization is bounded and never accepts expired JWTs', () => {
  const now = 1_000_000;
  const jwt = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
  assert.equal(screenShareExpiry(jwt(10000), now), 4600);
  assert.equal(screenShareExpiry(jwt(1100), now), 1100);
  assert.throws(() => screenShareExpiry(jwt(1000), now));
  assert.throws(() => screenShareExpiry('invalid', now));
});

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
