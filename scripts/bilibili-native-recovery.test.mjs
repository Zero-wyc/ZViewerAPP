import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { parse } from '@babel/parser'

const root = new URL('../src/', import.meta.url)
const hookSource = await readFile(new URL('upstream/modules/sync-playback/hooks/useVideoSource.ts', root), 'utf8')
const imports = new Map()
for (const item of parse(hookSource, { sourceType: 'module', plugins: ['typescript'] }).program.body) {
  if (item.type !== 'ImportDeclaration' || item.importKind === 'type') continue
  imports.set(item.source.value, [
    ...(imports.get(item.source.value) ?? []),
    ...item.specifiers.filter(specifier => specifier.importKind !== 'type').map(specifier => specifier.imported?.name ?? 'default'),
  ])
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

function observe(promise) {
  let result
  const settled = promise.then(
    value => { result = { value } },
    error => { result = { error } }
  )
  return { get result() { return result }, settled }
}

async function harness(t, options = {}) {
  let now = 1_000_000
  let timerId = 0
  let server = 'https://server.example'
  let proxy = { sessionVersion: 1, loggedIn: true }
  let resolver = options.resolve
  let reloader = options.reload
  let player = options.play
  let autoProgress = true
  let state
  let completed = 0
  let cleanupCount = 0
  let playCount = 0
  let attachCount = 0
  const timers = new Map()
  const effects = []
  const cleanups = []
  const subscribers = new Set()
  const proxySubscribers = new Set()
  const resolutions = []
  const reloads = []
  const sourceWrites = []
  const overrideWrites = []
  const notices = []
  const host = { current: options.host ?? true }
  class Video extends EventTarget {
    isConnected = true
    currentTime = 900
    playbackRate = 1
    paused = false
    readyState = 4
    seeking = false
    ended = false
    error = null
    muted = false
    volume = 1
    tagName = 'VIDEO'
    currentSrc = 'blob:fixture'
    pause() { this.paused = true }
    play() {
      playCount++
      this.paused = false
      return player?.(playCount, this) ?? Promise.resolve()
    }
  }
  const video = new Video()
  const videos = [video]
  const videoRef = { current: video }
  function schedule(fn, delay = 0, interval = 0) {
    const id = ++timerId
    timers.set(id, { fn, at: now + delay, interval })
    return id
  }
  class Clock extends Date { static now() { return now } }
  const context = createContext({
    URL, DOMException, Error, Event, EventTarget, AbortController, AbortSignal,
    Date: Clock,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms, ...args) => schedule(() => fn(...args), ms),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => schedule(fn, ms, ms),
    clearInterval: id => timers.delete(id),
  })
  const bridge = {
    getEmbeddedProxyStatus: () => proxy,
    subscribeEmbeddedProxy: listener => { proxySubscribers.add(listener); return () => proxySubscribers.delete(listener) },
  }
  const react = {
    useRef: current => ({ current }),
    useCallback: callback => callback,
    useEffect: callback => effects.push(callback),
    useSyncExternalStore() {},
  }
  async function load(path, mocks = {}) {
    const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path, root), 'utf8')), { context })
    await module.link(name => {
      assert.ok(name in mocks, `Unexpected import ${name} in ${path}`)
      const values = mocks[name]
      return new SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value)
      }, { context })
    })
    await module.evaluate()
    return module.namespace
  }
  const safePlay = await load('upstream/modules/sync-playback/safePlay.ts')
  const suppression = await load('upstream/modules/sync-playback/suppression.ts')
  const validity = await load('upstream/modules/bilibili/sourceValidity.ts')
  const abortable = await load('upstream/modules/player/utils/abortable.ts')
  const pause = await load('upstream/modules/player/services/pause-intent.ts')
  const identity = await load('upstream/modules/sync-playback/playbackIdentity.ts')
  const quality = await load('upstream/modules/bilibili/nativeQualityPolicy.ts', {
    react,
    '../../../platform/bilibiliProxy': bridge,
  })
  if (options.manual) quality.selectNativeQuality(1, options.manual)
  function patch(updates) {
    const previous = state
    state = { ...state, ...updates }
    for (const listener of subscribers) listener(state, previous)
  }
  const movie = { id: 1, cid: 123, url: 'BVfixture', sourceType: 'bilibili' }
  state = {
    roomId: 'fixture-room', roomSessionRevision: 1,
    currentMovieId: 1, movies: [movie],
    watchTogether: {
      sourceType: 'bilibili', sourceUrl: 'https://media.example/video.m4s',
      audioUrl: 'https://media.example/audio.m4s', format: 'dash',
      currentQn: 80, cid: 123, currentMovieId: 1,
      isPlaying: true, playbackRate: 1, currentTime: 900,
    },
    viewerCliResolvedSource: null, viewerCliRequiredMovieId: null,
    setWatchTogether(updates) {
      sourceWrites.push({ ...updates })
      patch({ watchTogether: { ...state.watchTogether, ...updates } })
    },
    setViewerCliResolvedSource(value) {
      if (value) overrideWrites.push(value)
      patch({ viewerCliResolvedSource: value ? { ...value, sessionVersion: proxy.sessionVersion } : null })
    },
    setViewerCliRequiredMovieId(value) { patch({ viewerCliRequiredMovieId: value }) },
    setReloadingState() {},
    triggerReloadBilibili() {},
    triggerViewerSourceReload() {},
  }
  const store = {
    getState: () => state,
    subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener) },
  }
  const stubs = {
    ...react, ...bridge, ...safePlay, ...validity, ...abortable, ...pause, ...identity, ...quality,
    useRoomStore: store,
    getApiUrl: () => server,
    getBilibiliParseOptions: () => ({ cliEnabled: true }),
    getActiveCliProxyUrl: () => 'http://127.0.0.1:9000',
    isEmbeddedBilibiliHost: () => true,
    startEmbeddedProxy: async () => proxy,
    getEffectivePreferMp4: () => false,
    buildCliProxyUrl: (base, url) => `${base}/proxy?url=${encodeURIComponent(url)}`,
    isCliProxyUrl: value => /^http:\/\/127\.0\.0\.1:/.test(value),
    message: { info: value => notices.push(value), error: value => notices.push(value) },
    waitForMetadata: async () => {},
    usePlayerSource: () => ({
      attachSource: async (_video, source) => { attachCount++; source.signal?.throwIfAborted() },
      cleanup: () => { cleanupCount++ },
      seekTo: async () => ({ success: true }),
      forceReload: async (target, source) => {
        reloads.push(source)
        target.currentTime = 0
        target.paused = true
        target.error = null
        return reloader?.(reloads.length, target, source)
      },
    }),
    async resolveBilibiliOnline(selectedMovie, _qn, resolveOptions) {
      const policy = quality.getNativeQualityPolicy(selectedMovie.id)
      const call = {
        movie: selectedMovie,
        options: resolveOptions,
        qn: policy.qn ?? policy.fallbackQn ?? 80,
        number: resolutions.length + 1,
      }
      resolutions.push(call)
      const custom = await resolver?.(call)
      return {
        sourceUrl: `https://media.example/video-${call.number}.m4s?deadline=${now / 1000 + 3600}`,
        audioUrl: `https://media.example/audio.m4s?deadline=${now / 1000 + 3600}`,
        format: 'dash', currentQn: call.qn, cid: selectedMovie.cid,
        acceptQuality: [{ id: 80, label: '1080P' }, { id: 64, label: '720P' }, { id: 32, label: '480P' }, { id: 16, label: '360P' }],
        ...custom,
      }
    },
  }
  const hook = new SourceTextModule(stripTypeScriptTypes(hookSource), { context })
  await hook.link(specifier => {
    const names = imports.get(specifier)
    return new SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, stubs[name] ?? (() => {}))
    }, { context })
  })
  await hook.evaluate()
  const suppressEventsRef = suppression.createSuppressRef()
  const api = hook.namespace.useVideoSource({
    videoRef, suppressEventsRef, watchTogether: state.watchTogether, isHostRef: host,
    onNativeRecoveryComplete: () => { completed++ },
  })
  // These scenarios start with an already loaded player.
  api.restoredRef.current = true
  for (const effect of effects) {
    const cleanup = effect()
    if (cleanup) cleanups.push(cleanup)
  }
  await flush()
  t.after(async () => {
    for (const cleanup of cleanups) cleanup()
    await flush()
    timers.clear()
  })
  async function advance(milliseconds) {
    const end = now + milliseconds
    while (true) {
      let id, next
      for (const [candidateId, timer] of timers) {
        if (timer.at <= end && (!next || timer.at < next.at)) {
          id = candidateId
          next = timer
        }
      }
      const at = next?.at ?? end
      for (const media of videos) {
        if (autoProgress && !media.paused && !media.error && media.readyState >= 2) {
          media.currentTime += ((at - now) / 1000) * media.playbackRate
        }
      }
      now = at
      if (!next) break
      if (next.interval) next.at += next.interval
      else timers.delete(id)
      next.fn()
      await flush()
    }
    await flush()
  }
  async function finish(task, maxMs = 65_000) {
    await flush()
    for (let elapsed = 0; !task.result && elapsed < maxMs; elapsed += 250) await advance(250)
    assert.ok(task.result, 'Operation must settle within its deadline')
    await task.settled
    return task.result
  }
  return {
    api, video, videoRef, host, suppressEventsRef, resolutions, reloads,
    sourceWrites, overrideWrites, notices, quality, validity, patch, advance, finish,
    get state() { return state },
    get now() { return now },
    get completed() { return completed },
    get cleanupCount() { return cleanupCount },
    get playCount() { return playCount },
    get attachCount() { return attachCount },
    setResolver(value) { resolver = value },
    setReloader(value) { reloader = value },
    setPlayer(value) { player = value },
    setAutoProgress(value) { autoProgress = value },
    replaceVideo() {
      const replacement = new Video()
      videos.push(replacement)
      videoRef.current = replacement
      return replacement
    },
    setServer(value) { server = value; patch({}) },
    setProxy(updates) {
      proxy = { ...proxy, ...updates }
      for (const listener of proxySubscribers) listener()
    },
    pause() { pause.markUserPaused(video); video.pause() },
    recover() { return observe(api.recoverNativePlayback(new Error('fixture media interruption'))) },
  }
}

