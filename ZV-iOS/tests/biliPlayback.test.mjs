import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Run the production resolver with only the device bridge/storage substituted.
const calls = []; let operation, readStorage, writeStorage; let preference = {};
globalThis.__biliBridgeTest = { invoke: (...args) => operation(...args), read: (key, fallback) => readStorage ? readStorage(key, fallback) : ({ ...fallback, ...preference }), write: (key, value) => writeStorage?.(key, value) };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith('/src/lib/biliNative.ts') && ['./nativeBridge', './preferences'].includes(specifier)) {
    const source = specifier === './nativeBridge'
      ? 'export const biliOperation = (...args) => globalThis.__biliBridgeTest.invoke(...args); export const nativeBridge = { biliCancelResolve: async () => {} };'
      : 'export const readPreference = async (...args) => globalThis.__biliBridgeTest.read(...args); export const writePreference = async (...args) => globalThis.__biliBridgeTest.write(...args);';
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  if (context.parentURL?.includes('/src/lib/') && /^\.\/[\w]+$/.test(specifier)) return nextResolve(specifier + '.ts', context);
  return nextResolve(specifier, context);
} });
const { playbackSource, resolveLocalBili, resolveServerBili, resolveInputBili, resolveSharedBili, resetBiliPlayback, onBiliQualityResolved, applyMovieBiliPolicy, saveMovieBiliPolicy, onBiliChange } = await import('../src/lib/biliNative.ts');
const proxy = name => `http://127.0.0.1:8765/${'a'.repeat(48)}/proxy?url=${name}`;
const status = { ready: true, loggedIn: true, sessionVersion: 3 };
const media = { videoUrl: proxy('video'), audioUrl: proxy('audio'), currentQn: 80, sessionVersion: 3, title: 'Fixture' };
function bridge(callback) { resetBiliPlayback(); calls.length = 0; preference = {}; readStorage = undefined; writeStorage = undefined; operation = async (kind, raw) => { const value = raw ? JSON.parse(raw) : undefined; calls.push({ kind, value }); return kind === 'start' ? status : callback(value); }; }

test('production Bili playback resolves split DASH to VLC slaves and audio-only keeps only audio', async () => {
  bridge(() => media);
  const source = { sourceType: 'bilibili', sourceUrl: 'BV1xx411c7mD', movieId: 7 };
  const video = await playbackSource(source, 'https://site.invalid/prefix', 'secret');
  assert.equal(video.uri, media.videoUrl); assert.equal(video.slaves[0].uri, media.audioUrl); assert.deepEqual(video.headers, {});
  const audio = await playbackSource({ ...source, format: 'audio' }, 'https://site.invalid/prefix', 'secret');
  assert.equal(audio.uri, media.audioUrl); assert.deepEqual(audio.slaves, []);
  assert(audio.options.includes('demux=avformat'));
  assert(!video.options.includes('demux=avformat'), 'watch playback keeps its demux selection');
  assert(!JSON.stringify(video).includes('secret'));
});
test('muted music video disables audio decoding for local DASH and server muxed MP4', async () => {
  const source = { sourceType: 'bilibili', sourceUrl: 'BV1xx411c7mD', format: 'muted-video' };
  bridge(() => media);
  const local = await playbackSource(source, 'https://site.invalid', 'fixture');
  assert.equal(local.uri, media.videoUrl); assert.deepEqual(local.slaves, []); assert(local.options.includes('no-audio'));
  assert(local.options.includes('demux=avformat'));
  const audio = await playbackSource({ ...source, format: 'audio' }, 'https://site.invalid', 'fixture');
  assert(!audio.options.includes('no-audio'), 'the primary room audio must remain enabled');
  resetBiliPlayback(); operation = async () => ({ ...status, loggedIn: false });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes('public-settings') ? new Response(JSON.stringify({ settings: { dashDisabled: true } })) : new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/muxed.mp4', format: 'mp4' }));
  try {
    const server = await playbackSource(source, 'https://site.invalid', 'fixture');
    assert(server.options.includes('no-audio')); assert.deepEqual(server.slaves, []);
    assert(server.options.includes('demux=avformat'));
    const serverAudio = await playbackSource({ ...source, format: 'audio' }, 'https://site.invalid', 'fixture');
    assert(serverAudio.options.includes('demux=avformat'));
    assert(!serverAudio.options.includes('no-audio'));
  } finally { globalThis.fetch = oldFetch; }
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
    assert(requests.every(request => request.init.credentials === 'omit'));
    assert.equal(new URL(value.uri).pathname, '/prefix/api/stream/proxy'); assert.equal(new URL(value.slaves[0].uri).searchParams.get('token'), 'private-token');
    assert(!value.identity.includes('private-token'));
  } finally { globalThis.fetch = oldFetch; }
});

