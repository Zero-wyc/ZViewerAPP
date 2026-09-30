import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nativeVideoSource } from '../src/lib/media.ts';
import { probeMedia, safeMediaError } from '../src/lib/mediaDiagnostics.ts';

const server = 'https://service.example/zviewer';
const token = 'test-token';
const source = { sourceUrl: '/api/server-files/proxy?path=uploads%3A%2FTest.mp4', sourceType: 'server-files' };

test('native proxy retains prefixes and the server cap, with private owned VLC authentication', () => {
  const video = nativeVideoSource({ ...source, headers: { Range: 'bytes=0-10', Cookie: 'foreign', Authorization: 'foreign' } }, server, token);
  assert.equal(new URL(video.uri).pathname, '/zviewer/api/server-files/proxy');
  assert.equal(new URL(video.uri).searchParams.get('path'), 'uploads:/Test.mp4');
  assert.equal(new URL(video.uri).searchParams.get('rangeMode'), null);
  assert.equal(new URL(video.uri).searchParams.get('token'), token);
  assert.equal(new URL(video.identity).searchParams.get('token'), null);
  assert.deepEqual(video.headers, { Authorization: 'Bearer test-token' });
});

test('Jellyfin MP4 and opaque HLS URLs use the native single-track transport', () => {
  const video = nativeVideoSource({ sourceUrl: '/api/jellyfin/stream?movieId=147', sourceType: 'jellyfin', format: 'mp4' }, server, token);
  assert.equal(video.headers.Authorization, 'Bearer test-token');
  assert.equal(video.contentType, 'progressive');
  assert.equal(nativeVideoSource({ sourceUrl: '/api/emby/stream?movieId=1', sourceType: 'emby', format: 'hls' }, server, token).contentType, 'hls');
});

test('media cannot leak session credentials to foreign URLs or an escaped API prefix', () => {
  const external = nativeVideoSource({ sourceUrl: 'https://cdn.example/video.mp4', headers: { Cookie: 'secret', Authorization: 'secret', Range: 'bytes=0-1', Referer: 'https://cdn.example/' } }, server, token);
  assert.deepEqual(external.headers, { Referer: 'https://cdn.example/' });
  const escaped = nativeVideoSource({ sourceUrl: 'https://service.example/zviewer/api/../../public/video.mp4' }, server, token);
  assert.equal(escaped.headers.Authorization, undefined);
  assert.throws(() => nativeVideoSource({ sourceUrl: '/api/../../public/video.mp4' }, server, token));
});

test('untrusted loopback, embedded credentials and split tracks are rejected', () => {
  for (const uri of ['http://127.2.3.4/video', 'http://localhost./video', 'http://[::1]/video', 'http://[::ffff:127.0.0.1]/video', 'https://user:pass@cdn.example/video']) {
    assert.throws(() => nativeVideoSource({ sourceUrl: uri }, server, token));
  }
  assert.throws(() => nativeVideoSource({ sourceUrl: 'https://cdn.example/video', audioUrl: 'https://cdn.example/audio' }, server, token));
});

async function withMock(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await run(); } finally { globalThis.fetch = original; }
}