test('independent interruptions regain retry budgets only after sustained playback', async t => {
  const h = await harness(t)
  for (let i = 0; i < 6; i++) {
    const outcome = await h.finish(h.recover())
    assert.equal(outcome.error, undefined)
    assert.equal(h.resolutions.length, i + 1)
    assert.equal(h.completed, i + 1)
    assert.equal(h.suppressEventsRef.current, false)
    await h.advance(18_000)
  }
  assert.deepEqual(h.resolutions.map(call => call.qn), [80, 80, 80, 80, 80, 80])
})

test('short successful recoveries retain the four-attempt budget and fallback policy', async t => {
  const h = await harness(t)
  for (let i = 0; i < 4; i++) assert.equal((await h.finish(h.recover())).error, undefined)
  const exhausted = await h.finish(h.recover())
  assert.match(exhausted.error.message, /interruption/)
  assert.equal(h.resolutions.length, 4)
  assert.deepEqual(h.resolutions.map(call => call.qn), [80, 64, 32, 16])
  await h.advance(18_000)
  assert.equal((await h.finish(h.recover())).error, undefined)
  assert.equal(h.resolutions.at(-1).qn, 16, 'Budget reset must preserve the available fallback quality')
})

test('non-progressing metadata or a fulfilled play promise never resets exhausted retries', async t => {
  const h = await harness(t)
  for (let i = 0; i < 4; i++) assert.equal((await h.finish(h.recover())).error, undefined)
  h.setAutoProgress(false)
  await h.advance(30_000)
  assert.ok((await h.finish(h.recover())).error)
  assert.equal(h.resolutions.length, 4)
})

