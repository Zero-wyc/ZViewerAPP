import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { transformSync } from 'rolldown/experimental'

function fixture(withHandlers = true) {
  const source = readFileSync(new URL('../src/upstream/modules/player/engines/flv-engine.ts', import.meta.url), 'utf8')
  const code = stripTypeScriptTypes(source)
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replace('export const flvEngine', 'const flvEngine')
  let now = 0, timerId = 0
  const timers = new Map(), listeners = new Map(), videoListeners = new Map()
  const setTimeout = (callback, delay) => {
    const id = ++timerId
    timers.set(id, { callback, at: now + delay })
    return id
  }
  const clearTimeout = id => timers.delete(id)
  const video = {
    readyState: 0,
    error: null,
    addEventListener(event, listener) {
      if (!videoListeners.has(event)) videoListeners.set(event, new Set())
      videoListeners.get(event).add(listener)
    },
    removeEventListener: (event, listener) => videoListeners.get(event)?.delete(listener),
  }
  const counts = { unload: 0, load: 0, play: 0, pause: 0, destroy: 0, ready: 0, exhausted: 0, ended: 0 }
  const retries = []
  let loadAction = () => {}
  const player = {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(listener)
    },
    unload: () => counts.unload++,
    load: () => { counts.load++; loadAction() },
    play: () => { counts.play++; return Promise.resolve() },
    pause: () => counts.pause++,
    attachMediaElement: () => {}, detachMediaElement: () => {}, destroy: () => counts.destroy++,
  }
  const events = {
    onRetrying: (attempt, max) => retries.push({ attempt, max, at: now }),
    onReady: () => counts.ready++, onExhausted: () => counts.exhausted++, onStreamEnd: () => counts.ended++,
  }
  const flvjs = {
    Events: { ERROR: 'error', MEDIA_INFO: 'media-info', STATISTICS_INFO: 'statistics', LOADING_COMPLETE: 'loading-complete' },
    isSupported: () => true, createPlayer: () => player,
  }
  const utils = stripTypeScriptTypes(readFileSync(new URL('../src/upstream/modules/player/utils.ts', import.meta.url), 'utf8'))
    .replace(/\bexport (?=(?:async )?function|let|const)/g, '')
  let metadataWaits = 0
  const waitForMetadata = new Function(
    'setTimeout', 'clearTimeout', 'DOMException', `${utils}\nreturn waitForMetadata`
  )(setTimeout, clearTimeout, DOMException)
  const engine = new Function(
    'flvjs', 'resetVideoElement', 'waitForMetadata', 'resolveProxyUrl', 'setTimeout', 'clearTimeout', 'console',
    `${code}\nreturn { flvEngine, attachLiveHandlers }`
  )(flvjs, () => {}, (...args) => {
    metadataWaits++
    return waitForMetadata(...args)
  }, url => url, setTimeout, clearTimeout, { log() {}, warn() {} })
  const dispose = withHandlers ? engine.attachLiveHandlers(video, player, events) : () => {}
  const emit = (event, ...args) => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(...args)
  }
  return {
    ...engine, video, events, counts, retries, listeners, dispose, emit,
    emitVideo: event => { for (const listener of [...(videoListeners.get(event) ?? [])]) listener() },
    metadataWaits: () => metadataWaits,
    videoListenerCount: () => [...videoListeners.values()].reduce((count, handlers) => count + handlers.size, 0),
    now: () => now, pending: () => timers.size,
    nextDelay: () => Math.min(...[...timers.values()].map(timer => timer.at - now)),
    onLoad: action => { loadAction = action },
    advance: elapsed => {
      const target = now + elapsed
      while (timers.size) {
        const [id, timer] = [...timers].sort(([, a], [, b]) => a.at - b.at)[0]
        if (timer.at > target) break
        now = timer.at
        timers.delete(id)
        timer.callback()
      }
      now = target
    },
  }
}

test('normal live completion reconnects while the viewer remains mounted', () => {
  const f = fixture()
  f.onLoad(() => f.emit('media-info'))
  f.emit('loading-complete')
  assert.equal(f.counts.ended, 1)
  assert.equal(f.nextDelay(), 1000)
  f.advance(1000)
  assert.equal(f.counts.load, 1)
  assert.equal(f.counts.play, 1)
  assert.equal(f.counts.ready, 1)
  assert.equal(f.pending(), 0)
  f.dispose()
})

for (const failure of ['error', 'loading-complete']) {
  test(`${failure} keeps retrying beyond five attempts and resumes at 50 seconds`, () => {
    const f = fixture()
    f.onLoad(() => {
      if (f.now() >= 50000) f.emit('media-info')
      else f.emit(failure, 'network', 'unavailable')
    })
    f.emit(failure, 'network', 'unavailable')
    f.advance(49000)
    assert.equal(f.counts.load, 6)
    assert.equal(f.counts.ready, 0)
    assert.equal(f.nextDelay(), 2000)
    f.advance(2000)
    assert.equal(f.counts.load, 7)
    assert.equal(f.counts.ready, 1)
    assert.equal(f.counts.exhausted, 0)
    assert.equal(f.pending(), 0)
    f.dispose()
  })
}

