import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { parse } from '@babel/parser'
import * as stateServices from '../src/upstream/modules/sync-playback/services/state-merge.ts'
import { logicalConnectionUrl } from '../src/platform/connectionTransport.ts'
import { markUserPaused, clearUserPaused, wasUserPaused } from '../src/upstream/modules/player/services/pause-intent.ts'

async function load(path, imports = {}, globals = {}) {
  const context = createContext({ console, URL, Error, ...globals })
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
  const module = new SourceTextModule(source, { context })
  await module.link(name => {
    const exports = imports[name]
    assert.ok(exports, `Missing import ${name}`)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

function clock() {
  let now = 0, nextId = 0
  const intervals = new Map()
  return {
    Date: class extends Date { static now() { return now } },
    setInterval(fn, delay) { const id = ++nextId; intervals.set(id, { fn, delay, at: now + delay }); return id },
    clearInterval(id) { intervals.delete(id) },
    advance(ms) {
      const until = now + ms
      for (;;) {
        const next = [...intervals].sort(([, a], [, b]) => a.at - b.at)[0]
        if (!next || next[1].at > until) break
        now = next[1].at
        next[1].at += next[1].delay
        next[1].fn()
      }
      now = until
    },
  }
}

function video() {
  return Object.assign(new EventTarget(), {
    currentSrc: 'blob:fixture', currentTime: 100, playbackRate: 1, paused: false,
    ended: false, seeking: false, isConnected: true, decodedFrames: 20,
    getVideoPlaybackQuality() { return { totalVideoFrames: this.decodedFrames } },
  })
}

function room() {
  return {
    roomId: 'fixture-room', roomSessionRevision: 1, currentMovieId: 1,
    watchTogether: {
      sourceType: 'bilibili', sourceUrl: 'https://cdn.example/video.m4s',
      audioUrl: 'https://cdn.example/audio.m4s', currentTime: 100,
      isPlaying: true, playbackRate: 1, duration: 1000, cid: 42, currentQn: 80,
    },
  }
}

async function heartbeat({ suppressed = false, initiallyHost = true } = {}) {
  const time = clock(), element = video(), store = room(), effects = [], sent = []
  const stablePlaybackRef = { current: null }
  const suppression = { current: suppressed }, host = { current: initiallyHost }
  const api = await load('../src/upstream/modules/sync-playback/hooks/useHostHeartbeat.ts', {
    react: { useEffect: fn => effects.push(fn), useRef: current => ({ current }) },
    '@/hooks/useSocket': { useSocket: () => ({ socket: { emit: (...args) => sent.push(args) } }) },
    '@/store/roomStore': { useRoomStore: { getState: () => store } },
    '../constants': { SOCKET_EVENT: { HOST_HEARTBEAT: 'host-heartbeat' }, HEARTBEAT_INTERVAL_MS: 2000 },
    '../services': stateServices,
    '@/modules/player/services/pause-intent': { wasUserPaused },
  }, time)
  api.useHostHeartbeat({ roomId: store.roomId, isHostRef: host, videoRef: { current: element }, suppressEventsRef: suppression, stablePlaybackRef })
  const cleanup = effects.map(fn => fn()).filter(Boolean)
  return { time, element, store, sent, suppression, host, api, stablePlaybackRef,
    pauseIntent() { markUserPaused(element) }, dispose() { cleanup.forEach(fn => fn()) } }
}

test('suppressed recovery keeps liveness and the stable timeline, never transient zero/paused media state', async () => {
  const h = await heartbeat()
  h.element.currentTime = 120; h.element.playbackRate = 2
  h.element.dispatchEvent(new Event('timeupdate'))
  h.time.advance(2000)
  h.suppression.current = true
  h.element.currentTime = 0; h.element.paused = true
  h.element.dispatchEvent(new Event('pause'))
  h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].suppressed, true)
  assert.equal(h.sent.at(-1)[1].isPlaying, true)
  assert.equal(h.sent.at(-1)[1].currentTime, 124)
  h.time.advance(10000)
  assert.equal(h.sent.at(-1)[1].currentTime, 144)
  assert.equal(h.sent.at(-1)[1].playbackRate, 2)
  h.element.currentTime = 126; h.element.paused = false
  h.suppression.current = false; h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].currentTime, 126)
  assert.equal(h.sent.at(-1)[1].suppressed, undefined)
  h.dispose()
  const count = h.sent.length; h.time.advance(10000)
  assert.equal(h.sent.length, count)
})

