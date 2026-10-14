import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareHlsPlaylists } from '../src/lib/hlsPlaylist.ts';

const upstream = 'https://cdn.example/show/master.m3u8?sign=public';
const proxy = 'https://server.example/zviewer/api/stream/kazumi/proxy?referer=https%3A%2F%2Fsource.example&token=session&url=original';
const vod = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@0"\n#EXTINF:4,\n../segment.ts?sign=part\n#EXT-X-ENDLIST\n';
function storage() {
  const files = new Map();
  return { files, reserve: index => `file:///cache/${index}.m3u8`, write: (uri, text) => files.set(uri, text) };
}
test('VOD segments, encryption keys and init maps all retain the authenticated server proxy', async () => {
  const store = storage();
  const uri = await prepareHlsPlaylists(upstream, proxy, async () => vod, store);
  const text = store.files.get(uri);
  const links = [...text.matchAll(/URI="([^"]+)"/g)].map(match => match[1]);
  links.push(text.split('\n').find(line => line && !line.startsWith('#')));
  assert.equal(links.length, 3);
  for (const link of links) {
    const url = new URL(link);
    assert.equal(url.origin, 'https://server.example');
    assert.equal(url.pathname, '/zviewer/api/stream/kazumi/proxy');
    assert.equal(url.searchParams.get('token'), 'session');
    assert.equal(url.searchParams.get('referer'), 'https://source.example');
  }
  assert.equal(new URL(links[2]).searchParams.get('url'), 'https://cdn.example/segment.ts?sign=part');
  assert.match(text, /BYTERANGE="100@0"/);
});
test('master variants and alternate audio become local playlists while child requests stay proxied', async () => {
  const store = storage(); const fetched = [];
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio/list.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO="audio"\nvideo/list.m3u8\n';
  const uri = await prepareHlsPlaylists(upstream, proxy, async uri => {
    const url = new URL(uri); fetched.push(url);
    return fetched.length === 1 ? master : vod;
  }, store);
  assert.equal(store.files.size, 3);
  assert.match(store.files.get(uri), /URI="file:\/\/\/cache\/1.m3u8"/);
  assert.match(store.files.get(uri), /\nfile:\/\/\/cache\/2.m3u8/);
  assert.equal(fetched[1].searchParams.get('url'), 'https://cdn.example/show/audio/list.m3u8');
  assert(fetched.every(url => url.origin === 'https://server.example' && url.searchParams.get('token') === 'session'));
});
test('malformed, live, private-network and oversized playlists fail before native playback', async () => {
  for (const text of ['<html>blocked</html>', '#EXTM3U\n#EXTINF:4,\nsegment.ts\n', vod.replace('../segment.ts?sign=part', 'http://127.0.0.1/secret'), vod.replace('URI="keys/key.bin"', 'URI=keys/key.bin'), '#EXTM3U\n' + ' '.repeat(2_000_001)]) {
    await assert.rejects(prepareHlsPlaylists(upstream, proxy, async () => text, storage()));
  }
});
test('cyclic master playlists fail before a native recursive load', async () => {
  const store = storage(); let calls = 0;
  const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nmaster.m3u8?sign=public\n';
  await assert.rejects(prepareHlsPlaylists(upstream, proxy, async () => { calls++; return master; }, store), /循环/);
  assert.equal(calls, 1); assert.equal(store.files.size, 0);
});