test('manual quality refreshes the address without changing the selected quality', async t => {
  const h = await harness(t, { manual: 80 })
  await h.finish(h.recover())
  await h.finish(h.recover())
  assert.deepEqual(h.resolutions.map(call => call.qn), [80, 80])
  assert.equal(h.quality.getNativeQualityPolicy(1).mode, 'manual')
  assert.equal(h.quality.getNativeQualityPolicy(1).qn, 80)
  assert.ok(h.resolutions.every(call => call.options.forceRefresh && call.options.signal instanceof AbortSignal))
})

for (const stage of ['resolver', 'reload queue', 'play promise', 'decoded progress']) {
  test(`${stage} cannot hold recovery or event suppression beyond the overall deadline`, async t => {
    const pending = deferred()
    const h = await harness(t, {
      resolve: stage === 'resolver' ? () => pending.promise : undefined,
      reload: stage === 'reload queue' ? () => pending.promise : undefined,
      play: stage === 'play promise' ? () => pending.promise : undefined,
    })
    if (stage === 'decoded progress') h.setAutoProgress(false)
    const start = h.now
    const outcome = await h.finish(h.recover())
    assert.ok(outcome.error)
    assert.ok(h.now - start <= 60_000, `Recovery took ${h.now - start}ms`)
    assert.equal(h.suppressEventsRef.current, false)
    assert.equal(h.sourceWrites.length, 0)
    assert.equal(h.completed, 0)
    pending.resolve()
    await flush()
    assert.equal(h.sourceWrites.length, 0, 'A late result cannot publish a timed-out source')
    h.setResolver(undefined)
    h.setReloader(undefined)
    h.setPlayer(undefined)
    h.setAutoProgress(true)
    assert.equal((await h.finish(h.recover())).error, undefined, 'A settled timeout must release the recovery lock')
  })
}