test('suppressed initialization and another movie use store state and never reuse the previous movie clock', async () => {
  const h = await heartbeat({ suppressed: true })
  h.element.currentTime = 0; h.element.paused = true
  h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].currentTime, 102)
  assert.equal(h.sent.at(-1)[1].isPlaying, true)
  h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].currentTime, 104)
  h.store.currentMovieId = 2
  h.store.watchTogether = { ...h.store.watchTogether, cid: 43, currentTime: 20, isPlaying: false }
  h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].currentTime, 20)
  assert.equal(h.sent.at(-1)[1].isPlaying, false)
  h.time.advance(10000)
  assert.equal(h.sent.at(-1)[1].currentTime, 20)
  h.dispose()
})

test('suppressed timeline clamps at duration and respects user pause and host/session changes', async () => {
  const h = await heartbeat({ initiallyHost: false })
  h.time.advance(10000); assert.equal(h.sent.length, 0)
  h.host.current = true
  h.element.currentTime = 999; h.time.advance(2000)
  h.suppression.current = true; h.element.currentTime = 0; h.element.paused = true
  h.time.advance(10000)
  assert.equal(h.sent.at(-1)[1].currentTime, 1000)
  h.pauseIntent(); h.time.advance(2000)
  assert.equal(h.sent.at(-1)[1].isPlaying, false)
  h.store.roomId = 'other-room'
  const count = h.sent.length; h.time.advance(10000)
  assert.equal(h.sent.length, count)
  h.dispose()
})

