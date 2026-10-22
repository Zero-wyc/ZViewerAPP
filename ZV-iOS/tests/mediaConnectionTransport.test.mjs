import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { bindConnectionTransport, clearConnectionTransport, connectionUrl } from '../src/lib/connectionTransport.ts';
import { nativeVideoSource } from '../src/lib/media.ts';
import { detectLibraryHls } from '../src/lib/libraryHls.ts';
import { probeNativeMedia } from '../src/lib/mediaDiagnostics.ts';
import { screenFlvUrl } from '../src/lib/screenReceiver.ts';
import { VlcPlayer } from '../src/lib/vlcPlayer.ts';

const server = 'https://nas.invalid:16667/prefix';
const channel = `http://127.0.0.1:9999/${'c'.repeat(48)}/prefix`;
const files = new Map();
const relayCalls = [];
class Directory {
  constructor(parent, child) { this.uri = child ? `${parent.uri}/${child}` : parent; }
  create() {}
  list() { return []; }
  delete() {}
  get exists() { return true; }
}
class File {
  constructor(parent, child) { this.uri = child ? `${parent.uri}/${child}` : parent; }
  write(text) { files.set(this.uri, text); }
}
globalThis.__mediaTransportTest = { Directory, File, relayCalls };
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/lib/hlsNative.ts') && specifier === 'expo-file-system') {
    return { url: 'data:text/javascript,' + encodeURIComponent('export const {Directory,File}=globalThis.__mediaTransportTest; export const Paths={cache:{uri:"file:///cache"}};'), shortCircuit: true };
  }
  if (context.parentURL?.includes('/src/lib/') && specifier === './nativeBridge') {
    return { url: 'data:text/javascript,' + encodeURIComponent('export const biliOperation=async()=>({ready:false,loggedIn:false}); export const nativeBridge={biliCancelResolve:async()=>{},hlsRelayStart:async(...args)=>{globalThis.__mediaTransportTest.relayCalls.push(args);return {id:"relay",uri:"http://127.0.0.1:9998/relay/media"}},hlsRelayStop:async()=>{}};'), shortCircuit: true };
  }
  if (context.parentURL?.endsWith('/src/lib/biliNative.ts') && specifier === './preferences') {
    return { url: 'data:text/javascript,' + encodeURIComponent('export const readPreference=async(_key,value)=>value; export const writePreference=async()=>{};'), shortCircuit: true };
  }
  if (context.parentURL?.includes('/src/lib/') && /^\.\/[\w]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
} });
const { prepareNativeHls } = await import('../src/lib/hlsNative.ts');
const { playbackSource } = await import('../src/lib/biliNative.ts');
async function bound(run) {
  bindConnectionTransport(server, channel);
  try { await run(); } finally { clearConnectionTransport(); }
}
async function mockedFetch(fetcher, run) {
  const old = globalThis.fetch; globalThis.fetch = fetcher;
  try { await run(); } finally { globalThis.fetch = old; }
}

test('NAS media and DASH audio use the selected channel without changing logical identity or payload', async () => {
  await bound(async () => {
    const input = { sourceUrl: '/api/stream/proxy?url=https%3A%2F%2Fcdn.invalid%2Fvideo', audioUrl: '/api/music/stream?songId=7', sourceType: 'mp4' };
    const before = JSON.stringify(input), native = nativeVideoSource(input, server, 'synthetic-token');
    assert(native.uri.startsWith(channel + '/api/stream/proxy?'));
    assert.equal(new URL(native.uri).searchParams.get('token'), 'synthetic-token');
    assert(native.slaves[0].uri.startsWith(channel + '/api/music/stream?'));
    assert.equal(native.headers.Authorization, 'Bearer synthetic-token');
    assert(native.identity.startsWith(server + '/api/stream/proxy?'));
    assert(native.slaves[0].identity.startsWith(server + '/api/music/stream?'));
    assert(!native.identity.includes('synthetic-token') && !native.identity.includes('127.0.0.1'));
    assert.equal(JSON.stringify(input), before);
    for (const uri of ['https://nas.invalid:16668/prefix/api/stream', 'https://cdn.invalid/video', 'wss://voice.invalid/rtc']) {
      assert.equal(connectionUrl(uri), uri);
    }
    const foreign = nativeVideoSource({ sourceUrl: 'https://nas.invalid:16668/prefix/api/stream', audioUrl: 'https://cdn.invalid/audio' }, server, 'synthetic-token');
    assert.equal(foreign.uri, 'https://nas.invalid:16668/prefix/api/stream');
    assert.deepEqual(foreign.headers, {}); assert.deepEqual(foreign.slaves[0].headers, {});
  });
  assert(nativeVideoSource({ sourceUrl: '/api/music/stream?songId=7' }, server, 'synthetic-token').uri.startsWith(server));
});

