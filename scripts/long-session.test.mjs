import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { parse } from '@babel/parser'

const root = new URL('../src/upstream/', import.meta.url)
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
function clock() {
  let now = 1_800_000_000_000
  const timers = new Map()
  let id = 0
  return {
    Date: class extends Date { static now() { return now } },
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id },
    clearTimeout: key => timers.delete(key),
    advance: value => { now += value },
    run: async () => {
      const next = [...timers][0]
      assert.ok(next, 'expected a scheduled recovery')
      timers.delete(next[0])
      now += next[1].delay
      next[1].fn()
      await flush()
    },
    timers,
  }
}
async function load(file, imports = {}, globals = {}) {
  const context = createContext({ console, URL, ...globals })
  const module = new SourceTextModule(stripTypeScriptTypes(readFileSync(new URL(file, root), 'utf8')), { context })
  await module.link(name => {
    assert.ok(name in imports, `unexpected import ${name}`)
    const values = imports[name]
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}
const cdn = (clock, seconds) => `https://fixture.bilivideo.com/audio.m4s?deadline=${Math.floor(clock.Date.now() / 1000) + seconds}`
const proxy = url => `https://fixture.invalid/api/stream/proxy?url=${encodeURIComponent(url)}`
async function cacheFixture() {
  const time = clock()
  const expiry = await load('modules/playback-memory/services/url-expiry.ts', {}, time)
  const cache = await load('modules/music/hooks/biliAudioCache.ts', {
    '@/modules/playback-memory/services/url-expiry': expiry,
  }, time)
  return { time, expiry, cache }
}

test('nested CDN deadlines are strict and proactively renewed one minute early', async () => {
  const { time, expiry } = await cacheFixture()
  assert.equal(expiry.isBilibiliUrlExpiring(proxy(proxy(cdn(time, 59)))), true)
  assert.equal(expiry.isBilibiliUrlExpiring(cdn(time, 61)), false)
  for (const value of ['', 'bad', '?deadline=123abc', '?deadline=-1', '?deadline=Infinity']) {
    assert.equal(expiry.getBilibiliUrlDeadline(value), null)
  }
})

test('audio, standby and video caches reject expired signatures and stale generations', async () => {
  const { time, cache } = await cacheFixture()
  const url = proxy(cdn(time, 70))
  cache.setCachedBiliAudioUrl('a', url)
  cache.setBiliStandbyUrl('a', url)
  cache.setCachedBiliVideoSource('v', { url: cdn(time, 7200), audioUrl: url })
  time.advance(11_000)
  assert.equal(cache.getCachedBiliAudioUrl('a'), null)
  assert.equal(cache.takeBiliStandbyUrl('a'), null)
  assert.equal(cache.getCachedBiliVideoSource('v'), null)
  const generation = cache.beginBiliResolve('a')
  cache.clearBiliAudioCache()
  assert.equal(cache.commitBiliResolve('a', generation, cdn(time, 7200)), false)
  const next = cache.beginBiliResolve('a')
  assert.equal(cache.commitBiliResolve('a', next, cdn(time, 7200)), true)
  assert.ok(cache.getCachedBiliAudioUrl('a'))
})

async function recoveryFixture() {
  const { time, expiry, cache } = await cacheFixture()
  const request = deferred()
  const audio = { src: proxy(cdn(time, 30)), currentTime: 7201, playbackRate: 1.25, paused: false, error: null }
  const state = { item: { biliBvid: 'BVfixture', biliCid: 202 }, key: 'bili:BVfixture:202',
    identity: 'room|track|request|account', cacheKey: 'fixture:202|session|server', audio, playing: true }
  const plays = []
  let reads = true, resolutions = 0, refreshes = 0, failures = 0
  const api = await load('modules/music/hooks/musicStreamRecovery.ts', {
    '@/modules/playback-memory/services/url-expiry': expiry, './biliAudioCache': cache,
  }, time)
  cache.setCachedBiliAudioUrl(state.cacheKey, audio.src)
  const controller = api.createMusicStreamRecovery({
    read: () => reads ? state : null,
    resolve: async (item, options) => {
      assert.equal(item.biliCid, 202)
      assert.equal(options.noCache, true)
      resolutions++
      return request.promise
    },
    refresh: async () => { refreshes++ },
    play: (_state, url, position, playing, rate) => {
      plays.push({ url, position, playing, rate })
      audio.src = url
      state.identity += '|loaded'
    },
    failed: () => failures++,
  })
  return { time, cache, controller, state, audio, request, plays,
    disconnect: () => { reads = false }, resolutions: () => resolutions,
    refreshes: () => refreshes, failures: () => failures }
}

test('renewal is single flight and retains current CID, progress, rate and pause intent', async () => {
  const f = await recoveryFixture()
  f.controller.check()
  f.controller.check()
  await f.time.run()
  assert.equal(f.resolutions(), 1)
  f.state.playing = false
  f.audio.currentTime = 7300
  f.request.resolve({ playUrl: cdn(f.time, 7200) })
  await flush()
  assert.equal(f.plays.length, 1)
  assert.deepEqual(f.plays[0], { url: cdn(f.time, 7200), position: 7300, playing: false, rate: 1.25 })
})

for (const change of ['track', 'room', 'account', 'request', 'disconnect', 'teardown']) {
  test(`late renewal cannot play after ${change}`, async () => {
    const f = await recoveryFixture()
    f.controller.recover(true)
    await f.time.run()
    if (change === 'disconnect') f.disconnect()
    else if (change === 'teardown') f.controller.dispose()
    else f.state.identity += `|${change}`
    f.request.resolve({ playUrl: cdn(f.time, 7200) })
    await flush()
    assert.equal(f.plays.length, 0)
  })
}

test('an expired standby is discarded; a valid standby avoids a second parse', async () => {
  const f = await recoveryFixture()
  f.cache.setBiliStandbyUrl(f.state.cacheKey, cdn(f.time, 7200))
  f.controller.check()
  await f.time.run()
  assert.equal(f.resolutions(), 0)
  assert.equal(f.plays.length, 1)
})

test('failed recovery is bounded, manual retry works, and teardown clears queued work', async () => {
  const f = await recoveryFixture()
  f.request.reject(new Error('fixture unavailable'))
  // The rejection is consumed by the first resolve call below.
  for (let i = 0; i < 3; i++) {
    f.controller.recover(true)
    await f.time.run()
  }
  assert.equal(f.resolutions(), 3)
  assert.equal(f.failures(), 1)
  assert.equal(f.controller.recover(true), false)
  assert.equal(f.controller.retry(), true)
  f.controller.dispose()
  assert.equal(f.time.timers.size, 0)
})

test('stable advancing playback restores the recovery budget', async () => {
  const f = await recoveryFixture()
  f.controller.recover(true)
  await f.time.run()
  f.request.resolve({ playUrl: cdn(f.time, 7200) })
  await flush()
  f.time.advance(16_000)
  f.audio.currentTime += 4
  f.controller.check()
  f.audio.error = { code: 4 }
  assert.equal(f.controller.recover(true), true)
  f.controller.dispose()
})

test('socket handshake carries both credentials while legacy access-only login still works', async () => {
  const storage = new Map([['zviewer-access-token', 'fixture-access'], ['zviewer-refresh-token', 'fixture-refresh']])
  const auth = await load('lib/authTransport.ts', {}, { localStorage: { getItem: key => storage.get(key) } })
  assert.deepEqual({ ...auth.buildSocketAuth() }, { token: 'fixture-access', refreshToken: 'fixture-refresh' })
  storage.delete('zviewer-refresh-token')
  assert.deepEqual({ ...auth.buildSocketAuth() }, { token: 'fixture-access' })
  storage.clear()
  assert.deepEqual({ ...auth.buildSocketAuth() }, {})
})

async function membersFixture() {
  const handlers = new Map(), requests = [], timers = [], documentHandlers = new Map(), notices = []
  let cleanup
  const state = {
    viewers: [], moderators: [], mutedViewerIds: [],
    addViewer: viewer => state.viewers.push(viewer),
    removeViewer: socketId => { state.viewers = state.viewers.filter(v => v.socketId !== socketId) },
    setModerators: value => { state.moderators = value },
    addMutedViewer: id => { state.mutedViewerIds.push(id) },
    removeMutedViewer: id => { state.mutedViewerIds = state.mutedViewerIds.filter(v => v !== id) },
  }
  const socket = {
    id: 'socket-a', connected: true,
    on: (event, fn) => handlers.set(event, fn),
    off: event => handlers.delete(event),
    timeout() { return this },
    emit: (event, payload, ack) => requests.push({ event, payload, ack }),
  }
  const api = await load('modules/sync-playback/hooks/useViewerList.ts', {
    react: { useEffect: effect => { cleanup = effect() } },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '@/store/roomStore': { useRoomStore: { getState: () => state, setState: patch => Object.assign(state, patch) } },
    '@/store/authStore': { useAuthStore: { getState: () => ({ user: { id: '7' } }) } },
    '@/components/ui/message': { message: Object.fromEntries(['info', 'success', 'warning'].map(key => [key, value => notices.push(value)])) },
    '../constants': { SOCKET_EVENT: { VIEWER_JOINED: 'viewer-joined', VIEWER_LEFT: 'viewer-left' } },
  }, {
    document: { visibilityState: 'visible', addEventListener: (event, fn) => documentHandlers.set(event, fn), removeEventListener: event => documentHandlers.delete(event) },
    setInterval: fn => { timers.push(fn); return 1 }, clearInterval: () => { timers.length = 0 },
  })
  api.useViewerList('room')
  const reply = (request, data) => request.ack(null, { success: true, data: { roomId: 'room', viewers: [], moderators: [], mutedViewerIds: [], ...data } })
  return { state, socket, handlers, requests, timers, notices, documentHandlers, reply, cleanup: () => cleanup() }
}

test('room-level snapshots repair missed joins without opening the settings panel', async () => {
  const f = await membersFixture()
  f.reply(f.requests[0], { viewers: [{ socketId: 'v1', userId: 7 }], moderators: [7] })
  assert.equal(f.state.viewers[0].socketId, 'v1')
  f.handlers.get('moderators-changed')({ roomId: 'room', moderators: [] })
  assert.equal(f.state.moderators.length, 0)
  assert.equal(f.notices.length, 1)
  f.handlers.get('viewer-muted')({ userId: 7, muted: true })
  assert.ok(f.state.mutedViewerIds.includes(7))
  f.timers[0]()
  assert.equal(f.requests.length, 2)
  f.cleanup()
  assert.equal(f.handlers.size, 0)
  assert.equal(f.timers.length, 0)
})

for (const newer of ['viewer-joined', 'moderators-changed', 'room-members', 'viewer-muted', 'reconnect', 'unmount']) {
  test(`old member queries cannot overwrite ${newer}`, async () => {
    const f = await membersFixture()
    if (newer === 'reconnect') { f.socket.id = 'socket-b'; f.handlers.get('connect')() }
    else if (newer === 'unmount') f.cleanup()
    else f.handlers.get(newer)({
      viewerSocketId: 'new', roomId: 'room', viewers: [{ socketId: 'new' }],
      userId: 7, muted: true, moderators: [7], mutedViewerIds: [7],
    })
    const before = JSON.stringify(f.state)
    f.reply(f.requests[0], { viewers: [{ socketId: 'obsolete' }] })
    assert.equal(JSON.stringify(f.state), before)
    f.cleanup()
  })
}

function extract(file, predicate) {
  const text = readFileSync(new URL(file, root), 'utf8')
  const ast = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  let found
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (predicate(node, text)) found = node
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object' && value.type) visit(value)
    }
  }
  visit(ast)
  assert.ok(found)
  return stripTypeScriptTypes(`const extracted = ${text.slice(found.start, found.end)}`)
}

