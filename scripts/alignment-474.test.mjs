import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'

const policy = loadTs('src/upstream/modules/room/watch-together/runtime-settings.ts')
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const dto = (patch = {}) => ({ id: 1, roomId: 'room', source: 'anime', url: 'https://media.test/a.m3u8',
  serverProxy: false, playsvideoEnabled: false, title: 'Video', directLink: false, ...patch })

function storeHarness() {
  const requests = [], pending = []
  let server = 'https://server.test', user = { id: '1', role: 'user' }
  const { useRoomStore: store, mapDtoToMovie } = loadTs('src/upstream/store/roomStore.ts', {
    zustand: { create: init => {
      let state
      const api = { getState: () => state, setState: value => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) } } }
      state = init(api.setState, api.getState)
      return api
    } },
    '../../platform/bilibiliProxy': { getEmbeddedProxyStatus: () => ({}) },
    '@/modules/bilibili/cliApi': { unwrapCliProxyUrl: url => url },
    '@/modules/music/store': { useMusicStore: { getState: () => ({ reset() {} }) } },
    '@/modules/room/watch-together/runtime-settings': policy,
    './authStore': { useAuthStore: { getState: () => ({ user }) } },
    '@/lib/api': { getApiUrl: () => server, safeJson: async res => res.body,
      apiFetch: async (url, options) => { const work = deferred(); requests.push({ url, options }); pending.push(work); return work.promise } },
  })
  store.setState({ roomId: 'room', roomOwnerUserId: 1, currentMovieId: 1, movies: [mapDtoToMovie(dto())] })
  const respond = (body, ok = true) => pending.shift().resolve({ body, ok })
  return { store, requests, pending, respond, movie: data => mapDtoToMovie(data),
    setServer: value => { server = value }, setUser: value => { user = value } }
}

test('Socket before HTTP is held; PUT only writes changed field; late old list is reconciled by GET', async () => {
  const h = storeHarness(), s = () => h.store.getState()
  const save = s().saveMoviePlaybackSettings(1, { serverProxy: true })
  assert.deepEqual(JSON.parse(h.requests[0].options.body), { serverProxy: true })
  s().setMovies([h.movie(dto({ serverProxy: true }))])
  assert.equal(s().movies[0].serverProxy, false)
  assert.equal(s().movieSettingsOperations[1].status, 'saving')
  assert.equal(h.requests.length, 1)
  h.respond({ success: true, movie: dto({ serverProxy: true }) }); await save
  assert.equal(s().movies[0].serverProxy, true)
  assert.equal(s().movieSettingsOperations[1].status, 'applying')
  s().setMovies([h.movie(dto())])
  assert.equal(s().movies[0].serverProxy, true)
  // Two fresh GETs may overlap; both carry the same operation token.
  while (h.pending.length) h.respond({ success: true, movies: [dto({ serverProxy: true })] })
  await flush()
  assert.equal(s().movies[0].serverProxy, true)
  s().finishMoviePlaybackSettings(1, s().movieSettingsOperations[1].token)
  // A legitimate remote edit is accepted after reading actual current server data.
  s().setMovies([h.movie(dto())]); h.respond({ success: true, movies: [dto()] }); await flush()
  assert.equal(s().movies[0].serverProxy, false)
})

test('HTTP before Socket, missing movie compatibility, non-current film, duplicate writes and stale finally', async () => {
  const h = storeHarness(), s = () => h.store.getState()
  h.store.setState({ currentMovieId: 2 })
  const save = s().saveMoviePlaybackSettings(1, { playsvideoEnabled: true })
  await s().saveMoviePlaybackSettings(1, { serverProxy: true })
  assert.equal(h.requests.length, 1)
  h.respond({ success: true }); await flush()
  assert.equal(s().movieSettingsOperations[1].status, 'saving')
  h.respond({ success: true, movies: [dto({ playsvideoEnabled: true })] }); await save
  assert.equal(s().movieSettingsOperations[1].status, 'idle')
  assert.equal(s().movies[0].playsvideoEnabled, true)
  const token = s().movieSettingsOperations[1].token
  s().finishMoviePlaybackSettings(1, token - 1, 'old failure')
  assert.equal(s().movieSettingsOperations[1].error, undefined)
})