test('full sync and state requests sanitize local proxy capabilities and retain stable state during recovery', async () => {
  const heartbeatHost = await heartbeat({ suppressed: true })
  const { time, element, store, stablePlaybackRef } = heartbeatHost
  const sent = [], effects = [], listeners = new Map()
  const socket = {
    emit: (...args) => sent.push(args),
    on: (event, fn) => listeners.set(event, fn),
    off: event => listeners.delete(event),
  }
  const cli = await load('../src/upstream/modules/bilibili/cliApi.ts', {
    './bilibiliApi': { getBilibiliVideoView: async () => assert.fail('unexpected detail request') },
    '../../../platform/connectionTransport': { logicalConnectionUrl },
    '../../../platform/bilibiliProxy': { embeddedBilibiliProxy: {}, getEmbeddedProxyStatus: () => ({}), isEmbeddedBilibiliHost: () => true },
    './nativeQualityPolicy': { getWebViewCapabilities: () => ({}) },
    '../player/codec-capability': { assertVideoCodecSupported() {} },
  })
  const host = { current: true }, suppression = { current: true }
  const local = upstream => `http://127.0.0.1:9221/fixture-capability/proxy?url=${encodeURIComponent(upstream)}`
  store.watchTogether.sourceUrl = local('https://cdn.example/renewed-video.m4s')
  store.watchTogether.audioUrl = local('https://cdn.example/renewed-audio.m4s')
  store.watchTogether.currentQn = 64
  element.currentTime = 0; element.paused = true
  const api = await load('../src/upstream/modules/sync-playback/hooks/useHostBroadcast.ts', {
    react: { useCallback: fn => fn, useRef: current => ({ current }) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '@/store/roomStore': { useRoomStore: { getState: () => store } },
    '@/modules/bilibili/parseOptions': { getBilibiliParseOptions: () => ({ cliEnabled: true }) },
    '@/modules/bilibili/cliApi': { unwrapCliProxyUrl: cli.unwrapCliProxyUrl },
    './useHostHeartbeat': { readHostPlaybackSnapshot: heartbeatHost.api.readHostPlaybackSnapshot },
    '../constants': { SOCKET_EVENT: { STATE: 'state', CONTROL: 'control' } },
    '../services': stateServices,
  }, time)
  const broadcast = api.useHostBroadcast({ roomId: store.roomId, isHostRef: host, videoRef: { current: element }, suppressEventsRef: suppression, stablePlaybackRef })
  broadcast.forceSync()
  assert.equal(sent[0][1].state.sourceUrl, 'https://cdn.example/renewed-video.m4s')
  assert.equal(sent[0][1].state.audioUrl, 'https://cdn.example/renewed-audio.m4s')
  assert.equal(sent[0][1].state.currentTime, 100)
  assert.equal(sent[0][1].state.isPlaying, true)
  assert.equal(sent[0][1].state.currentQn, 64)
  assert.equal(JSON.stringify(sent).includes('fixture-capability'), false)
  const request = await load('../src/upstream/modules/sync-playback/hooks/useHostStateRequest.ts', {
    react: { useEffect: fn => effects.push(fn) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '../constants': { SOCKET_EVENT: { REQUEST_STATE: 'request-state' } },
  })
  request.useHostStateRequest({ roomId: store.roomId, isHostRef: host, videoRef: { current: element }, forceSync: broadcast.forceSync })
  const cleanup = effects.map(fn => fn()).filter(Boolean)
  listeners.get('request-state')()
  assert.equal(sent[1][1].state.currentTime, 100)
  assert.equal(sent[1][1].seq, 2)
  suppression.current = false; element.currentTime = 115; element.paused = false
  broadcast.forceSync()
  assert.equal(sent[2][1].state.currentTime, 115)
  assert.equal(sent[2][1].state.isPlaying, true)
  host.current = false; listeners.get('request-state')()
  assert.equal(sent.length, 3)
  cleanup.forEach(fn => fn()); assert.equal(listeners.size, 0)
  heartbeatHost.dispose()
})

test('paused recovery freezes one valid clock for heartbeats, force sync and new-viewer requests', async () => {
  const h = await heartbeat(), sent = [], effects = [], listeners = new Map()
  const socket = {
    emit: (...args) => sent.push(args),
    on: (event, fn) => listeners.set(event, fn),
    off: event => listeners.delete(event),
  }
  const api = await load('../src/upstream/modules/sync-playback/hooks/useHostBroadcast.ts', {
    react: { useCallback: fn => fn, useRef: current => ({ current }) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '@/store/roomStore': { useRoomStore: { getState: () => h.store } },
    '@/modules/bilibili/parseOptions': { getBilibiliParseOptions: () => ({ cliEnabled: true }) },
    '@/modules/bilibili/cliApi': { unwrapCliProxyUrl: value => value },
    './useHostHeartbeat': { readHostPlaybackSnapshot: h.api.readHostPlaybackSnapshot },
    '../constants': { SOCKET_EVENT: { STATE: 'state', CONTROL: 'control' } },
    '../services': stateServices,
  }, h.time)
  const broadcast = api.useHostBroadcast({
    roomId: h.store.roomId, isHostRef: h.host, videoRef: { current: h.element },
    suppressEventsRef: h.suppression, stablePlaybackRef: h.stablePlaybackRef,
  })
  const request = await load('../src/upstream/modules/sync-playback/hooks/useHostStateRequest.ts', {
    react: { useEffect: fn => effects.push(fn) },
    '@/hooks/useSocket': { useSocket: () => ({ socket }) },
    '../constants': { SOCKET_EVENT: { REQUEST_STATE: 'request-state' } },
  })
  request.useHostStateRequest({ roomId: h.store.roomId, isHostRef: h.host, videoRef: { current: h.element }, forceSync: broadcast.forceSync })
  const cleanup = effects.map(fn => fn()).filter(Boolean)
  h.suppression.current = true
  h.element.currentTime = 0; h.element.paused = true
  h.time.advance(6000)
  assert.equal(h.sent.at(-1)[1].currentTime, 106)
  h.time.advance(500)
  h.pauseIntent()
  h.element.dispatchEvent(new Event('pause'))
  h.time.advance(10000)
  assert.equal(h.sent.at(-1)[1].currentTime, 106.5)
  assert.equal(h.sent.at(-1)[1].isPlaying, false)
  broadcast.forceSync()
  assert.equal(sent.at(-1)[1].state.currentTime, 106.5)
  assert.equal(sent.at(-1)[1].state.isPlaying, false)
  h.time.advance(10000); listeners.get('request-state')()
  assert.equal(sent.at(-1)[1].state.currentTime, 106.5)
  assert.equal(sent.at(-1)[1].state.isPlaying, false)
  // Successful recovery commits an authoritative final position before its callback.
  h.store.watchTogether = { ...h.store.watchTogether, currentTime: 101, isPlaying: false }
  broadcast.forceSync()
  assert.equal(sent.at(-1)[1].state.currentTime, 101)
  assert.equal(sent.at(-1)[1].state.isPlaying, false)
  cleanup.forEach(fn => fn()); h.dispose()
})

async function stall({ recover } = {}) {
  const time = clock(), element = video(), calls = [], errors = []
  const state = { key: 'room-session/movie/cid', eligible: true }
  const api = await load('../src/upstream/modules/sync-playback/services/native-stall-recovery.ts', {}, time)
  const dispose = api.attachNativeStallRecovery({
    video: element, read: () => state,
    recover: async error => { calls.push(error.message); return recover?.() },
    onError: error => errors.push(error.message),
  })
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  return { time, element, state, calls, errors, dispose, flush }
}

test('a silent stall recovers once, and real progress re-arms recovery for independent interruptions', async () => {
  const h = await stall()
  h.time.advance(19000); await h.flush(); assert.equal(h.calls.length, 0)
  h.time.advance(1000); await h.flush(); assert.equal(h.calls.length, 1)
  h.time.advance(120000); await h.flush(); assert.equal(h.calls.length, 1)
  h.element.currentTime += 1
  h.time.advance(1000); await h.flush()
  h.time.advance(20000); await h.flush(); assert.equal(h.calls.length, 2)
  h.dispose()
})

for (const property of ['paused', 'ended', 'seeking', 'isConnected']) {
  test(`the native stall watchdog does not recover while ${property} forbids playback`, async () => {
    const h = await stall()
    h.element[property] = property !== 'isConnected'
    h.time.advance(60000); await h.flush(); assert.equal(h.calls.length, 0)
    h.element[property] = property === 'isConnected'
    h.time.advance(19000); await h.flush(); assert.equal(h.calls.length, 0)
    h.time.advance(1000); await h.flush(); assert.equal(h.calls.length, 1)
    h.dispose()
  })
}

test('decoded frame progress and suppressed/ineligible states prevent silent-stall recovery', async () => {
  const h = await stall()
  for (let i = 0; i < 5; i++) {
    h.element.decodedFrames += 1
    h.time.advance(10000); await h.flush()
  }
  assert.equal(h.calls.length, 0)
  h.state.eligible = false
  h.time.advance(60000); await h.flush(); assert.equal(h.calls.length, 0)
  h.state.eligible = true
  h.time.advance(20000); await h.flush(); assert.equal(h.calls.length, 1)
  h.dispose()
})

test('a pending or failed recovery is not repeated, and late errors after leaving cannot surface', async () => {
  let reject
  const h = await stall({ recover: () => new Promise((resolve, fail) => { reject = fail }) })
  h.time.advance(20000); await h.flush(); assert.equal(h.calls.length, 1)
  h.time.advance(120000); await h.flush(); assert.equal(h.calls.length, 1)
  h.state.key = 'another-room'
  reject(new Error('obsolete failure')); await h.flush()
  assert.deepEqual(h.errors, [])
  h.dispose(); h.time.advance(120000); await h.flush()
  assert.equal(h.calls.length, 1)
  const failed = await stall({ recover: async () => { throw new Error('recovery failed') } })
  failed.time.advance(20000); await failed.flush()
  assert.deepEqual(failed.errors, ['recovery failed'])
  failed.time.advance(120000); await failed.flush()
  assert.equal(failed.calls.length, 1)
  failed.dispose()
})

const coreSource = await readFile(new URL('../src/upstream/modules/room/watch-together/WatchTogetherCore.tsx', import.meta.url), 'utf8')
const coreAst = parse(coreSource, { sourceType: 'module', plugins: ['typescript', 'jsx'] })

function findNode(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!child || typeof child !== 'object' || !('type' in child)) continue
      const found = findNode(child, predicate)
      if (found) return found
    }
  }
  return null
}