test('overlapping errors and completion share one reconnect timer', () => {
  const f = fixture()
  f.emit('error', 'network', 'lost')
  f.advance(500)
  f.emit('loading-complete')
  f.emit('error', 'network', 'lost')
  assert.equal(f.retries.length, 1)
  assert.equal(f.nextDelay(), 500)
  f.advance(500)
  assert.equal(f.counts.load, 1)
  f.dispose()
})

test('readiness cancels a pending retry and restores the fast retry interval', () => {
  const f = fixture()
  f.emit('error', 'network', 'lost')
  f.advance(1000)
  f.emit('error', 'network', 'lost')
  assert.equal(f.nextDelay(), 2000)
  f.emit('media-info')
  f.advance(10000)
  assert.equal(f.counts.load, 1)
  f.emit('error', 'network', 'lost')
  assert.equal(f.nextDelay(), 1000)
  assert.equal(f.retries.at(-1).attempt, 1)
  f.dispose()
})

test('a synchronous reconnect failure schedules a later attempt', () => {
  const f = fixture()
  f.onLoad(() => { throw new Error('temporary FLV load failure') })
  f.emit('loading-complete')
  f.advance(1000)
  assert.equal(f.counts.load, 1)
  assert.equal(f.nextDelay(), 2000)
  f.dispose()
  f.advance(60000)
  assert.equal(f.counts.load, 1)
})

test('unmount destroys the engine and cancels all later recovery', async () => {
  const f = fixture(false)
  const attached = await f.flvEngine.attach(f.video, {
    url: 'http://fixture.invalid/live/test.flv', isLive: true, flvRuntimeEvents: f.events,
  })
  f.emit('loading-complete')
  assert.equal(f.pending(), 1)
  attached.cleanup()
  attached.cleanup()
  f.emit('error', 'network', 'late failure')
  f.emit('loading-complete')
  f.advance(120000)
  assert.equal(f.pending(), 0)
  assert.equal(f.counts.load, 1)
  assert.equal(f.counts.destroy, 1)
})

test('on-demand FLV sources keep their existing lifecycle without live retries', async () => {
  const f = fixture(false)
  f.video.readyState = 1
  const attached = await f.flvEngine.attach(f.video, { url: 'http://fixture.invalid/movie.flv' })
  assert.equal(f.listeners.size, 0)
  f.emit('error', 'network', 'lost')
  f.emit('loading-complete')
  f.advance(120000)
  assert.equal(f.counts.load, 1)
  assert.equal(f.pending(), 0)
  attached.cleanup()
  assert.equal(f.counts.destroy, 1)
})

test('a cold live attach exposes cleanup immediately and still recovers after 50 seconds without metadata', async () => {
  const f = fixture(false)
  const controller = new AbortController()
  f.onLoad(() => {
    if (f.now() < 50000) f.emit('error', 'network', 'publisher not ready')
    else {
      f.video.readyState = 1
      f.emitVideo('loadedmetadata')
      f.emit('media-info')
    }
  })
  const attached = await f.flvEngine.attach(f.video, {
    url: 'http://fixture.invalid/live/test.flv', isLive: true,
    signal: controller.signal, flvRuntimeEvents: f.events,
  })
  assert.equal(typeof attached.cleanup, 'function')
  assert.equal(f.metadataWaits(), 0, 'live readiness must not acquire the VOD metadata timeout')
  f.advance(49000)
  assert.equal(f.video.readyState, 0)
  assert.equal(f.counts.ready, 0)
  assert.equal(f.counts.destroy, 0)
  assert.equal(f.counts.load, 7)
  assert.equal(f.pending(), 1)
  f.advance(2000)
  assert.equal(f.counts.load, 8)
  assert.equal(f.counts.ready, 2)
  assert.equal(f.video.readyState, 1)
  assert.equal(f.counts.destroy, 0)
  assert.equal(f.pending(), 0)
  attached.cleanup()
  controller.abort()
  assert.equal(f.counts.destroy, 1)
  assert.equal(f.videoListenerCount(), 0)
})

for (const cancellation of ['abort', 'cleanup']) {
  test(`${cancellation} destroys a live cold attach before metadata and clears every retry`, async () => {
    const f = fixture(false)
    const controller = new AbortController()
    f.onLoad(() => f.emit('error', 'network', 'publisher not ready'))
    const attached = await f.flvEngine.attach(f.video, {
      url: 'http://fixture.invalid/live/test.flv', isLive: true,
      signal: controller.signal, flvRuntimeEvents: f.events,
    })
    f.advance(30000)
    const attempts = f.counts.load
    assert.equal(f.video.readyState, 0)
    assert.equal(f.pending(), 1)
    if (cancellation === 'abort') controller.abort()
    else attached.cleanup()
    assert.equal(f.pending(), 0)
    assert.equal(f.videoListenerCount(), 0)
    f.advance(120000)
    f.emit('loading-complete')
    f.emit('error', 'network', 'late failure')
    f.emitVideo('loadedmetadata')
    assert.equal(f.counts.load, attempts)
    assert.equal(f.counts.destroy, 1)
    assert.equal(f.counts.ready, 0)
    attached.cleanup()
    assert.equal(f.counts.destroy, 1)
  })
}

