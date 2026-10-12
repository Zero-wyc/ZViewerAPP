import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Run the production resolver with only the device bridge/storage substituted.
const calls = []; let operation; let preference = {};
globalThis.__biliBridgeTest = { invoke: (...args) => operation(...args), preference: () => preference };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/src/lib/biliNative.ts') && ['./nativeBridge', './preferences'].includes(specifier)) {
    const source = specifier === './nativeBridge'
      ? 'export const biliOperation = (...args) => globalThis.__biliBridgeTest.invoke(...args); export const nativeBridge = { biliCancelResolve: async () => {} };'
      : 'export const readPreference = async (_, fallback) => ({ ...fallback, ...globalThis.__biliBridgeTest.preference() }); export const writePreference = async () => {};';
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  if (context.parentURL?.includes('/src/lib/') && /^\.\/[\w]+$/.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { playbackSource, resolveLocalBili, resetBiliPlayback } = await import('../src/lib/biliNative.ts');
const proxy = name => `http://127.0.0.1:8765/${'a'.repeat(48)}/proxy?url=${name}`;
const status = { ready: true, loggedIn: true, sessionVersion: 3 };
const media = { videoUrl: proxy('video'), audioUrl: proxy('audio'), currentQn: 80, sessionVersion: 3, title: 'Fixture' };
function bridge(callback) { resetBiliPlayback(); calls.length = 0; preference = {}; operation = async (kind, raw) => { const value = raw ? JSON.parse(raw) : undefined; calls.push({ kind, value }); return kind === 'start' ? status : callback(value); }; }

test('production Bili playback resolves split DASH to VLC slaves and audio-only keeps only audio', async () => {
  bridge(() => media);
  const source = { sourceType: 'bilibili', sourceUrl: 'BV1xx411c7mD', movieId: 7 };
  const video = await playbackSource(source, 'https://site.invalid/prefix', 'secret');
  assert.equal(video.uri, media.videoUrl); assert.equal(video.slaves[0].uri, media.audioUrl); assert.deepEqual(video.headers, {});
  const audio = await playbackSource({ ...source, format: 'audio' }, 'https://site.invalid/prefix', 'secret');
  assert.equal(audio.uri, media.audioUrl); assert.deepEqual(audio.slaves, []);
  assert(!JSON.stringify(video).includes('secret'));
});
test('explicit second P uses its CID and season selection carries the matching episode', async () => {
  bridge(options => ({ ...media, pages: [{ page: 1, cid: 1001, epId: 101, part: '1' }, { page: 2, cid: 1002, epId: 102, part: '2' }] }));
  await resolveLocalBili('https://www.bilibili.com/bangumi/play/ss900?p=2');
  const requests = calls.filter(value => value.kind === 'resolve');
  assert.equal(requests.length, 2); assert.equal(requests[1].value.cid, 1002); assert.equal(requests[1].value.epId, 102);
});
test('PGC local-only gate rejects before any server resolver request', async () => {
  resetBiliPlayback(); operation = async () => ({ ...status, loggedIn: false });
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Must not contact server'); };
  try { await assert.rejects(playbackSource({ sourceType: 'bilibili', sourceUrl: 'ep102', cliOnly: true }, 'https://site.invalid', 'secret'), /本机/); }
  finally { globalThis.fetch = oldFetch; }
});
test('late native resolve after cancellation or account reset never returns playable media', async () => {
  const controller = new AbortController(); bridge(() => { controller.abort(); return media; });
  await assert.rejects(playbackSource({ sourceType: 'bilibili', sourceUrl: 'BV1xx411c7mD' }, 'https://site.invalid', 'secret', controller.signal), /取消/);
  bridge(() => { resetBiliPlayback(); return media; }); await assert.rejects(resolveLocalBili('BV1xx411c7mD'), /会话/);
  bridge(() => ({ ...media, videoUrl: 'https://untrusted.invalid/video' })); await assert.rejects(resolveLocalBili('BV1xx411c7mD'), /无效/);
});
test('ordinary video server fallback retains site prefix and private VLC auth on each track', async () => {
  resetBiliPlayback(); operation = async () => ({ ...status, loggedIn: false }); const requests = [];
  const oldFetch = globalThis.fetch; globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return url.includes('public-settings') ? new Response(JSON.stringify({ settings: { dashDisabled: false } })) : new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/video', audioUrl: 'https://cdn.bilivideo.com/audio', format: 'dash' }));
  };
  try {
    const value = await playbackSource({ sourceType: 'bilibili', sourceUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2' }, 'https://site.invalid/prefix', 'private-token');
    assert(requests[1].url.startsWith('https://site.invalid/prefix/api/stream/resolve-bilibili?'));
    assert.equal(requests[1].init.headers.Authorization, 'Bearer private-token');
    assert.equal(new URL(value.uri).pathname, '/prefix/api/stream/proxy'); assert.equal(new URL(value.slaves[0].uri).searchParams.get('token'), 'private-token');
    assert(!value.identity.includes('private-token'));
  } finally { globalThis.fetch = oldFetch; }
});
