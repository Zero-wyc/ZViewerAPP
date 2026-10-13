import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeVideoSource } from '../src/lib/media.ts';
import { canonicalSelection } from '../src/lib/sources.ts';

const server = 'https://server.invalid/zviewer';
const token = 'fixture-session-token';
const upstream = 'https://cdn.invalid/series/master.m3u8?sign=a%2Fb';
const proxy = (kind, values = {}) => `/api/stream/${kind}/proxy?${new URLSearchParams({ url: upstream, referer: 'https://source.invalid/detail', userAgent: 'Fixture Player/1', ...values })}`;

for (const kind of ['anime', 'kazumi', 'anisubs']) test(`${kind} playback uses upstream HLS base and inherited VLC options without changing room identity`, () => {
  const url = proxy(kind, { token: 'stale-session' });
  const media = nativeVideoSource({ sourceUrl: url, sourceType: kind === 'anisubs' ? 'anime' : kind }, server, token);
  assert.equal(media.uri, upstream); assert.equal(media.contentType, 'hls'); assert.equal(media.serverApi, false);
  assert.deepEqual(media.headers, { Referer: 'https://source.invalid/detail', 'User-Agent': 'Fixture Player/1' });
  assert.deepEqual(media.options, ['network-caching=1500', 'http-referrer=https://source.invalid/detail', 'http-user-agent=Fixture Player/1']);
  assert.equal(new URL(media.identity).pathname, `/zviewer/api/stream/${kind}/proxy`);
  assert.equal(new URL(media.identity).searchParams.get('token'), null);
  assert(!media.uri.includes(token));
  assert.equal(canonicalSelection({ title: '示例', source: kind === 'anisubs' ? 'anime' : kind, url }, server, token).url, proxy(kind));
});

test('separate progressive audio keeps its own site headers through its authenticated proxy', () => {
  const media = nativeVideoSource({ sourceUrl: proxy('kazumi'), sourceType: 'kazumi', audioUrl: proxy('kazumi', { url: 'https://cdn.invalid/audio.m4a', referer: 'https://source.invalid/audio' }) }, server, token);
  const audio = new URL(media.slaves[0].uri);
  assert.equal(audio.pathname, '/zviewer/api/stream/kazumi/proxy');
  assert.equal(audio.searchParams.get('url'), 'https://cdn.invalid/audio.m4a');
  assert.equal(audio.searchParams.get('referer'), 'https://source.invalid/audio');
  assert.equal(audio.searchParams.get('token'), token);
  assert.equal(media.slaves[0].headers.Authorization, `Bearer ${token}`);
  assert.equal(new URL(media.slaves[0].identity).searchParams.get('token'), null);
  assert.equal(media.uri, upstream);
});

test('aggregate playback preserves the server default User-Agent and ignores empty site headers', () => {
  const expectedUa = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  for (const kind of ['anime', 'kazumi', 'anisubs']) {
    const missingUa = `/api/stream/${kind}/proxy?${new URLSearchParams({ url: upstream })}`;
    const missing = nativeVideoSource({ sourceUrl: missingUa }, server, token);
    const empty = nativeVideoSource({ sourceUrl: proxy(kind, { userAgent: '  ', referer: '', origin: ' ', cookie: '\t' }) }, server, token);
    for (const media of [missing, empty]) {
      assert.equal(media.uri, upstream);
      assert.deepEqual(media.headers, { 'User-Agent': expectedUa });
      assert.deepEqual(media.options, ['network-caching=1500', `http-user-agent=${expectedUa}`]);
    }
  }
});

test('unsupported HLS Origin/Cookie is an actionable error instead of a known broken proxy URL', () => {
  for (const header of ['origin', 'cookie']) {
    assert.throws(() => nativeVideoSource({ sourceUrl: proxy('anisubs', { [header]: 'fixture-value' }) }, server, token), /Origin.*Cookie/);
    assert.throws(() => nativeVideoSource({ sourceUrl: proxy('anisubs', { url: 'https://cdn.invalid/opaque', [header]: 'fixture-value' }), format: 'hls' }, server, token), /Origin.*Cookie/);
  }
  const progressive = nativeVideoSource({ sourceUrl: proxy('anisubs', { url: 'https://cdn.invalid/video.mp4', origin: 'https://source.invalid' }) }, server, token);
  assert.equal(new URL(progressive.uri).searchParams.get('token'), token);
  assert.equal(progressive.serverApi, true);
});