// Run the production command callbacks without rendering unrelated player UI.
async function coreCommand(name, {
  host = true, offline = false, autoApprove = true, element = video(), store = room(),
  suppression = { current: false }, playing = !element.paused, forceSync = () => {},
} = {}) {
  const emitted = [], requested = []
  if (!element.pause) element.pause = () => { element.paused = true }
  if (!element.play) element.play = async () => { element.paused = false }
  let displayedPlaying = playing
  let selected
  if (name === 'system') {
    const call = findNode(coreAst, node => node.type === 'CallExpression' && node.callee.name === 'useSystemMediaSession')
    const method = call.arguments[0].properties.find(node => node.key?.name === 'onAction')
    selected = `({${coreSource.slice(method.start, method.end)}}).onAction`
  } else if (name === 'playback-state') {
    const effect = findNode(coreAst, node => node.type === 'CallExpression' && node.callee.name === 'useEffect' &&
      coreSource.slice(node.arguments[0].start, node.arguments[0].end).includes('const update = () => setIsPlaying'))
    assert.ok(effect, 'playback display effect')
    selected = coreSource.slice(effect.arguments[0].start, effect.arguments[0].end)
  } else {
    const declaration = findNode(coreAst, node => node.type === 'VariableDeclarator' && node.id.name === name)
    assert.ok(declaration, name)
    const callback = declaration.init.type === 'CallExpression' ? declaration.init.arguments[0] : declaration.init
    selected = coreSource.slice(callback.start, callback.end)
  }
  const globals = {
    console, video: element, videoRef: { current: element }, isHost: host, hostOffline: offline,
    autoApproveRef: { current: autoApprove }, markUserPaused, clearUserPaused, wasUserPaused,
    isPlaying: playing, setIsPlaying(value) { displayedPlaying = value },
    suppressEventsRef: suppression, useRoomStore: { getState: () => store },
    forceSync,
    roomId: 'fixture-room',
    socket: { emit: (...args) => emitted.push(args) },
    pauseRequest: { viewerSocketIds: ['viewer'] }, playRequest: { viewerSocketIds: ['viewer'] },
    pausePendingRef: { current: true }, playPendingRef: { current: true },
    pausePendingTimeoutRef: { current: null }, playPendingTimeoutRef: { current: null },
    setPausePending() {}, setPlayPending() {}, setPauseRequest() {}, setPlayRequest() {},
    addPlayerNotice() {}, clearTimeout() {},
    handleRequestPause: () => requested.push('pause'), handleRequestPlay: () => requested.push('play'),
    handleRequestSeek: () => requested.push('seek'),
  }
  const context = createContext(globals)
  const module = new SourceTextModule(stripTypeScriptTypes(`export const command = (${selected})`), { context })
  await module.link(() => assert.fail('command must have no runtime imports'))
  await module.evaluate()
  return {
    element, emitted, requested, command: module.namespace.command,
    get displayedPlaying() { return displayedPlaying },
    rerender() { context.isPlaying = displayedPlaying },
  }
}