test('persistent immediate failures stop at four attempts without a retry loop', async t => {
  const h = await harness(t, { resolve: async () => { throw Error('fixture CDN unavailable') } })
  const outcome = await h.finish(h.recover())
  assert.match(outcome.error.message, /CDN unavailable/)
  assert.equal(h.resolutions.length, 4)
  assert.equal(h.reloads.length, 0)
  assert.equal(h.suppressEventsRef.current, false)
})

test('a user pause during address resolution is retained after recovery', async t => {
  const gate = deferred()
  const h = await harness(t, { resolve: () => gate.promise })
  const task = h.recover()
  await flush()
  h.pause()
  gate.resolve()
  assert.equal((await h.finish(task)).error, undefined)
  assert.equal(h.video.paused, true)
  assert.equal(h.playCount, 0)
  assert.equal(h.state.watchTogether.isPlaying, false)
})

test('a pause while play() is pending cannot be undone by late completion', async t => {
  const gate = deferred()
  const h = await harness(t, { play: () => gate.promise })
  const task = h.recover()
  await flush()
  assert.equal(h.playCount, 1)
  h.pause()
  gate.resolve()
  assert.equal((await h.finish(task)).error, undefined)
  assert.equal(h.video.paused, true)
  assert.equal(h.state.watchTogether.isPlaying, false)
})

const mutations = {
  server: h => h.setServer('https://different.example'),
  room: h => h.patch({ roomId: 'another-room' }),
  session: h => h.patch({ roomSessionRevision: 2 }),
  account: h => h.setProxy({ sessionVersion: 2 }),
  selection: h => h.quality.selectNativeQuality(1, 64),
  video: h => h.replaceVideo(),
  cid: h => h.patch({ movies: [{ ...h.state.movies[0], cid: 456 }] }),
  host: h => { h.host.current = false },
}
for (const [name, mutate] of Object.entries(mutations)) {
  test(`same-movie ${name} replacement discards a late resolver result`, async t => {
    const gate = deferred()
    const h = await harness(t, { resolve: () => gate.promise })
    const task = h.recover()
    await flush()
    mutate(h)
    gate.resolve()
    await h.finish(task)
    assert.equal(h.reloads.length, 0)
    assert.equal(h.sourceWrites.length, 0)
    assert.equal(h.overrideWrites.length, 0)
    assert.equal(h.cleanupCount, 0)
    assert.equal(h.completed, 0)
    assert.equal(h.suppressEventsRef.current, false)
  })
}