test('403 preserves original policy, timeout refreshes authority, old room/server results do not apply', async () => {
  const h = storeHarness(), s = () => h.store.getState()
  let save = s().saveMoviePlaybackSettings(1, { serverProxy: true })
  h.respond({ success: false, message: 'Forbidden' }, false); await flush()
  h.respond({ success: true, movies: [dto()] }); await assert.rejects(save, /Forbidden/)
  assert.equal(s().movies[0].serverProxy, false)
  save = s().saveMoviePlaybackSettings(1, { serverProxy: true })
  s().setRoomId('new-room')
  h.respond({ success: true, movie: dto({ serverProxy: true }) }); await save
  assert.equal(s().movies[0].serverProxy, false)
  s().reset(); h.store.setState({ roomId: 'room', roomOwnerUserId: 1, movies: [h.movie(dto())] })
  save = s().saveMoviePlaybackSettings(1, { serverProxy: true })
  h.setServer('https://different.test')
  h.respond({ success: true, movie: dto({ serverProxy: true }) }); await save
  assert.equal(s().movies[0].serverProxy, false)
})

test('a GET started while PUT is saving cannot revert the later confirmed policy', async () => {
  const h = storeHarness(), s = () => h.store.getState()
  const save = s().saveMoviePlaybackSettings(1, { serverProxy: true })
  const oldGet = s().fetchMovies('room')
  h.respond({ success: true, movie: dto({ serverProxy: true }) }); await save
  h.respond({ success: true, movies: [dto()] }); await oldGet
  assert.equal(s().movies[0].serverProxy, true)
  assert.equal(s().movieSettingsOperations[1].confirmed.serverProxy, true)
})

test('late older authority GET cannot overwrite a newer server policy response', async () => {
  const h = storeHarness(), s = () => h.store.getState()
  const oldGet = s().fetchMovies('room'), newGet = s().fetchMovies('room')
  h.pending[1].resolve({ ok: true, body: { success: true, movies: [dto({ serverProxy: true })] } }); await newGet
  h.pending[0].resolve({ ok: true, body: { success: true, movies: [dto()] } }); await oldGet
  assert.equal(s().movies[0].serverProxy, true)
})

function hostHarness() {
  const source = readFileSync('src/upstream/modules/room/watch-together/useWatchTogether.ts', 'utf8')
  const start = source.indexOf('    if (!currentMovieId) return', source.indexOf('// currentMovieId 变化时自动加载'))
  const body = stripTypeScriptTypes(`exports.run = () => {${source.slice(start, source.indexOf('\n  }, [', start))}}`)
  const state = { roomId: 'room', roomSessionRevision: 1, currentMovieId: 1,
    movies: [{ ...dto(), sourceType: 'anime' }], movieSettingsOperations: {},
    watchTogether: { sourceUrl: dto().url, currentTime: 0, playbackRate: 1.5, isPlaying: true } }
  const video = { currentTime: 0, playbackRate: 1.5, paused: true, pause() { this.paused = true } }
  const broadcasts = [], attachments = [], errors = []
  let attachWork, resolverWork, failure, userPaused = false
  const refs = Object.fromEntries(['lastLoadedMovieRef','lastSuccessfulMovieRef','initialPlaybackRef'].map(name => [name, { current: null }]))
  const context = {
    exports: {}, canEditRuntime: true, ...refs, isHostRef: { current: true }, videoRef: { current: video },
    appliedPlaybackRef: { current: false }, loadSeqRef: { current: 0 }, suppressEventsRef: { current: false },
    autoReloadCountRef: { current: 0 }, autoReloadNotifiedRef: { current: false }, failedLoadMovieIdsRef: { current: new Set() },
    moviePlaybackKey: policy.moviePlaybackKey, getApiUrl: () => 'server', useAuthStore: { getState: () => ({ user: { role: 'root' } }) },
    useRoomStore: { getState: () => ({ ...state, finishMoviePlaybackSettings(id, token, error) {
      const op = state.movieSettingsOperations[id]; if (op?.token === token) Object.assign(op, { status: error ? 'error' : 'idle', error })
    } }) },
    setLoadMovieError: error => { if (error) errors.push(error) }, setIsResolving() {},
    resetSuppression() {}, cleanupMedia() {}, formatDuration: String,
    resolveMovieSource: async ({ movie }) => { await resolverWork; return { sourceUrl: movie.url,
      format: 'hls', noProxyFallback: !movie.serverProxy, playsvideoEnabled: movie.playsvideoEnabled } },
    getBilibiliParseOptions: () => ({}), quality: {},
    applySourceToVideo: async (_video, value, startTime) => {
      attachments.push({ value, startTime }); video.currentTime = 0; video.paused = true
      await attachWork; if (failure) throw new Error('attach failed')
    },
    setWatchTogether: value => { state.watchTogether = { ...state.watchTogether, ...value } },
    broadcastState: value => broadcasts.push(value), sendControl() {},
    safePlay: async () => { video.paused = false }, wasUserPaused: () => userPaused,
    message: { error() {}, info() {} }, console: { error() {}, log() {} },
  }
  function render() {
    Object.assign(context, state, { retryToken: 0 })
    runInNewContext(`${body}; exports.run()`, context)
  }
  return { state, video, refs, context, broadcasts, attachments, errors, render,
    holdAttach(work) { attachWork = work }, fail() { failure = true },
    pauseIntent() { userPaused = true }, holdResolve(work) { resolverWork = work } }
}