const controlsSource = await readFile(new URL('../src/upstream/modules/room/watch-together/PlayerControlBar.tsx', import.meta.url), 'utf8')
const controlsAst = parse(controlsSource, { sourceType: 'module', plugins: ['typescript', 'jsx'] })

async function playPauseButton({ element, togglePlayback, playing, canControl = true }) {
  const declaration = findNode(controlsAst, node => node.type === 'VariableDeclarator' && node.id.name === 'handlePlayPauseClick')
  const callback = declaration.init.arguments[0]
  const button = findNode(controlsAst, node => node.type === 'JSXOpeningElement' &&
    node.attributes.some(attribute => attribute.name?.name === 'onClick' && attribute.value?.expression?.name === 'handlePlayPauseClick'))
  const label = button.attributes.find(attribute => attribute.name?.name === 'label').value.expression
  const context = createContext({
    videoRef: { current: element }, canControl, isPlaying: playing, onTogglePlayback: togglePlayback,
    onRequestPause() {}, onRequestPlay() {},
  })
  const module = new SourceTextModule(stripTypeScriptTypes(
    `export const click = (${controlsSource.slice(callback.start, callback.end)}); export const label = () => (${controlsSource.slice(label.start, label.end)});`
  ), { context })
  await module.link(() => assert.fail('button callback must have no runtime imports'))
  await module.evaluate()
  return { ...module.namespace, rerender(value) { context.isPlaying = value } }
}