function rangeMock({ truncated = false, bodyShort = false, hls = false, authOnRange = false } = {}) {
  const size = 20 * 1024 * 1024;
  const requests = [];
  const mock = async (_uri, init) => {
    requests.push(init);
    if (init.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const headers = new Headers({ 'content-length': String(size), 'content-type': hls ? 'application/x-mpegURL' : 'video/mp4', 'accept-ranges': 'bytes' });
    if (init.method === 'HEAD') return new Response(null, { headers });
    if (authOnRange) return new Response(null, { status: 401 });
    const range = /^bytes=(\d*)-(\d*)$/.exec(init.headers.Range);
    const begin = range[1] ? Number(range[1]) : size - Number(range[2]);
    if (begin >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const end = Math.min(range[1] && range[2] ? Number(range[2]) : size - 1, truncated ? begin + 8 * 1024 * 1024 - 1 : size - 1);
    headers.set('content-range', `bytes ${begin}-${end}/${size}`);
    headers.set('content-length', String(end - begin + 1));
    const bytes = new Uint8Array(bodyShort ? 1 : end - begin < 64 ? end - begin + 1 : 0);
    if (begin === 0 && bytes.length >= 8) bytes.set([102, 116, 121, 112], 4);
    return new Response(bytes, { status: 206, headers });
  };
  return { mock, requests };
}

test('probe covers start/middle/end/open/large/416 and cancels large streams', async () => {
  const { mock, requests } = rangeMock();
  await withMock(mock, async () => {
    const result = await probeMedia(source, server, token);
    assert.equal(result.category, 'ready');
    assert.equal(result.checks.length, 6);
    assert.ok(result.checks.every(check => check.valid));
    assert.equal(result.checks.filter(check => check.bodyChecked).length, 3);
    assert.ok(requests.every(request => request.signal.aborted));
  });
});

test('VLC diagnostics accept correct capped 206 and verify the next boundary', async () => {
  const { mock } = rangeMock({ truncated: true });
  await withMock(mock, async () => {
    const result = await probeMedia(source, server, token);
    assert.equal(result.category, 'ready');
    assert.equal(result.checks.find(check => check.name === '跨 8 MiB').valid, true);
    assert.equal(result.checks.find(check => check.name === '分片续读').bodyChecked, true);
    assert.equal(result.checks.find(check => check.name === '开放范围').valid, true);
    assert.equal(result.checks[0].valid, true);
  });
});

test('direct MP4 also accepts valid capped responses through the same VLC transport', async () => {
  await withMock(rangeMock({ truncated: true }).mock, async () => {
    const result = await probeMedia({ sourceUrl: 'https://cdn.example/film.mp4' }, server, token);
    assert.equal(result.category, 'ready');
    assert.equal(result.checks.find(check => check.name === '跨 8 MiB').valid, true);
  });
});

test('single VLC transport never forwards private tokens externally', () => {
  const mkv = nativeVideoSource({ sourceUrl: '/api/server-files/proxy?path=custom%3Avideos%2FS01E01.mkv&rangeMode=avplayer&token=foreign' }, server, token); assert.equal(new URL(mkv.uri).searchParams.get('token'), token);
  assert.equal(new URL(mkv.uri).searchParams.get('rangeMode'), null);
  const external = nativeVideoSource({ sourceUrl: 'https://cdn.example/film.mkv', headers: { Authorization: 'foreign', Referer: 'https://cdn.example' } }, server, token); assert.equal(new URL(external.uri).searchParams.get('token'), null);
  assert.deepEqual(external.options, ['network-caching=1500', 'http-referrer=https://cdn.example']);
});

test('probe rejects short bodies and expired credentials on range requests', async () => {
  await withMock(rangeMock({ bodyShort: true }).mock, async () => assert.equal((await probeMedia(source, server, token)).category, 'server'));
  await withMock(rangeMock({ authOnRange: true }).mock, async () => assert.equal((await probeMedia(source, server, token)).category, 'auth'));
});

test('HLS does not inherit the progressive-file range requirement', async () => {
  const { mock, requests } = rangeMock({ hls: true });
  await withMock(mock, async () => {
    const result = await probeMedia({ sourceUrl: '/api/emby/stream', sourceType: 'emby', format: 'hls' }, server, token);
    assert.equal(result.category, 'ready');
    assert.equal(requests.length, 1);
    assert.match(result.detail, /仍需播放器验收/);
  });
});

test('caller cancellation propagates and diagnostics redact secrets', async () => {
  const controller = new AbortController(); controller.abort();
  await withMock(rangeMock().mock, async () => assert.rejects(probeMedia(source, server, token, controller.signal), { name: 'AbortError' }));
  const error = safeMediaError('Bearer sensitive https://cdn.example/file?token=secret Cookie=private token=private');
  assert.doesNotMatch(error, /sensitive|secret|private|cdn.example/);
});