test('on-demand FLV still times out and cleans up when metadata never arrives', async () => {
  const f = fixture(false)
  const attaching = f.flvEngine.attach(f.video, { url: 'http://fixture.invalid/movie.flv' })
  const rejected = assert.rejects(attaching, /metadata.*30s/)
  assert.equal(f.metadataWaits(), 1)
  f.advance(30000)
  await rejected
  assert.equal(f.counts.destroy, 1)
  assert.equal(f.pending(), 0)
  assert.equal(f.videoListenerCount(), 0)
})

function componentFixture(readyState = 0) {
  const states = [], refs = [], effects = [], timers = new Map(), statuses = []
  const video = Object.assign(new EventTarget(), {
    readyState, paused: true, muted: true, playCount: 0,
    play() { video.playCount++; return Promise.resolve() },
  })
  let runtime, cleanupCount = 0
  const bindings = {
    useState: initial => {
      const index = states.length
      states.push(initial)
      return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
    useRef: current => { const ref = { current }; refs.push(ref); return ref },
    useCallback: fn => fn,
    useEffect: fn => effects.push(fn),
    Artplayer: class {
      video = video
      loading = { show: false }
      destroy() {}
    },
    configureArtStatics() {},
    usePlayerSource: () => ({
      attachSource: async (_video, source) => { runtime = source.flvRuntimeEvents },
      cleanup: () => { cleanupCount++ },
    }),
    useScreenShareDisplay: () => ({ controlBarVisible: true, gestureNotice: null }),
    onFullscreenChange: () => () => {},
    getFullscreenElement: () => null,
    cn: (...values) => values.join(' '),
    setTimeout: fn => { const id = Symbol(); timers.set(id, fn); return id },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { const id = Symbol(); timers.set(id, fn); return id },
    clearInterval: id => timers.delete(id),
    _jsx: (type, props) => ({ type, props }),
    _jsxs: (type, props) => ({ type, props }),
    console: { log() {}, warn() {}, error() {} },
  }
  for (const name of ['Pause', 'Play', 'RefreshCw', 'Volume2', 'VolumeX', 'Spinner', 'Tag', 'IconButton',
    'PlayerDisplayControls', 'PlayerGestureNotice', 'isIOSDevice', 'supportsContainerFullscreen',
    'exitFullscreen', 'requestFullscreen']) bindings[name] = () => null
  const compiled = transformSync('FlvPlayer.tsx', readFileSync(
    new URL('../src/upstream/modules/screen-sharing/components/FlvPlayer.tsx', import.meta.url), 'utf8'),
  { lang: 'tsx', target: 'es2022', jsx: { runtime: 'automatic' } }).code
    .replace(/^import[\s\S]*?from ["'][^"']+["'];?\r?\n/gm, '')
    .replace(/^import ["'][^"']+["'];?\r?\n/gm, '')
    .replace('export function FlvPlayer', 'function FlvPlayer')
  const component = new Function(...Object.keys(bindings), `${compiled}\nreturn FlvPlayer`)(...Object.values(bindings))
  component({ src: 'http://fixture.invalid/live/test.flv', onStatusChange: value => statuses.push(value) })
  refs[0].current = {}
  refs[1].current = {}
  const cleanups = effects.map(fn => fn()).filter(Boolean)
  return {
    video, statuses, timers, runtime: () => runtime,
    loading: () => states[0], streamStatus: () => states[6], cleanups: () => cleanupCount,
    dispose: () => cleanups.forEach(fn => fn()),
  }
}

test('the actual FLV component keeps a cold live attach connecting until runtime readiness', async () => {
  const f = componentFixture()
  await Promise.resolve()
  assert.equal(f.loading(), true)
  assert.equal(f.streamStatus(), 'connecting')
  assert.equal(f.statuses.includes('playing'), false)
  assert.equal(f.video.playCount, 1, 'autoplay may wait for the first live media packet')
  f.runtime().onRetrying(7, Number.POSITIVE_INFINITY)
  assert.equal(f.streamStatus(), 'connecting')
  f.video.readyState = 1
  f.runtime().onReady()
  assert.equal(f.loading(), false)
  assert.equal(f.streamStatus(), 'playing')
  assert.equal(f.statuses.at(-1), 'playing')
  f.dispose()
  assert.equal(f.timers.size, 0)
  assert.equal(f.cleanups(), 1)
})

test('a FLV component unmounted before attach resolves cannot autoplay a retired video', async () => {
  const f = componentFixture()
  f.dispose()
  await Promise.resolve()
  assert.equal(f.video.playCount, 0)
  assert.equal(f.statuses.includes('playing'), false)
  assert.equal(f.timers.size, 0)
  assert.equal(f.cleanups(), 1)
})