test('unwrapping requires an owned exact aggregate endpoint and validates target/headers', () => {
  const foreign = nativeVideoSource({ sourceUrl: 'https://foreign.invalid' + proxy('kazumi') }, server, token);
  assert.equal(new URL(foreign.uri).host, 'foreign.invalid'); assert.deepEqual(foreign.headers, {});
  for (const target of ['file:///secret', 'https://user:password@cdn.invalid/file', 'http://127.0.0.1/file', `${server}/api/auth/me`]) {
    assert.throws(() => nativeVideoSource({ sourceUrl: proxy('kazumi', { url: target }) }, server, token));
  }
  assert.throws(() => nativeVideoSource({ sourceUrl: proxy('kazumi', { referer: 'https://source.invalid/\r\nInjected:value' }) }, server, token), /请求头无效/);
});

test('aggregate URLs retain private-network validation even when progressive media stays proxied', () => {
  const targets = ['not-a-url', 'http://localhost./video.mp4', 'http://media.localhost/video.mp4', 'http://nas.local/video.mp4', 'http://127.1/video.mp4', 'http://10.0.0.1/video.mp4', 'http://172.16.0.1/video.mp4', 'http://192.168.1.1/video.mp4', 'http://169.254.1.1/video.mp4', 'http://[::1]/video.mp4', 'http://[fd00::1]/video.mp4', 'http://[fe80::1]/video.mp4', 'http://[::ffff:192.168.1.1]/video.mp4'];
  for (const target of targets) for (const values of [{}, { origin: 'https://source.invalid' }]) {
    assert.throws(() => nativeVideoSource({ sourceUrl: proxy('kazumi', { url: target, ...values }) }, server, token), /番剧解析返回的媒体地址无效/);
  }
  // User-entered LAN media remains valid; the restriction belongs to the
  // public anime provider proxies, matching their server-side contract.
  assert.equal(nativeVideoSource({ sourceUrl: 'http://192.168.1.1/video.mp4' }, server, token).uri, 'http://192.168.1.1/video.mp4');
});

test('proxy fallback validates every site header and rejects ambiguous query values', () => {
  for (const header of ['referer', 'userAgent', 'origin', 'cookie']) {
    assert.throws(() => nativeVideoSource({ sourceUrl: proxy('anime', { url: 'https://cdn.invalid/video.mp4', origin: 'https://source.invalid', [header]: 'value\r\nInjected: value' }) }, server, token), /请求头无效/);
  }
  assert.throws(() => nativeVideoSource({ sourceUrl: proxy('kazumi') + '&url=https%3A%2F%2Fother.invalid%2Fvideo' }, server, token), /有效媒体地址/);
  assert.throws(() => nativeVideoSource({ sourceUrl: proxy('kazumi') + '&referer=other' }, server, token), /请求头无效/);
});

test('outer session refresh leaves upstream signed parameters and room identity stable', () => {
  const signed = 'https://cdn.invalid/series/master.m3u8?token=cdn-signature&rangeMode=cdn-mode&sign=a%2Fb';
  const source = { sourceUrl: proxy('kazumi', { url: signed, token: 'old-session', rangeMode: 'avplayer' }) };
  const before = nativeVideoSource(source, server, 'old-session');
  const after = nativeVideoSource(source, server, 'new-session');
  assert.equal(before.uri, signed); assert.equal(after.uri, signed);
  assert.equal(before.identity, after.identity);
  assert.equal(new URL(after.identity).searchParams.get('token'), null);
  assert.equal(new URL(after.identity).searchParams.get('rangeMode'), null);
  assert.equal(new URL(after.identity).searchParams.get('url'), signed);
});