test('per-movie server DASH bypasses a logged-in CLI and reports actual QN without shared MP4 contamination', async () => {
  bridge(() => { throw new Error('Server policy must not use local resolution'); });
  const oldFetch = globalThis.fetch, requests = [], actual = [];
  const unsubscribe = onBiliQualityResolved((url, qn) => actual.push(qn));
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (url.includes('public-settings')) return new Response(JSON.stringify({ settings: { dashDisabled: false } }));
    const dash = new URL(url).searchParams.get('forceDash') === 'true';
    return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/video', ...(dash ? { audioUrl: 'https://cdn.bilivideo.com/audio' } : {}), format: dash ? 'dash' : 'mp4', currentQn: dash ? 16 : 64 }));
  };
  try {
    const source = { sourceType: 'bilibili', sourceUrl: 'BV17x411w7KC', movieId: 7, biliPolicy: { qn: 64, cliEnabled: false, preferMp4: false, dashAllowed: true, revision: 1 } };
    const native = await playbackSource(source, 'https://site.invalid', 'private');
    assert.equal(calls.length, 0); assert.equal(native.slaves.length, 1); assert.deepEqual(actual, [16]);
    const parameters = new URL(requests.find(value => value.url.includes('resolve-bilibili')).url).searchParams;
    assert.equal(parameters.get('preferMp4'), 'false'); assert.equal(parameters.get('forceDash'), 'true');
    await resolveSharedBili(source, 'https://site.invalid', 'private');
    assert.deepEqual(actual, [16], 'browser-compatible MP4 resolution cannot replace native DASH actual quality');
  } finally { unsubscribe(); globalThis.fetch = oldFetch; }
});

test('local picker preflight does not claim actual playback quality before a playback source is prepared', async () => {
  bridge(() => ({ ...media, format: 'dash', currentQn: 32 }));
  const actual = [], unsubscribe = onBiliQualityResolved((url, qn) => actual.push(qn));
  try {
    await resolveLocalBili('BV17x411w7KC'); assert.deepEqual(actual, []);
    const native = await playbackSource({ sourceType: 'bilibili', sourceUrl: 'BV17x411w7KC' }, 'https://site.invalid', 'private');
    assert.equal(native.slaves.length, 1); assert.deepEqual(actual, [32]);
  } finally { unsubscribe(); }
});

test('server CID-only selection corrects a legacy P1 response once and retains the exact selection for picker reuse', async () => {
  bridge(() => { throw new Error('Server-only selection'); });
  const oldFetch = globalThis.fetch, requestedPages = [];
  globalThis.fetch = async url => {
    if (url.includes('public-settings')) return new Response(JSON.stringify({ settings: { dashDisabled: false } }));
    const second = new URL(url).searchParams.get('page') === '2'; requestedPages.push(new URL(url).searchParams.get('page'));
    return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/video', audioUrl: 'https://cdn.bilivideo.com/audio', format: 'dash', cid: second ? 2002 : 2001, currentPage: second ? 2 : 1, currentQn: 64, pages: [{ page: 1, cid: 2001, part: 'P1' }, { page: 2, cid: 2002, part: 'P2' }] }));
  };
  try {
    const value = await resolveInputBili('https://www.bilibili.com/video/BV17x411w7KC?cid=2002', 'https://site.invalid', 'private', { qn: 64, cliEnabled: false, preferMp4: false, dashAllowed: true, revision: 0 });
    assert.equal(value.cid, 2002); assert.equal(value.currentPage, 2); assert.deepEqual(requestedPages, [null, '2']);
    const retained = new URL(value.resolvedUrl); assert.equal(retained.searchParams.get('cid'), '2002'); assert.equal(retained.searchParams.get('p'), '2');
  } finally { globalThis.fetch = oldFetch; }
});

