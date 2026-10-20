import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

function clock() {
  let id = 0
  const tasks = new Map()
  return { tasks, setTimeout: fn => { tasks.set(++id, fn); return id }, clearTimeout: id => tasks.delete(id),
    tick() { const pending = [...tasks.values()]; tasks.clear(); for (const fn of pending) fn() } }
}

test('self-check timeout releases lock and rejects a late reply', () => {
  const c = clock()
  const { createAckGuard } = loadTs('src/upstream/modules/sync-playback/ackGuard.ts', {}, c)
  let count = 0
  const g = createAckGuard(() => 'room/movie')
  const old = g.begin(() => count++)
  assert.equal(g.begin(() => count++), undefined)
  c.tick()
  const next = g.begin(() => count++)
  old({}); assert.equal(count, 0)
  next({}); assert.equal(count, 1)
  g.dispose(); assert.equal(g.begin(() => count++), undefined)
})

test('self-check replies cannot cross room, source or song generations', () => {
  const c = clock()
  const { createAckGuard } = loadTs('src/upstream/modules/sync-playback/ackGuard.ts', {}, c)
  let key = 'room1/movie1', applied = false
  const g = createAckGuard(() => key)
  const ack = g.begin(() => { applied = true })
  key = 'room2/movie2'; ack({})
  assert.equal(applied, false)
  assert.equal(typeof g.begin(() => {}), 'function')
  g.dispose()
})