test('late old reload completion cannot clean up or publish over a newer movie engine', async t => {
  const gate = deferred()
  const h = await harness(t, { reload: () => gate.promise })
  const old = h.recover()
  await flush()
  const next = { ...h.state.watchTogether, currentMovieId: 2, cid: 456, sourceUrl: 'https://media.example/new.m4s' }
  h.patch({
    currentMovieId: 2,
    movies: [{ id: 2, cid: 456, url: 'BVnext', sourceType: 'bilibili' }],
    watchTogether: next,
  })
  await h.finish(old)
  await h.api.applySourceToVideo(h.video, next)
  assert.equal(h.attachCount, 1)
  const cleanupsBefore = h.cleanupCount
  gate.resolve()
  await flush()
  assert.equal(h.cleanupCount, cleanupsBefore)
  assert.equal(h.sourceWrites.length, 0)
  assert.equal(h.playCount, 0)
  assert.equal(h.state.watchTogether.sourceUrl, next.sourceUrl)
})

test('a replacement video starts its own recovery instead of joining the old element task', async t => {
  const gate = deferred()
  const h = await harness(t, { resolve: call => call.number === 1 ? gate.promise : undefined })
  const old = h.recover()
  await flush()
  const replacement = h.replaceVideo()
  const current = h.recover()
  await flush()
  await h.advance(2000)
  assert.equal(h.resolutions.length, 2, 'A new video identity needs its own recovery')
  assert.equal((await h.finish(current)).error, undefined)
  await h.finish(old)
  assert.equal(h.sourceWrites.length, 1)
  assert.equal(replacement.paused, false)
  gate.resolve()
  await flush()
  assert.equal(h.sourceWrites.length, 1)
  assert.equal(h.cleanupCount, 0)
})

test('cleanup followed by immediate recovery never rejoins the canceled same-key task', async t => {
  const gate = deferred()
  const h = await harness(t, { resolve: call => call.number === 1 ? gate.promise : undefined })
  const old = h.recover()
  await flush()
  h.api.cleanupMedia()
  const current = h.recover()
  await flush()
  await h.advance(2000)
  assert.equal(h.resolutions.length, 2)
  assert.equal((await h.finish(current)).error, undefined)
  await h.finish(old)
  assert.equal(h.sourceWrites.length, 1)
  assert.equal(h.cleanupCount, 1)
  assert.equal(h.suppressEventsRef.current, false)
  gate.resolve()
  await flush()
  assert.equal(h.sourceWrites.length, 1)
  assert.equal(h.cleanupCount, 1)
})

test('a pending attempt can be superseded without releasing the newer suppression lease', async t => {
  const oldGate = deferred()
  const newGate = deferred()
  const h = await harness(t, { resolve: call => call.number === 1 ? oldGate.promise : newGate.promise })
  const old = h.recover()
  await flush()
  h.patch({ roomSessionRevision: 2 })
  const current = h.recover()
  await flush()
  await h.finish(old)
  assert.equal(h.suppressEventsRef.current, true)
  newGate.resolve()
  assert.equal((await h.finish(current)).error, undefined)
  oldGate.resolve()
  await flush()
  assert.equal(h.sourceWrites.length, 1)
  assert.equal(h.suppressEventsRef.current, false)
})