test('the actual pause button pauses already-paused recovery media, keeps repeated pause idempotent, then offers explicit play', async () => {
  const h = await heartbeat()
  h.suppression.current = true
  h.element.currentTime = 0; h.element.paused = true; h.element.readyState = 0
  let pauseEvents = 0, playCalls = 0
  h.element.addEventListener('pause', () => pauseEvents++)
  h.element.pause = () => {
    if (h.element.paused) return
    h.element.paused = true
    h.element.dispatchEvent(new Event('pause'))
  }
  h.element.play = async () => { playCalls++ }
  const display = await coreCommand('playback-state', {
    element: h.element, store: h.store, suppression: h.suppression, playing: false,
  })
  const cleanup = display.command()
  assert.equal(display.displayedPlaying, true, 'recovery pause keeps the room playing intent visible')
  const toggle = await coreCommand('handleTogglePlayback', {
    element: h.element, store: h.store, suppression: h.suppression, playing: display.displayedPlaying,
    forceSync: () => broadcast.forceSync(),
  })
  const fullStates = []
  const broadcastApi = await load('../src/upstream/modules/sync-playback/hooks/useHostBroadcast.ts', {
    react: { useCallback: fn => fn, useRef: current => ({ current }) },
    '@/hooks/useSocket': { useSocket: () => ({ socket: { emit: (...args) => fullStates.push(args) } }) },
    '@/store/roomStore': { useRoomStore: { getState: () => h.store } },
    '@/modules/bilibili/parseOptions': { getBilibiliParseOptions: () => ({ cliEnabled: true }) },
    '@/modules/bilibili/cliApi': { unwrapCliProxyUrl: value => value },
    './useHostHeartbeat': { readHostPlaybackSnapshot: h.api.readHostPlaybackSnapshot },
    '../constants': { SOCKET_EVENT: { STATE: 'state', CONTROL: 'control' } },
    '../services': stateServices,
  }, h.time)
  const broadcast = broadcastApi.useHostBroadcast({
    roomId: h.store.roomId, isHostRef: h.host, videoRef: { current: h.element },
    suppressEventsRef: h.suppression, stablePlaybackRef: h.stablePlaybackRef,
  })
  const button = await playPauseButton({ element: h.element, togglePlayback: toggle.command, playing: true })
  assert.equal(button.label(), '暂停')
  h.time.advance(4000)
  button.click(); button.click()
  assert.equal(playCalls, 0, 'repeated pause callbacks cannot become an implicit play')
  assert.equal(pauseEvents, 0, 'already-paused, readyState=0 media emits no pause event')
  assert.equal(wasUserPaused(h.element), true)
  assert.equal(toggle.displayedPlaying, false)
  assert.equal(fullStates.length, 2, 'each explicit recovery action publishes its intent without waiting for a media event')
  assert.equal(fullStates.at(-1)[1].state.currentTime, 104)
  assert.equal(fullStates.at(-1)[1].state.isPlaying, false, 'manual full sync immediately honors the real button pause')
  toggle.rerender(); button.rerender(toggle.displayedPlaying)
  assert.equal(button.label(), '播放', 'an explicit command updates the visible action without a media event')
  h.time.advance(2000)
  const pausedTime = h.sent.at(-1)[1].currentTime
  assert.equal(h.sent.at(-1)[1].isPlaying, false)
  assert.equal(pausedTime, 104)
  h.time.advance(6000)
  assert.equal(h.sent.at(-1)[1].currentTime, pausedTime)
  button.click()
  assert.equal(wasUserPaused(h.element), false)
  assert.equal(playCalls, 1, 'the subsequent displayed play action explicitly resumes playback')
  assert.equal(toggle.displayedPlaying, true)
  assert.equal(fullStates.at(-1)[1].state.isPlaying, true, 'the actual displayed play action immediately broadcasts its intent')
  toggle.rerender(); button.rerender(toggle.displayedPlaying)
  assert.equal(button.label(), '暂停')
  h.time.advance(4000)
  assert.equal(h.sent.at(-1)[1].isPlaying, true)
  assert.ok(h.sent.at(-1)[1].currentTime > pausedTime)
  cleanup(); h.dispose()
})