test('host same-URL policy reload applies once, preserving progress, paused intent and speed', async () => {
  const h = hostHarness(); h.render(); await flush()
  h.video.currentTime = 47; h.video.playbackRate = 1.5; h.video.paused = true
  h.state.movies = [{ ...h.state.movies[0], serverProxy: true }]
  h.state.movieSettingsOperations = { 1: { token: 1, status: 'applying' } }
  h.render(); await flush()
  assert.equal(h.attachments.length, 2)
  assert.equal(h.attachments[1].startTime, 47)
  assert.equal(h.video.currentTime, 47); assert.equal(h.video.playbackRate, 1.5); assert.equal(h.video.paused, true)
  assert.equal(h.state.movieSettingsOperations[1].status, 'idle')
  h.render(); await flush(); assert.equal(h.attachments.length, 2)
})

test('pause while loading wins; failed apply publishes only the previous successful source paused', async () => {
  const h = hostHarness(); h.render(); await flush()
  h.video.currentTime = 22; h.video.paused = false
  const work = deferred(); h.holdAttach(work.promise)
  h.state.movies = [{ ...h.state.movies[0], serverProxy: true }]
  h.state.movieSettingsOperations = { 1: { token: 1, status: 'applying' } }
  h.render(); await flush(); assert.equal(h.state.watchTogether.noProxyFallback, true, 'full-state responders can only read the last applied policy'); h.pauseIntent(); work.resolve(); await flush()
  assert.equal(h.video.paused, true); assert.equal(h.broadcasts.at(-1).isPlaying, false)
  h.state.movies = [{ ...h.state.movies[0], serverProxy: false, url: 'https://new.test/bad' }]
  h.state.movieSettingsOperations = { 1: { token: 2, status: 'applying' } }; h.fail()
  h.render(); await flush()
  assert.equal(h.state.movieSettingsOperations[1].status, 'error')
  assert.equal(h.broadcasts.at(-1).sourceUrl, dto().url)
  assert.equal(h.broadcasts.at(-1).noProxyFallback, false)
  assert.equal(h.broadcasts.at(-1).isPlaying, false)
})

test('switching back to last successful movie invalidates pending other-film work; leave cannot publish', async () => {
  const h = hostHarness(); h.render(); await flush()
  const work = deferred(); h.holdResolve(work.promise)
  const original = h.state.movies[0]
  h.state.movies = [original, { ...original, id: 2, url: 'https://media.test/b' }]
  h.state.currentMovieId = 2; h.render(); await flush()
  h.state.currentMovieId = 1; h.render(); work.resolve(); await flush()
  assert.equal(h.attachments.at(-1).value.sourceUrl, original.url)
  const attach = deferred(); h.holdAttach(attach.promise)
  h.state.movies = [{ ...original, serverProxy: true }]; h.render(); await flush()
  const count = h.broadcasts.length
  h.state.roomSessionRevision++; attach.resolve(); await flush()
  assert.equal(h.broadcasts.length, count)
})