function heartbeatHarness() {
  const listeners = new Map(), intervals = [], cleanups = [], sent = [], seeks = []
  const c = clock()
  const state = { currentMovieId: 1, hostOffline: false, watchTogether: { sourceUrl: 'https://cdn.test/a.mp4' },
    setHostOffline(value) { state.hostOffline = value } }
  const video = { currentSrc: 'https://cdn.test/a.mp4', currentTime: 20, paused: true, readyState: 4,
    playbackRate: 1, seeking: false, pause() { this.paused = true } }
  const suppress = { current: false }
  const socket = { on: (e, f) => listeners.set(e, f), off: e => listeners.delete(e), emit: (...args) => sent.push(args) }
  const modules = {
    react: { useRef: value => ({ current: value }), useEffect: fn => cleanups.push(fn()) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '@/store/roomStore': { useRoomStore: { getState: () => state } },
    '@/components/ui/message': { message: { info() {} } },
    '@/modules/sync-playback/constants': { SOCKET_EVENT: { SYNC_HEARTBEAT: 'beat', HOST_DISCONNECTED: 'left', CHECK_STATUS: 'check' }, CHECK_STATUS_INTERVAL_MS: 10000 },
    '@/modules/sync-playback/services': { executeSeek: async p => { seeks.push(p.targetTime); return false }, getAdaptiveSeekThreshold: () => 3, shouldSoftSync: (a, b) => Math.abs(a - b) <= 6 },
    '@/modules/sync-playback/safePlay': { safePlay: v => { v.paused = false } },
    '@/modules/sync-playback/ackGuard': loadTs('src/upstream/modules/sync-playback/ackGuard.ts', {}, c),
    '../services/url-expiry': { isBilibiliUrlExpired: () => false },
  }
  const { useServerHeartbeat } = loadTs('src/upstream/modules/playback-memory/hooks/useServerHeartbeat.ts', modules,
    { ...c, setInterval: f => { intervals.push(f); return 1 }, clearInterval() {} })
  useServerHeartbeat({ roomId: 'test', isHostRef: { current: false }, videoRef: { current: video }, suppressEventsRef: suppress,
    watchTogether: state.watchTogether, setWatchTogether() {}, seekTo: async () => ({success: true}), reloadVideo: async () => {} })
  const beat = payload => listeners.get('beat')(payload)
  const server = (extra = {}) => beat({ roomId: 'test', source: 'server', hostOnline: true,
    state: { sourceUrl: 'https://cdn.test/a.mp4', currentTime: 20, isPlaying: true, playbackRate: 1, ...extra.state }, ...extra })
  return { state, video, suppress, beat, server, intervals, sent, seeks, cleanups, listeners }
}

test('offline status is received before suppression and preserves autonomous pause', () => {
  const h = heartbeatHarness()
  h.suppress.current = true; h.server({hostOnline: false})
  assert.equal(h.state.hostOffline, true)
  h.suppress.current = false; h.server({hostOnline: false})
  assert.equal(h.video.paused, true)
  h.server(); assert.equal(h.video.paused, false)
})

test('server authority suppresses the legacy host correction path', () => {
  const h = heartbeatHarness()
  h.beat({source: 'host', currentTime: 20, isPlaying: true, playbackRate: 1})
  assert.equal(h.video.paused, false)
  h.server({state: {...h.state.watchTogether, currentTime: 20, isPlaying: false, playbackRate: 1}})
  h.beat({source: 'host', currentTime: 80, isPlaying: true, playbackRate: 2})
  assert.equal(h.video.paused, true); assert.equal(h.video.playbackRate, 1)
})

test('an explicit disconnect outranks a cached online heartbeat until fresh host readiness', () => {
  const h = heartbeatHarness()
  h.server()
  h.listeners.get('left')()
  h.video.paused = true
  h.server() // backend hostOnline cache may remain true for five seconds
  assert.equal(h.state.hostOffline,true)
  assert.equal(h.video.paused,true)
  h.listeners.get('sharer-ready')()
  h.server()
  assert.equal(h.state.hostOffline,false)
  assert.equal(h.video.paused,false)
})

test('server correction ignores other rooms and old sources; ahead viewers slow down', () => {
  const h = heartbeatHarness()
  h.server({roomId: 'other'}); assert.equal(h.video.paused, true)
  h.server({state: {sourceUrl: 'old', currentTime: 80, isPlaying: true}})
  assert.equal(h.video.paused, true)
  h.server({state: {...h.state.watchTogether, currentTime: 16, isPlaying: true, playbackRate: 1}})
  assert.equal(h.video.playbackRate, 0.95)
  h.server({state: {...h.state.watchTogether, currentTime: 24, isPlaying: true, playbackRate: 1}})
  assert.equal(h.video.playbackRate, 1.05)
})

test('self-check ack from a replaced movie cannot seek the new movie', () => {
  const h = heartbeatHarness()
  h.intervals[0]()
  const ack = h.sent.at(-1)[2]
  h.state.currentMovieId = 2
  ack({success: true, data: {needsSync: true, state: {...h.state.watchTogether, currentTime: 200, isPlaying: true}}})
  assert.deepEqual(h.seeks, [])
  h.cleanups.forEach(f => f?.())
})

test('full-state sync seeks to zero, and a delayed control seek cannot affect a replaced movie', async () => {
  const handlers = new Map(), seeks = []
  let movieId = 1, hold = false, finish
  const state = {sourceUrl: 'media', currentTime: 0, isPlaying: false, playbackRate: 1}
  const video = {currentTime: 45, playbackRate: 1, paused: true, pause() {}}
  const socket = {on: (e,f) => handlers.set(e,f), off() {}, emit() {}}
  const {useViewerStateSync} = loadTs('src/upstream/modules/sync-playback/hooks/useViewerStateSync.ts', {
    react: {useEffect: f => f(), useRef: value => ({current: value})},
    '@/hooks/useSocket': {useSocket: () => ({socket})},
    '@/components/ui/message': {message: {error() {}}},
    '@/store/roomStore': {useRoomStore: {getState: () => ({watchTogether: state, currentMovieId: movieId, roomSessionRevision: 1})}},
    '../constants': {SOCKET_EVENT: {STATE: 'state', CONTROL: 'control'}},
    '../safePlay': {safePlay() {}},
    '../services': {...loadTs('src/upstream/modules/sync-playback/services/state-merge.ts'), executeSeek: async p => {seeks.push(p.targetTime); return hold ? new Promise(resolve => { finish = resolve }) : false}},
    '@/modules/player/services/buffer-mode': {},
  })
  useViewerStateSync({roomId: 'room', isHostRef: {current: false}, videoRef: {current: video},
    suppressEventsRef: {current: false}, setWatchTogether() {}, applySourceToVideo: async () => {},
    seekTo: async () => ({success: true}), reloadVideo: async () => {}, lastAppliedSourceUrlRef: {current: 'media'}})
  handlers.get('state')({state})
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(seeks,[0]); assert.equal(video.currentTime,0)
  video.currentTime = 45; hold = true
  handlers.get('control')({action: 'seek', value: 5})
  movieId = 2; finish(false)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(video.currentTime,45)
})

test('media token refresh replaces stale selected-server tokens without leaking to a CDN', () => {
  const {authenticatedMediaUrl} = loadTs('src/mobile/serverUrl.ts', {'../platform/connectionTransport': {connectionUrl: v => v}}, {URL})
  const selected = 'https://server.test/base'
  const refreshed = new URL(authenticatedMediaUrl(selected, selected+'/api/stream/proxy?token=old','new'))
  assert.equal(refreshed.searchParams.get('token'),'new')
  const cdn = 'https://cdn.test/base/api/file?signature=private-source-signature'
  assert.equal(authenticatedMediaUrl(selected,cdn,'new'),cdn)
})

test('JWT expiry is bounded to a parseable finite expiry and respects the supplied clock', () => {
  let token = ''
  const {isAccessTokenExpired} = loadTs('src/upstream/lib/authTransport.ts', {}, {
    localStorage: {getItem: () => token}, atob,
  })
  assert.equal(isAccessTokenExpired(1000),false)
  token = 'bad'; assert.equal(isAccessTokenExpired(1000),false)
  token = 'x.'+Buffer.from(JSON.stringify({exp:2})).toString('base64url')+'.x'
  assert.equal(isAccessTokenExpired(1000),false)
  assert.equal(isAccessTokenExpired(2000),true)
})

test('Harmony safe-area callbacks tolerate unattached and destroyed Web controllers', () => {
  const source = readFileSync('ZV-HarmonyOS/entry/src/main/ets/pages/Index.ets','utf8')
  const start = source.indexOf('  private syncSafeArea()')
  const body = source.slice(start,source.indexOf('  aboutToAppear()',start)).replace('private syncSafeArea','function syncSafeArea')
  const exports = {}
  runInNewContext(stripTypeScriptTypes(body)+';exports.run=syncSafeArea', {exports, window: {AvoidAreaType: {TYPE_SYSTEM: 0,TYPE_CUTOUT: 1,TYPE_NAVIGATION_INDICATOR: 2}}})
  let calls = 0
  const empty = {height: 0,width: 0}
  const context = {alive: true, pageReady: false,
    mainWindow: {getWindowAvoidArea: () => ({topRect: empty,bottomRect: empty,leftRect: empty,rightRect: empty})},
    controller: {runJavaScript() { calls++; throw new Error('17100001: WebviewController must be associated with a Web component') }}}
  assert.doesNotThrow(() => exports.run.call(context)); assert.equal(calls,0)
  context.pageReady = true
  assert.doesNotThrow(() => exports.run.call(context)); assert.equal(calls,1)
  context.alive = false
  assert.doesNotThrow(() => exports.run.call(context)); assert.equal(calls,1)
})