for (const expiredTrack of ['video', 'audio']) {
  test(`viewer replaces an override with an expired ${expiredTrack} address before attaching`, async t => {
    const h = await harness(t, { host: false })
    const fresh = `https://media.example/track.m4s?deadline=${h.now / 1000 + 3600}`
    const expired = `https://media.example/track.m4s?deadline=${h.now / 1000 - 1}`
    h.state.setViewerCliResolvedSource({
      movieId: 1,
      resolved: {
        videoUrl: expiredTrack === 'video' ? `http://127.0.0.1:9000/proxy?url=${encodeURIComponent(expired)}` : fresh,
        audioUrl: expiredTrack === 'audio' ? expired : fresh,
        format: 'dash', cid: 123, currentQn: 80,
      },
    })
    await h.api.applySourceToVideo(h.video, h.state.watchTogether)
    assert.equal(h.resolutions.length, 1)
    assert.equal(h.attachCount, 1)
    assert.match(h.state.viewerCliResolvedSource.resolved.videoUrl, /video-1\.m4s/)
  })
}

test('viewer reuses a fresh local override but explicit reload forces a new native resolution', async t => {
  const h = await harness(t, { host: false })
  h.state.setViewerCliResolvedSource({
    movieId: 1,
    resolved: {
      videoUrl: `https://media.example/cached.m4s?deadline=${h.now / 1000 + 3600}`,
      audioUrl: 'https://media.example/audio.m4s', format: 'dash', cid: 123, currentQn: 80,
    },
  })
  await h.api.applySourceToVideo(h.video, h.state.watchTogether)
  assert.equal(h.resolutions.length, 0)
  const task = observe(h.api.reloadVideo(h.video))
  assert.equal((await h.finish(task)).error, undefined)
  assert.equal(h.resolutions.length, 1)
  assert.equal(h.resolutions[0].options.forceRefresh, true)
  assert.equal(h.sourceWrites.length, 0, 'A viewer cannot publish the host state')
  assert.equal(h.completed, 0)
  assert.match(h.state.viewerCliResolvedSource.resolved.videoUrl, /video-1\.m4s/)
})

for (const reject of [false, true]) {
  test(`a stale CLI-only viewer ${reject ? 'resolution rejection' : 'resolution success'} cannot clear a new room source`, async t => {
    const gate = deferred()
    const h = await harness(t, { host: false, resolve: () => gate.promise })
    h.patch({ movies: [{ ...h.state.movies[0], cliOnly: true }] })
    const task = observe(h.api.applySourceToVideo(h.video, h.state.watchTogether))
    await flush()
    assert.equal(h.resolutions.length, 1)
    const replacement = {
      movieId: 2, sessionVersion: 1,
      resolved: { videoUrl: 'https://media.example/new.m4s', format: 'dash', cid: 456 },
    }
    h.patch({
      roomId: 'another-room', roomSessionRevision: 2, currentMovieId: 2,
      movies: [{ id: 2, cid: 456, url: 'BVnext', sourceType: 'bilibili' }],
      watchTogether: { ...h.state.watchTogether, currentMovieId: 2, cid: 456 },
      viewerCliResolvedSource: replacement,
    })
    if (reject) gate.reject(new Error('Old request failed after room change'))
    else gate.resolve()
    const outcome = await h.finish(task)
    assert.equal(outcome.error?.name, 'AbortError')
    assert.equal(h.state.viewerCliResolvedSource, replacement)
    assert.equal(h.state.viewerCliRequiredMovieId, null)
    assert.equal(h.attachCount, 0)
    assert.equal(h.sourceWrites.length, 0)
  })
}

test('an active CLI-only viewer resolution failure still marks its own movie as requiring a proxy', async t => {
  const h = await harness(t, { host: false, resolve: async () => { throw Error('Fixture resolution failed') } })
  h.patch({ movies: [{ ...h.state.movies[0], cliOnly: true }] })
  await h.api.applySourceToVideo(h.video, h.state.watchTogether)
  assert.equal(h.state.viewerCliResolvedSource, null)
  assert.equal(h.state.viewerCliRequiredMovieId, 1)
  assert.equal(h.attachCount, 0)
})