test('center double tap delegates to the same displayed playback action during recovery', async () => {
  const element = video(), effects = []
  element.paused = true; element.readyState = 0
  const store = room(), suppression = { current: true }
  const toggle = await coreCommand('handleTogglePlayback', { element, store, suppression, playing: true })
  let handlers
  const gestures = await load('../src/upstream/modules/room/watch-together/useWatchGestures.ts', {
    react: { useEffect: fn => effects.push(fn), useLayoutEffect() {}, useRef: current => ({ current }) },
    '@/lib/utils': { formatDuration: value => String(value) },
    '../../../../platform/runtime': { isGlobalAppearanceRuntime: () => true },
    '../../../../mobile/watchVideoGestures': { attachWatchVideoGestures(stage, callbacks) {
      handlers = callbacks; const remove = () => {}; remove.cancel = () => {}; return remove
    } },
    '../../../../mobile/playerBrightness': { createBrightnessGesture: () => ({ dispose() {} }) },
  })
  gestures.useWatchGestures({
    art: { notice: {}, template: {} }, video: element, stage: { current: {} }, mediaKey: 'fixture',
    canControl: true, isPlaying: true, togglePlayback: toggle.command,
    toggleControls() {}, requestPlay() {}, requestPause() {}, requestSeek() {},
  })
  const cleanup = effects.map(fn => fn()).filter(Boolean)
  handlers.onDoubleTap(0)
  assert.equal(wasUserPaused(element), true)
  assert.equal(toggle.displayedPlaying, false)
  toggle.rerender()
  handlers.onDoubleTap(0)
  assert.equal(wasUserPaused(element), false)
  assert.equal(toggle.displayedPlaying, true)
  cleanup.forEach(fn => fn())
})

test('system play/pause/stop commands update pause intent, while an engine pause alone does not', async () => {
  const h = await coreCommand('system')
  h.element.pause()
  assert.equal(wasUserPaused(h.element), false, 'engine pauses cannot invent user intent')
  for (const action of ['pause', 'stop']) {
    h.command(action)
    assert.equal(wasUserPaused(h.element), true)
    h.command('play')
    assert.equal(wasUserPaused(h.element), false)
    assert.equal(h.element.paused, false)
  }
})

test('online viewers route system commands through approval without changing local pause intent', async () => {
  const h = await coreCommand('system', { host: false })
  h.command('pause'); h.command('play')
  assert.deepEqual(h.requested, ['pause', 'play'])
  assert.equal(wasUserPaused(h.element), false)
  const autonomous = await coreCommand('system', { host: false, offline: true })
  autonomous.command('pause')
  assert.equal(wasUserPaused(autonomous.element), true)
  autonomous.command('play')
  assert.equal(wasUserPaused(autonomous.element), false)
})

for (const [pause, play] of [
  ['handlePauseRequest', 'handlePlayRequest'],
  ['handleAcceptPause', 'handleAcceptPlay'],
  ['handlePauseResponse', 'handlePlayResponse'],
]) {
  test(`approved controls preserve pause intent even if media state already matches (${pause})`, async () => {
    const p = await coreCommand(pause)
    p.element.paused = true
    p.command({ viewerSocketId: 'viewer', accept: true })
    assert.equal(wasUserPaused(p.element), true, 'already-paused recovery media must still record the command')
    const r = await coreCommand(play)
    markUserPaused(r.element); r.element.paused = false
    r.command({ viewerSocketId: 'viewer', accept: true })
    assert.equal(wasUserPaused(r.element), false, 'already-playing media must clear a previous pause command')
  })
}

test('unapproved requests and rejected responses cannot change user playback intent', async () => {
  const pending = await coreCommand('handlePauseRequest', { autoApprove: false })
  pending.command({ viewerSocketId: 'viewer' })
  assert.equal(wasUserPaused(pending.element), false)
  const rejected = await coreCommand('handlePauseResponse')
  rejected.command({ accept: false })
  assert.equal(wasUserPaused(rejected.element), false)
  const playRejected = await coreCommand('handlePlayResponse')
  markUserPaused(playRejected.element)
  playRejected.command({ accept: false })
  assert.equal(wasUserPaused(playRejected.element), true)
})