test('library MIME probing keeps logical origin checks and passes logical scope to the native HLS relay', async () => {
  await bound(async () => {
    const native = nativeVideoSource({ sourceType: 'jellyfin', sourceUrl: '/api/jellyfin/stream?movieId=7', format: 'mp4' }, server, 'synthetic-token');
    const hls = await detectLibraryHls(native, server, 'synthetic-token', async uri => {
      assert(uri.startsWith(channel + '/api/jellyfin/stream?')); return 'application/vnd.apple.mpegurl';
    });
    assert.equal(hls.contentType, 'hls'); assert.equal(hls.libraryHls.serverUrl, server);
    const result = await prepareNativeHls(hls);
    assert.deepEqual(relayCalls.at(-1), [native.uri, server, 'synthetic-token']);
    assert.equal(result.probeUri, native.uri); assert.equal(result.uri, 'http://127.0.0.1:9998/relay/media'); result.dispose();
    let queried = false;
    const foreign = { ...native, uri: 'https://nas.invalid:16668/prefix/api/jellyfin/stream?movieId=7' };
    assert.equal(await detectLibraryHls(foreign, server, 'synthetic-token', async () => { queried = true; return 'application/vnd.apple.mpegurl'; }), foreign);
    assert.equal(queried, false);
  });
});

test('HLS main, nested audio, key, map and segment requests all retain the private NAS channel', async () => {
  await bound(async () => {
    files.clear(); const requested = [];
    await mockedFetch(async (uri, init) => {
      requested.push(uri); assert(uri.startsWith(channel)); assert.equal(init.credentials, 'omit');
      const target = new URL(uri).searchParams.get('url');
      const text = target.endsWith('master.m3u8')
        ? '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=500000,AUDIO="a"\nvideo.m3u8\n'
        : '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2,\npart.ts\n#EXT-X-ENDLIST\n';
      return new Response(text);
    }, async () => {
      const source = nativeVideoSource({ sourceType: 'kazumi', sourceUrl: '/api/stream/kazumi/proxy?url=https%3A%2F%2Fcdn.invalid%2Fmaster.m3u8', serverProxy: true, format: 'hls' }, server, 'synthetic-token');
      const result = await prepareNativeHls(source); assert.match(result.uri, /^file:/); assert.equal(requested.length, 3);
      const children = [...files.values()].flatMap(text => [...text.matchAll(/(?:URI=")?(http[^"\n]+)/g)].map(match => match[1]));
      assert.equal(children.length, 6);
      for (const child of children) { assert(child.startsWith(channel + '/api/stream/kazumi/proxy?')); assert.equal(new URL(child).searchParams.get('token'), 'synthetic-token'); }
      assert.equal(source.hlsProxy.upstream, 'https://cdn.invalid/master.m3u8');
    });
  });
});

test('HLS cache entries from a revoked channel cannot supply the next connection playlist', async () => {
  const fetched = [], prepared = [], nextChannel = channel.replace('c'.repeat(48), 'd'.repeat(48));
  const input = { sourceType: 'kazumi', sourceUrl: '/api/stream/kazumi/proxy?url=https%3A%2F%2Fcdn.invalid%2Frenew.m3u8', serverProxy: true, format: 'hls' };
  await mockedFetch(async uri => { fetched.push(uri); return new Response('#EXTM3U\n#EXTINF:1,\npart.ts\n#EXT-X-ENDLIST\n'); }, async () => {
    try {
      for (const local of [channel, nextChannel, null]) {
        if (local) bindConnectionTransport(server, local); else clearConnectionTransport();
        prepared.push(await prepareNativeHls(nativeVideoSource(input, server, 'synthetic-token')));
      }
      assert.equal(fetched.length, 3); assert.equal(new Set(prepared.map(source => source.uri)).size, 3);
      for (const [index, prefix] of [channel, nextChannel, server].entries()) {
        assert(fetched[index].startsWith(prefix)); assert(files.get(prepared[index].uri).includes(prefix + '/api/stream/kazumi/proxy?'));
      }
      assert(!files.get(prepared[2].uri).includes('127.0.0.1'));
    } finally { clearConnectionTransport(); }
  });
});