test('self danmaku echo is suppressed without swallowing another sender with identical text', () => {
  const pendingSelfEchoRef = { current: [] }, displays = [], realtime = [], handlers = new Map()
  const socket = { on: (event, fn) => handlers.set(event, fn), off: () => {}, emit: () => {} }
  const deps = {
    socket, roomId: 'room', pendingSelfEchoRef,
    danmakuLayerRef: { current: { sendDanmaku: (...args) => displays.push(args) } },
    addRealtime: item => realtime.push(item), videoRef: { current: { currentTime: 10 } },
    useAuthStore: { getState: () => ({ user: { username: 'fixture-self' } }) }, message: { error: () => {} },
  }
  const effect = extract('modules/room/watch-together/WatchTogetherCore.tsx', (node, text) =>
    node.type === 'ArrowFunctionExpression' && text.slice(node.body.start, node.body.end).includes("socket.on('danmaku', handleDanmaku)"))
  new Function(...Object.keys(deps), `${effect}; return extracted()`)(...Object.values(deps))
  const send = extract('modules/room/watch-together/WatchTogetherCore.tsx', (node, text) =>
    node.type === 'ArrowFunctionExpression' && text.slice(node.body.start, node.body.end).includes("socket.emit('send-danmaku'"))
  new Function(...Object.keys(deps), `${send}; return extracted('same text')`)(...Object.values(deps))
  handlers.get('danmaku')({ text: 'same text', sender: 'another-user' })
  handlers.get('danmaku')({ text: 'same text', sender: 'fixture-self' })
  assert.equal(displays.length, 2)
  assert.equal(realtime.length, 2)
})

