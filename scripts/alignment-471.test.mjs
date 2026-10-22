import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'

const merge = loadTs('src/upstream/modules/sync-playback/services/state-merge.ts')
const identity = loadTs('src/upstream/modules/sync-playback/playbackIdentity.ts')
const policy = loadTs('src/upstream/modules/movie-source/media-policy.ts', {}, { URL })
const flush = () => new Promise(resolve => setImmediate(resolve))
const initial = () => ({ sourceUrl: 'https://media.test/master.m3u8', sourceType: 'anime',
  format: 'hls', noProxyFallback: false, playsvideoEnabled: false,
  currentTime: 24, isPlaying: false, playbackRate: 1.5, duration: 120 })

function harness({ attach, download } = {}) {
  const handlers = new Map(), cleanups = [], attachments = [], requests = [], errors = [], progress = []
  const room = { roomId: 'room', roomSessionRevision: 1, currentMovieId: 1, movies: [{ id: 1 }],
    watchTogether: initial(), setHostOffline() {}, setBufferProgress: value => progress.push(value) }
  const socket = { on: (name, fn) => handlers.set(name, fn), off: name => handlers.delete(name),
    emit: (name, payload, ack) => requests.push({ name, payload, ack }) }
  const video = { currentTime: 0, playbackRate: 1, paused: true,
    pause() { this.paused = true }, isConnected: true }
  const options = { roomId: 'room', isHostRef: { current: false }, videoRef: { current: video },
    suppressEventsRef: { current: false },
    setWatchTogether: state => { room.watchTogether = { ...room.watchTogether, ...state } },
    applySourceToVideo: async (_video, state, start, blobs) => {
      attachments.push({ state, start, blobs }); await attach?.(state)
    }, seekTo: async () => ({ success: true }), reloadVideo: async () => {} }
  const modules = { react: { useEffect: fn => cleanups.push(fn()), useRef: current => ({ current }) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '@/store/roomStore': { useRoomStore: { getState: () => ({ ...room }) } },
    '@/components/ui/message': { message: { error: value => errors.push(value) } },
    '../constants': { SOCKET_EVENT: { STATE: 'state', CONTROL: 'control', REQUEST_STATE: 'request' } },
    '../safePlay': { safePlay: v => { v.paused = false } },
    '../playbackIdentity': identity,
    '../services': { ...merge, executeSeek: async () => false },
    '@/modules/player/services/buffer-mode': {
      fetchBlobsForBufferMode: download, DownloadError: class extends Error {},
      UrlExpiredError: class extends Error {}, DownloadAbortedError: class extends Error {},
    } }
  const { useViewerStateSync } = loadTs('src/upstream/modules/sync-playback/hooks/useViewerStateSync.ts', modules)
  const receiverRef = useViewerStateSync(options)
  const broadcast = (patch = {}, force = false) => handlers.get('state')({
    state: { ...room.watchTogether, ...patch }, ...(force ? {} : { diff: patch }) })
  function request() {
    const { usePlaybackStateRequest } = loadTs('src/upstream/modules/playback-memory/hooks/usePlaybackStateRequest.ts', {
      ...modules,
      '@/modules/sync-playback/constants': modules['../constants'],
      '@/modules/sync-playback/playbackIdentity': identity,
    }, { setTimeout: () => 1, clearTimeout() {} })
    usePlaybackStateRequest({ roomId: 'room', isHostRef: options.isHostRef, receiverRef })
    return state => requests.at(-1).ack({ success: true, data: { state } })
  }
  return { room, video, options, handlers, cleanups, attachments, requests, errors, progress,
    broadcast, receiverRef, request, close: () => cleanups.forEach(fn => fn?.()) }
}

test('same-URL direct and transcoding switches reattach once and preserve time, pause and rate', async () => {
  const h = harness()
  try {
    h.broadcast(); await flush()
    for (const patch of [{ noProxyFallback: true }, { noProxyFallback: false },
      { playsvideoEnabled: true }, { playsvideoEnabled: false }]) {
      const before = h.attachments.length
      h.broadcast(patch); await flush()
      assert.equal(h.attachments.length, before + 1)
      assert.equal(h.video.currentTime, 24); assert.equal(h.video.paused, true)
      assert.equal(h.video.playbackRate, 1.5)
      h.broadcast(patch); await flush()
      assert.equal(h.attachments.length, before + 1, 'identical state must reuse the loader')
    }
    h.broadcast({ noProxyFallback: true, currentTime: 0, isPlaying: true, playbackRate: 2 }); await flush()
    assert.equal(h.video.currentTime, 0); assert.equal(h.video.paused, false)
    assert.equal(h.video.playbackRate, 2); assert.equal(h.options.suppressEventsRef.current, false)
  } finally { h.close() }
})

test('ACKs share policy-aware loading; a later broadcast supersedes an old ACK', async () => {
  const h = harness()
  try {
    h.broadcast(); await flush()
    h.request()({ ...initial(), noProxyFallback: true }); await flush()
    assert.equal(h.attachments.length, 2); assert.equal(h.room.watchTogether.noProxyFallback, true)
    const ack = h.request()
    h.broadcast({ noProxyFallback: false }); await flush()
    ack({ ...initial(), noProxyFallback: true }); await flush()
    assert.equal(h.attachments.length, 3); assert.equal(h.room.watchTogether.noProxyFallback, false)
    const repeat = h.request(); repeat({ ...h.room.watchTogether }); await flush()
    assert.equal(h.attachments.length, 3)
  } finally { h.close() }
})

test('policy changes during ACK attachment serialize with broadcasts and keep the latest desired state', async () => {
  let finish, active = 0, maximum = 0
  const h = harness({ attach: async () => {
    active++; maximum = Math.max(maximum, active)
    if (!finish) await new Promise(resolve => { finish = resolve })
    active--
  } })
  try {
    h.request()(initial()); await flush()
    h.broadcast({ noProxyFallback: true })
    h.broadcast({ noProxyFallback: false, playsvideoEnabled: true, currentTime: 56 })
    assert.equal(h.attachments.length, 1)
    finish(); await flush()
    assert.equal(maximum, 1); assert.equal(h.attachments.length, 2)
    assert.equal(h.attachments[1].state.playsvideoEnabled, true)
    assert.equal(h.video.currentTime, 56); assert.equal(h.options.suppressEventsRef.current, false)
  } finally { h.close() }
})

test('returning to an earlier policy during attachment still replaces the in-flight loader', async () => {
  let finish, hold = false
  const h = harness({ attach: async () => { if (hold) { hold = false; await new Promise(resolve => { finish = resolve }) } } })
  try {
    h.broadcast(); await flush(); hold = true
    h.broadcast({ noProxyFallback: true }); await flush()
    h.broadcast({ noProxyFallback: false }); finish(); await flush()
    assert.deepEqual(h.attachments.map(a => a.state.noProxyFallback), [false, true, false])
  } finally { h.close() }
})

test('failed attachment is retryable; old-session completion and late ACKs cannot resume playback', async () => {
  let fail = true
  const h = harness({ attach: async () => { if (fail) { fail = false; throw Error('fixture error') } } })
  try {
    h.broadcast(); await flush(); assert.equal(h.errors.length, 1)
    h.broadcast(); await flush(); assert.equal(h.attachments.length, 2)
    const ack = h.request(); h.room.roomSessionRevision++
    ack({ ...initial(), noProxyFallback: true }); await flush()
    assert.equal(h.attachments.length, 2)
  } finally { h.close() }
  let finish
  const old = harness({ attach: () => new Promise(resolve => { finish = resolve }) })
  old.broadcast({ isPlaying: true }); await flush()
  const ack = old.request()
  old.close(); finish(); ack(initial()); await flush()
  assert.equal(old.video.paused, true); assert.equal(old.video.currentTime, 0)
  assert.equal(old.receiverRef.current, null)
})

test('buffering is cancelled on same-URL policy change, and cancelled downloads never become applied state', async () => {
  let aborts = 0, downloads = 0
  const h = harness({ download: ({ signal }) => {
    downloads++
    if (downloads > 1) return Promise.resolve({ videoBlob: 'video', audioBlob: 'audio' })
    return new Promise((_, reject) => signal.addEventListener('abort', () => {
      aborts++; reject(Error('cancelled fixture download'))
    }))
  } })
  try {
    h.broadcast({ bufferMode: true }); await flush()
    h.broadcast({ noProxyFallback: true }); await flush()
    assert.equal(aborts, 1); assert.equal(downloads, 2)
    assert.equal(h.attachments.length, 1); assert.equal(h.attachments[0].state.noProxyFallback, true)
    assert.equal(h.progress.at(-1), null); assert.equal(h.options.suppressEventsRef.current, false)
  } finally { h.close() }
})

test('legacy same-source snapshots preserve explicit policies, cross-source snapshots clear them', async () => {
  const h = harness()
  try {
    h.broadcast({ noProxyFallback: true }); await flush()
    const legacy = { ...h.room.watchTogether }; delete legacy.noProxyFallback; delete legacy.playsvideoEnabled
    h.receiverRef.current.receive({ state: legacy, diff: {} }); await flush()
    assert.equal(h.room.watchTogether.noProxyFallback, true); assert.equal(h.attachments.length, 1)
    h.receiverRef.current.receive({ state: { ...legacy, sourceUrl: 'https://other.test/video', sourceType: 'mp4' } }); await flush()
    assert.equal(h.room.watchTogether.noProxyFallback, undefined)
    assert.equal(h.room.watchTogether.playsvideoEnabled, undefined)
    assert.equal(h.attachments.length, 2)
  } finally { h.close() }
})

test('access statistics follow data-source policy and resolved server proxy URLs, leaving mount subtitle flags independent', () => {
  for (const sourceType of ['anime', 'kazumi', 'cms']) for (const serverProxy of [undefined, false, true]) {
    const movie = { sourceType, serverProxy, directLink: false }
    assert.equal(policy.isDirectPlayback({ sourceUrl: 'https://cdn.test/a.m3u8' }, movie), serverProxy !== true)
    assert.equal(policy.isDirectPlayback({ sourceUrl: `/base/api/stream/${sourceType === 'anime' ? 'anisubs' : sourceType}/proxy` }, movie), false)
  }
  assert.equal(policy.isDirectPlayback({ sourceUrl: 'http://127.0.0.1/video', noProxyFallback: true }), true)
  assert.equal(policy.isDirectPlayback({ sourceUrl: '/api/stream/proxy', noProxyFallback: true }, { sourceType: 'mp4' }), false)
  for (const sourceType of ['webdav', 'openlist']) for (const directLink of [false, true]) {
    assert.equal(policy.isDirectPlayback({ sourceUrl: 'https://cdn.test/file' }, { sourceType, directLink }), directLink)
  }
  const core = readFileSync('src/upstream/modules/room/watch-together/WatchTogetherCore.tsx', 'utf8')
  assert.match(core, /directLink: currentMovieDirectLink/)
  assert.match(core, /directLink=\{currentPlaybackDirect\}/)
})

test('web preview and full broadcast share one loader and preserve policies even for legacy preview events', async () => {
  const h = harness()
  const code = readFileSync('src/upstream/modules/room/watch-together/useWatchTogether.ts', 'utf8')
  const start = code.indexOf('    const handlePreviewSource =')
  const end = code.indexOf('\n    socket.on(SOCKET_EVENT.MOVIE_LIST', start)
  const exports = {}
  runInNewContext(stripTypeScriptTypes(code.slice(start, end)) + ';exports.receive=handlePreviewSource', {
    exports, isHostRef: h.options.isHostRef, viewerStateReceiverRef: h.receiverRef,
    useRoomStore: { getState: () => h.room },
  })
  try {
    h.broadcast({ isPreview: true, noProxyFallback: true, playsvideoEnabled: true }); await flush()
    exports.receive({ source: { url: initial().sourceUrl, sourceType: 'anime', format: 'hls' } }); await flush()
    assert.equal(h.attachments.length, 1)
    assert.equal(h.room.watchTogether.noProxyFallback, true)
    assert.equal(h.room.watchTogether.playsvideoEnabled, true)
    exports.receive({ source: { url: initial().sourceUrl, sourceType: 'anime', format: 'hls', noProxyFallback: false, playsvideoEnabled: false } }); await flush()
    assert.equal(h.attachments.length, 2)
    assert.equal(h.attachments[1].state.noProxyFallback, false)
  } finally { h.close() }
})

test('playback headers compare by value and engine switches are part of media identity', () => {
  const state = { ...initial(), headers: { Referer: 'source', Accept: 'video' } }
  assert.equal(merge.isSameMediaSource(state, { ...state, currentTime: 99, headers: { Accept: 'video', Referer: 'source' } }), true)
  for (const patch of [{ audioUrl: 'https://cdn.test/audio' }, { format: 'dash' }, { headers: { Referer: 'changed' } },
    { noProxyFallback: undefined }, { playsvideoEnabled: true }]) {
    assert.equal(merge.isSameMediaSource(state, { ...state, ...patch }), false)
  }
})

test('the actual player hook replaces a same-URL engine when policies change, including a queued revert', async () => {
  const attachments = [], cleanups = [], effects = []
  let hold = false, finish
  const video = { isConnected: true, paused: true, pause() {}, addEventListener() {}, removeEventListener() {} }
  const engine = { type: 'hls', async attach(_video, source) {
    attachments.push(source)
    if (hold) { hold = false; await new Promise(resolve => { finish = resolve }) }
    return { cleanup: () => cleanups.push(source) }
  } }
  const { usePlayerSource } = loadTs('src/upstream/modules/player/hooks/usePlayerSource.ts', {
    react: { useRef: current => ({ current }), useCallback: fn => fn, useEffect: fn => effects.push(fn()) },
    '@/store/roomStore': { useRoomStore: { getState: () => ({ roomSessionRevision: 1, currentMovieId: 1, setMediaAttachProgress() {} }) } },
    '@/modules/player': { selectEngine: () => engine, shouldUsePlaysVideo: () => false, resetVideoElement() {} },
    '@/modules/player/utils': { formatVideoLoadError: () => '' }, '@/lib/api': {},
    '@/lib/mediaFormat': { isBrowserPlayableFormat: () => true },
    '../services/source-identity': loadTs('src/upstream/modules/player/services/source-identity.ts'),
    '../codec-capability': loadTs('src/upstream/modules/player/codec-capability.ts'),
  }, { URL })
  const player = usePlayerSource({ videoRef: { current: video } })
  const direct = { url: 'https://media.test/video', format: 'hls', noProxyFallback: true, playsvideoEnabled: false }
  try {
    await player.attachSource(video, direct)
    await player.attachSource(video, { ...direct, startTime: 20 })
    assert.equal(attachments.length, 1)
    hold = true
    const proxy = player.attachSource(video, { ...direct, noProxyFallback: false })
    await flush()
    const revert = player.attachSource(video, direct)
    finish(); await Promise.all([proxy, revert])
    assert.deepEqual(attachments.map(a => a.noProxyFallback), [true, false, true])
    await player.attachSource(video, { ...direct, playsvideoEnabled: true })
    assert.equal(attachments.length, 4); assert.equal(cleanups.length, 3)
  } finally { effects.forEach(fn => fn?.()) }
})

test('viewer re-resolution preserves explicit wire policies and previews cannot resolve the previous movie', async () => {
  const code = readFileSync('src/upstream/modules/sync-playback/hooks/useVideoSource.ts', 'utf8')
  const start = code.indexOf('  const resolveViewerEffectiveState = useCallback(')
  const end = code.indexOf('\n  // 将指定状态中的视频源', start)
  const movie = { id: 1, sourceType: 'anime', serverProxy: true, playsvideoEnabled: true }
  const room = { roomSessionRevision: 1, currentMovieId: 1, movies: [movie] }
  let calls = 0
  const exports = {}
  runInNewContext(stripTypeScriptTypes(code.slice(start, end))+';exports.resolve=resolveViewerEffectiveState', {
    exports, useCallback: fn => fn, isHostRef: { current: false },
    useRoomStore: { getState: () => room },
    resolveViewerMovieSource: async (selected, policy) => {
      calls++; assert.equal(selected.serverProxy, true)
      assert.equal(policy.noProxyFallback, true)
      return { sourceUrl: 'https://fresh.test/hls', noProxyFallback: false, playsvideoEnabled: true }
    },
  })
  const state = { ...initial(), noProxyFallback: true, playsvideoEnabled: false }
  const effective = await exports.resolve(state)
  assert.equal(effective.noProxyFallback, true); assert.equal(effective.playsvideoEnabled, false)
  assert.equal(effective.sourceUrl, 'https://fresh.test/hls')
  const preview = { ...state, isPreview: true }
  assert.equal(await exports.resolve(preview), preview); assert.equal(calls, 1)
})

test('HLS attachment starts at the restored fragment and waits for first-frame data before returning', async () => {
  const code = readFileSync('src/upstream/modules/player/engines/hls-engine.ts', 'utf8')
  const start = code.indexOf('export const hlsEngine:')
  let finishMetadata, configuration, metadataRequested = false
  class Hls {
    static isSupported() { return true }
    static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'parsed', ERROR: 'error' }
    constructor(config) { configuration = config }
    on() {} attachMedia() {} destroy() {}
  }
  const exports = {}
  runInNewContext(stripTypeScriptTypes(code.slice(start)).replace('export const', 'const')+';exports.engine=hlsEngine', {
    exports, Hls, resetVideoElement() {}, resolveProxyUrl: url => url, createProxyLoader() {},
    waitForHlsReady: async () => {},
    waitForMetadata: (_video, _timeout, _signal, readyState) => { assert.equal(readyState, 2); metadataRequested = true; return new Promise(resolve => { finishMetadata = resolve }) },
    console: { log() {}, error() {} },
  })
  let settled = false
  const attachment = exports.engine.attach({}, { url: 'https://media.test/a.m3u8', startTime: 18 }).then(() => { settled = true })
  await flush()
  assert.equal(configuration.startPosition, 18); assert.equal(metadataRequested, true)
  assert.equal(settled, false, 'a parsed manifest alone does not make the video seekable')
  finishMetadata(); await attachment
  assert.equal(settled, true)
})


test('media readiness at HAVE_METADATA waits for loadeddata and cancellation releases its listeners', async () => {
  const { waitForMetadata } = loadTs('src/upstream/modules/player/utils.ts', {}, { setTimeout, clearTimeout })
  for (const abort of [false, true]) {
    const handlers = new Map(), controller = new AbortController()
    const video = { readyState: 1, addEventListener: (e, fn) => handlers.set(e, fn), removeEventListener: e => handlers.delete(e) }
    let resolved = false
    const ready = waitForMetadata(video, 1000, controller.signal, 2).then(() => { resolved = true })
    assert.equal(resolved, false); assert.ok(handlers.has('loadeddata'))
    if (abort) { controller.abort(); await assert.rejects(ready, { name: 'AbortError' }) }
    else { video.readyState = 2; handlers.get('loadeddata')(); await ready; assert.equal(resolved, true) }
    assert.equal(handlers.size, 0)
  }
})