test('server Bili resolution and media diagnostics use the current channel, including original probeUri', async () => {
  await bound(async () => {
    const requests = [];
    await mockedFetch(async (uri, init) => {
      requests.push({ uri, init }); assert(uri.startsWith(channel)); assert.equal(init.credentials, 'omit');
      if (uri.includes('public-settings')) return new Response(JSON.stringify({ settings: { dashDisabled: false } }));
      if (uri.includes('resolve-bilibili')) return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.invalid/video', audioUrl: 'https://cdn.invalid/audio', format: 'dash' }));
      return new Response(null, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    }, async () => {
      const source = await playbackSource({ sourceType: 'bilibili', sourceUrl: 'BV17x411w7KC', biliPolicy: { qn: 64, cliEnabled: false, preferMp4: false, dashAllowed: true, revision: 0 } }, server, 'synthetic-token');
      assert.equal(source.slaves.length, 1); assert(source.uri.startsWith(channel)); assert(source.slaves[0].uri.startsWith(channel));
      const video = nativeVideoSource({ sourceUrl: '/api/jellyfin/stream?movieId=7', sourceType: 'jellyfin', format: 'hls' }, server, 'synthetic-token');
      const result = await probeNativeMedia({ ...video, probeUri: `${server}/api/jellyfin/stream?movieId=7` });
      assert.equal(result.category, 'ready'); assert.equal(requests.at(-1).init.method, 'HEAD');
    });
  });
});

test('progressive diagnostics send every Range through the current NAS channel and preserve range validation', async () => {
  await bound(async () => {
    const ranges = [], size = 1024;
    await mockedFetch(async (uri, init) => {
      assert(uri.startsWith(channel)); assert.equal(init.credentials, 'omit');
      const headers = { 'content-type': 'video/mp4', 'content-length': String(size), 'accept-ranges': 'bytes' };
      if (init.method === 'HEAD') return new Response(null, { headers });
      ranges.push(init.headers.Range); const [, first, last] = /^bytes=(\d*)-(\d*)$/.exec(init.headers.Range);
      const begin = first ? Number(first) : size - Number(last), end = first && last ? Math.min(size - 1, Number(last)) : size - 1;
      if (begin >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      const bytes = new Uint8Array(end - begin < 64 ? end - begin + 1 : 0);
      if (!begin && bytes.length >= 8) bytes.set([102, 116, 121, 112], 4);
      return new Response(bytes, { status: 206, headers: { ...headers, 'content-range': `bytes ${begin}-${end}/${size}`, 'content-length': String(end - begin + 1) } });
    }, async () => {
      const native = nativeVideoSource({ sourceUrl: '/api/server-files/proxy?path=fixture.mp4' }, server, 'synthetic-token');
      const result = await probeNativeMedia(native);
      assert.equal(result.category, 'ready'); assert.equal(result.signature, 'mp4'); assert.equal(ranges.length, 6); assert(result.checks.every(check => check.valid));
    });
  });
});

test('same-origin FLV and persistent music handoff map only at native transport creation', async () => {
  await bound(async () => {
    const flv = screenFlvUrl(server, 'fixture-key'); assert.equal(flv, `${server}/live/fixture-key.flv`);
    const video = nativeVideoSource({ sourceUrl: flv, sourceType: 'url' }, server, 'synthetic-token');
    assert.equal(video.uri, `${channel}/live/fixture-key.flv`); assert.equal(video.identity, flv); assert.deepEqual(video.headers, {});
    const separate = screenFlvUrl(server, 'fixture-key', 'https://nas.invalid:3335');
    assert.equal(nativeVideoSource({ sourceUrl: separate }, server, 'synthetic-token').uri, separate);
    const snapshots = [], replacements = [];
    const player = new VlcPlayer(value => snapshots.push(value), true, true);
    await player.replaceAsync(nativeVideoSource({ sourceUrl: '/api/music/stream?songId=1' }, server, 'synthetic-token'));
    player.attach(snapshots.at(-1).id, { async replaceSource(uri) { replacements.push(uri); }, async stop() {} });
    await player.replaceAsync(nativeVideoSource({ sourceUrl: '/api/music/stream?songId=2' }, server, 'synthetic-token'));
    assert.equal(replacements.length, 1); assert(replacements[0].startsWith(channel + '/api/music/stream?'));
    assert(player.sourceIdentity.startsWith(server)); player.dispose();
  });
});

test('the actual VLC component maps late main/audio/subtitle URI props without changing its source snapshot', async () => {
  await bound(async () => {
    const compiled = ts.transpileModule(readFileSync(new URL('../src/components/VlcVideo.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
    const jsx = (type, props) => ({ type, props }); const exports = {};
    const modules = {
      expo: { requireOptionalNativeModule: () => ({}) }, react: { useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect() {} },
      'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Platform: { OS: 'ios' } }, 'expo-device': { isDevice: true },
      'expo-libvlc-player': { LibVlcPlayerView: 'NativeVlc' }, '@/lib/vlcPlayer': {}, '@/lib/preferences': {}, '@/lib/connectionTransport': { connectionUrl },
    };
    vm.runInNewContext(compiled, { exports, require: name => { assert(modules[name], name); return modules[name]; }, __DEV__: false });
    const snapshot = { id: 3, source: { uri: `${server}/movie`, options: [], contentType: 'progressive', slaves: [{ uri: `${server}/audio` }, { uri: 'https://cdn.invalid/audio' }] }, settings: { subtitleUri: `${server}/subtitle.vtt`, tracks: {}, volume: 100, subtitleDelay: 0 }, autoplay: false, rate: 1 };
    const before = JSON.stringify(snapshot);
    const surface = exports.VlcVideo({ video: { player: { nativeOwnerId: 'owner' }, snapshot }, style: {} });
    const native = surface.type(surface.props);
    assert.equal(native.props.source, `${channel}/movie`);
    assert.deepEqual(Array.from(native.props.slaves, item => item.source), [`${channel}/audio`, 'https://cdn.invalid/audio', `${channel}/subtitle.vtt`]);
    assert.equal(JSON.stringify(snapshot), before);
  });
});