test('server cannot silently clamp an absent page or keep the wrong CID after one bounded correction', async () => {
  const oldFetch = globalThis.fetch; let resolves = 0;
  globalThis.fetch = async url => {
    if (url.includes('public-settings')) return new Response(JSON.stringify({ settings: { dashDisabled: false } }));
    resolves++; return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/video', format: 'mp4', cid: 2001, currentPage: 1, pages: [{ page: 1, cid: 2001 }, { page: 2, cid: 2002 }] }));
  };
  try {
    await assert.rejects(resolveServerBili('https://www.bilibili.com/video/BV17x411w7KC?p=9', 'https://site.invalid', 'private'), /没有指定/);
    assert.equal(resolves, 1); resolves = 0;
    await assert.rejects(resolveServerBili('https://www.bilibili.com/video/BV17x411w7KC?cid=2002', 'https://site.invalid', 'private'), /未返回所选/);
    assert.equal(resolves, 2, 'never retry identity correction indefinitely'); resolves = 0;
    await assert.rejects(resolveServerBili('https://www.bilibili.com/video/BV17x411w7KC?cid=9999', 'https://site.invalid', 'private'), /不属于/); assert.equal(resolves, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('server short-link selection forwards only an explicitly selected P', async () => {
  const oldFetch = globalThis.fetch, pages = [];
  globalThis.fetch = async url => {
    if (url.includes('public-settings')) return new Response(JSON.stringify({ settings: { dashDisabled: false } }));
    const page = new URL(url).searchParams.get('page'); pages.push(page);
    return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.bilivideo.com/video', currentPage: page === '2' ? 2 : 3, format: 'mp4' }));
  };
  try {
    await resolveServerBili('https://b23.tv/selected?p=2', 'https://site.invalid', 'private');
    const expanded = await resolveServerBili('https://b23.tv/unknown', 'https://site.invalid', 'private');
    assert.deepEqual(pages, ['2', null]); assert.equal(expanded.currentPage, 3);
  } finally { globalThis.fetch = oldFetch; }
});

const localPolicy = { qn: 64, cliEnabled: true, preferMp4: false, dashAllowed: true, revision: 1 };
const drain = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('abandoned movie settings cannot persist or invalidate playback after a late local CLI resolve', async () => {
  let resolve; bridge(() => new Promise(done => { resolve = done; }));
  const writes = []; writeStorage = async (...args) => { writes.push(args); };
  let resets = 0; const unsubscribe = onBiliChange(() => { resets++; }); const controller = new AbortController();
  try {
    const pending = applyMovieBiliPolicy({ url: 'BV17x411w7KC', server: 'https://site.invalid', token: 'private', movieId: 7, policy: localPolicy }, controller.signal);
    await drain(); assert.equal(typeof resolve, 'function'); controller.abort(); resolve(media);
    await assert.rejects(pending, /取消/); assert.equal(writes.length, 0); assert.equal(resets, 0);
  } finally { unsubscribe(); }
});

test('obsolete settings read cannot overwrite a newer confirmed movie policy after account or movie changes', async () => {
  bridge(() => media); let finishRead, reads = 0, active = true; const writes = [];
  readStorage = async () => ++reads === 1 ? new Promise(resolve => { finishRead = resolve; }) : { entries: {} };
  writeStorage = async (_key, value) => { writes.push(structuredClone(value)); };
  let resets = 0; const unsubscribe = onBiliChange(() => { resets++; });
  try {
    const pending = saveMovieBiliPolicy('https://old.invalid', 7, localPolicy, new AbortController().signal, () => active);
    await drain(); active = false;
    await saveMovieBiliPolicy('https://new.invalid', 8, { ...localPolicy, qn: 32 });
    finishRead({ entries: {} }); await assert.rejects(pending, /取消/);
    assert.equal(writes.length, 1); assert(writes[0].entries['https://new.invalid:8']); assert.equal(resets, 1);
  } finally { unsubscribe(); }
});

test('a storage write already in progress cannot reset a newer playback when its settings editor disappears', async () => {
  bridge(() => media); let finishWrite; writeStorage = () => new Promise(resolve => { finishWrite = resolve; });
  let resets = 0; const unsubscribe = onBiliChange(() => { resets++; }); const controller = new AbortController();
  try {
    const pending = saveMovieBiliPolicy('https://site.invalid', 7, localPolicy, controller.signal);
    await drain(); assert.equal(typeof finishWrite, 'function'); controller.abort(); finishWrite();
    await assert.rejects(pending, /取消/); assert.equal(resets, 0);
  } finally { unsubscribe(); }
});

test('active movie settings save the resolved policy and invalidate playback exactly once', async () => {
  bridge(() => media); const writes = []; writeStorage = async (...args) => { writes.push(args); };
  let resets = 0; const unsubscribe = onBiliChange(() => { resets++; });
  try {
    const result = await applyMovieBiliPolicy({ url: 'BV17x411w7KC', server: 'https://site.invalid', token: 'private', movieId: 7, policy: localPolicy }, new AbortController().signal, () => true);
    assert.equal(result.currentQn, 80); assert.equal(writes.length, 1); assert.deepEqual(writes[0][1].entries['https://site.invalid:7'], localPolicy); assert.equal(resets, 1);
  } finally { unsubscribe(); }
});

test('failed saved-login restoration blocks local policy and playback without borrowing the server account', async () => {
  bridge(() => media); const writes = [];
  writeStorage = async (...args) => { writes.push(args); };
  operation = async kind => { assert.equal(kind, 'start'); return { ...status, loggedIn: false, loginError: '本机 B站登录恢复失败，请检查网络后重试' }; };
  const oldFetch = globalThis.fetch; globalThis.fetch = async () => { assert.fail('saved local login must not silently switch to the server account'); };
  try {
    await assert.rejects(applyMovieBiliPolicy({ url: 'BV17x411w7KC', server: 'https://site.invalid', token: 'private', movieId: 7, policy: localPolicy }, new AbortController().signal), /登录恢复失败/);
    await assert.rejects(playbackSource({ sourceType: 'bilibili', sourceUrl: 'BV17x411w7KC' }, 'https://site.invalid', 'private'), /登录恢复失败/);
    await assert.rejects(resolveInputBili('BV17x411w7KC', 'https://site.invalid', 'private'), /登录恢复失败/);
    assert.equal(writes.length, 0);
    operation = async kind => kind === 'start' ? { ...status, sessionVersion: 4 } : { ...media, sessionVersion: 4 };
    const recovered = await applyMovieBiliPolicy({ url: 'BV17x411w7KC', server: 'https://site.invalid', token: 'private', movieId: 7, policy: localPolicy }, new AbortController().signal);
    assert.equal(recovered.sessionVersion, 4); assert.equal(writes.length, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('manual quality errors keep their actual reason and do not save policy or reload playback', async () => {
  for (const reason of ['源站未提供所选画质', '没有本机可用的视频轨道', '本机 B站解析超时']) {
    bridge(() => { throw new Error(reason); }); const writes = []; writeStorage = async (...args) => { writes.push(args); };
    let resets = 0; const unsubscribe = onBiliChange(() => { resets++; });
    try {
      await assert.rejects(applyMovieBiliPolicy({ url: 'BV17x411w7KC', server: 'https://site.invalid', token: 'private', movieId: 7, policy: localPolicy }, new AbortController().signal), { message: reason });
      assert.equal(writes.length, 0); assert.equal(resets, 0); assert.equal(calls.filter(call => call.kind === 'resolve')[0].value.qn, 64);
    } finally { unsubscribe(); }
  }
});