test('watching renews an expiring audio track, bounds retries, and stops on room change', async () => {
  const time = clock()
  const { isBilibiliUrlExpiring } = await load('modules/playback-memory/services/url-expiry.ts', {}, time)
  const state = { roomId: 'room', watchTogether: { sourceType: 'bilibili',
    sourceUrl: cdn(time, 7200), audioUrl: proxy(cdn(time, 30)) } }
  const video = { isConnected: true, currentTime: 300, paused: false, error: null,
    addEventListener: () => {}, removeEventListener: () => {} }
  const timers = [], documentHandlers = new Map()
  let renewals = 0
  const deps = {
    Date: time.Date, isHost: true, isHostRef: { current: true }, videoRef: { current: video }, roomId: 'room',
    useRoomStore: { getState: () => state }, isBilibiliUrlExpiring,
    suppressEventsRef: { current: false }, isReloadingBilibiliRef: { current: false },
    autoReloadCountRef: { current: 0 }, autoReloadNotifiedRef: { current: false },
    currentMovieId: 1, deadlineRenewalRef: { current: { scope: '' } },
    reloadBilibili: async () => { renewals++ },
    setInterval: fn => { timers.push(fn); return 1 }, clearInterval: () => { timers.length = 0 },
    document: { visibilityState: 'visible', addEventListener: (key, fn) => documentHandlers.set(key, fn), removeEventListener: key => documentHandlers.delete(key) },
  }
  const effect = extract('modules/room/watch-together/useWatchTogether.ts', (node, text) =>
    node.type === 'ArrowFunctionExpression' && text.slice(node.body.start, node.body.end).includes('const renewal = deadlineRenewalRef.current'))
  const mount = () => new Function(...Object.keys(deps), `${effect}; return extracted()`)(...Object.values(deps))
  let cleanup = mount()
  await flush()
  assert.equal(renewals, 1)
  for (let i = 0; i < 5; i++) { time.advance(31_000); timers[0](); await flush() }
  assert.equal(renewals, 3)
  cleanup()
  cleanup = mount()
  await flush()
  assert.equal(renewals, 3, 'rendering must not reset the exhausted renewal budget')
  state.roomId = 'another-room'
  documentHandlers.get('visibilitychange')()
  assert.equal(renewals, 3)
  cleanup()
  assert.equal(timers.length, 0)
  assert.equal(documentHandlers.size, 0)
})

test('approved music pause updates intent during an in-flight source recovery', () => {
  const state = { isPlaying: true, setPlaying: value => { state.isPlaying = value } }
  let paused = 0
  const deps = {
    getAudio: () => ({ paused: true, error: { code: 4 } }),
    useMusicStore: { getState: () => state }, streamRecoveryRef: { current: { retry: () => true } },
    playAudioWithRetry: () => {}, pauseAudioWithCancel: () => { paused++ }, switchSong: () => {},
  }
  const fn = extract('modules/music/hooks/useListenTogether.ts', (node, text) => {
    const body = node.body && text.slice(node.body.start, node.body.end)
    return node.type === 'ArrowFunctionExpression' && body.includes("case 'pause':") &&
      body.includes("case 'seek':") && !body.includes('broadcastSyncState')
  })
  new Function(...Object.keys(deps), `${fn}; return extracted('pause')`)(...Object.values(deps))
  assert.equal(state.isPlaying, false)
  assert.equal(paused, 1)
})
