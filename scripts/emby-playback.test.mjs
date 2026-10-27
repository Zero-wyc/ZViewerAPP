import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { parse } from '@babel/parser'
import { create } from 'zustand'

const real = {
  '@/modules/emby/embyApi': 'modules/emby/embyApi.ts',
  '@/modules/emby/playbackMode': 'modules/emby/playbackMode.ts',
  '@/modules/emby/mediaLibraryOperation': 'modules/emby/mediaLibraryOperation.ts',
  '@/modules/room/watch-together/runtime-settings': 'modules/room/watch-together/runtime-settings.ts',
  '@/lib/netAddress': 'lib/netAddress.ts', './mediaLibraryUrl': 'modules/emby/mediaLibraryUrl.ts',
}
async function load(file, overrides = {}) {
  const context = createContext({ URL, URLSearchParams, Response, Error, console })
  const cache = new Map()
  const mocks = { create, safeJson: response => response.json(), getApiUrl: () => 'https://zviewer.example',
    connectionUrl: value => value, unwrapCliProxyUrl: value => value, subscribeEmbeddedProxy: () => () => {},
    getEmbeddedProxyStatus: () => ({ sessionVersion: 1 }), ...overrides }
  async function build(name) {
    if (cache.has(name)) return cache.get(name)
    const source = stripTypeScriptTypes(await readFile(new URL(`../src/upstream/${name}`, import.meta.url), 'utf8'))
    const module = new SourceTextModule(source, { context })
    cache.set(name, module)
    const imports = new Map(parse(source, { sourceType: 'module' }).program.body
      .filter(node => node.type === 'ImportDeclaration').map(node => [node.source.value,
        node.specifiers.map(specifier => specifier.imported?.name || 'default')]))
    await module.link(async specifier => {
      if (real[specifier]) return build(real[specifier])
      const names = imports.get(specifier)
      return new SyntheticModule(names, function () {
        for (const key of names) this.setExport(key, mocks[key] ?? (() => { throw new Error(`Unexpected ${key}`) }))
      }, { context })
    })
    return module
  }
  const module = await build(file)
  await module.evaluate()
  return { ...module.namespace, dependency: name => cache.get(name)?.namespace }
}

const source = kind => ({ success: true, videoUrl: `/api/${kind}/proxy?mountId=1&path=item`,
  streamUrl: `/api/${kind}/stream?movieId=7&at=0&ms=alt`,
  directUrl: 'https://media.example/stream?api_key=fixture&MediaSourceId=alt',
  resolvedDirectUrl: 'https://cdn.example/movie.mkv?sign=temporary', format: 'mkv',
  audioCodec: 'dts', needsAudioTranscode: true, audioTranscodeDisabled: true,
  mediaSourceId: 'alt', versions: [{ id: 'alt', label: '4K' }], multiVersion: true })
const movie = kind => ({ id: 7, sourceType: kind, url: `/api/${kind}/stream?movieId=7&ms=alt`,
  format: 'hls', audioCodec: 'dts', directLink: false, serverUrl: 'http://media.example', playsvideoEnabled: true })

test('relay visibility follows address scope without HTTPS, CORS or reachability conditions', async () => {
  const { canSwitchEmbyPlayback } = await load('modules/emby/playbackMode.ts')
  for (const kind of ['emby', 'jellyfin']) {
    for (const serverUrl of ['http://media.example', 'https://unreachable.example', 'media.example:8096', '', undefined]) {
      assert.equal(canSwitchEmbyPlayback({ sourceType: kind, serverUrl }), true, String(serverUrl))
    }
    for (const serverUrl of ['http://127.0.0.1', 'http://192.168.1.2:8096', 'http://nas.local', 'http://[fd12::1]', 'http://[::1]']) {
      assert.equal(canSwitchEmbyPlayback({ sourceType: kind, serverUrl }), false, serverUrl)
    }
  }
  assert.equal(canSwitchEmbyPlayback({ sourceType: 'webdav', serverUrl: 'https://media.example' }), false)
})

for (const kind of ['emby', 'jellyfin']) {
  test(`${kind} direct resolution preserves capabilities, selected version and AbortSignal`, async () => {
    const requests = []
    const api = await load('modules/emby/embyApi.ts', { apiFetch: async (url, options) => {
      requests.push({ url, options }); return Response.json(source(kind))
    } })
    const signal = new AbortController().signal
    const result = await api.getEmbyApiMovieSource(kind, 7, 'alt', signal, true)
    assert.equal(requests[0].url, `/api/${kind}/movie-source?movieId=7&ms=alt&direct=1`)
    assert.equal(requests[0].options.signal, signal)
    assert.equal(result.resolvedDirectUrl, source(kind).resolvedDirectUrl)
    assert.equal(result.audioTranscodeDisabled, true)
    await api.getEmbyApiMovieSource(kind, 7, 'alt')
    assert.equal(requests[1].url.includes('direct='), false)
  })

  test(`${kind} playback refreshes stale HLS and chooses CDN only in direct mode`, async () => {
    const requests = []
    const resolver = await load('modules/room/watch-together/movie-source-resolver.ts', { apiFetch: async url => {
      requests.push(url); return Response.json(source(kind))
    } })
    const relay = await resolver.resolveMovieSource({ movie: movie(kind), sourceType: kind })
    assert.equal(relay.sourceUrl, source(kind).streamUrl)
    assert.equal(relay.format, 'mkv')
    assert.equal(relay.noProxyFallback, false)
    assert.equal(requests[0].includes('ms=alt'), true)
    assert.equal(requests[0].includes('direct='), false)
    const direct = await resolver.resolveMovieSource({ movie: { ...movie(kind), directLink: true,
      url: source(kind).directUrl, playsvideoEnabled: false }, sourceType: kind })
    assert.equal(direct.sourceUrl, source(kind).resolvedDirectUrl)
    assert.equal(direct.noProxyFallback, true)
    assert.equal(direct.playsvideoEnabled, false)
    assert.equal(requests[1].includes('ms=alt&direct=1'), true)
    const viewer = await resolver.resolveViewerMovieSource(movie(kind), { noProxyFallback: true })
    assert.equal(viewer.sourceUrl, direct.sourceUrl)
  })

  test(`${kind} saving each relay direction preserves the stable version URL and blocks late broadcasts`, async () => {
    let persisted = movie(kind)
    const requests = []
    const auth = { user: { id: 1, role: 'user' } }
    const api = await load('store/roomStore.ts', { useAuthStore: { getState: () => auth },
      apiFetch: async (url, options) => {
        requests.push({ url, options })
        if (url.includes('/movie-source?')) return Response.json(source(kind))
        if (options?.method === 'PUT') persisted = { ...persisted, ...JSON.parse(options.body) }
        const dto = { ...persisted, source: kind }
        return Response.json(options?.method === 'PUT' ? { success: true, movie: dto } : { success: true, movies: [dto] })
      } })
    const store = api.useRoomStore
    store.setState({ roomId: 'room', roomOwnerUserId: 1, currentMovieId: 7, movies: [persisted] })
    for (const serverProxy of [false, true]) {
      await store.getState().saveMoviePlaybackSettings(7, { serverProxy })
      const patch = JSON.parse(requests.filter(item => item.options?.method === 'PUT').at(-1).options.body)
      assert.equal(patch.directLink, !serverProxy)
      assert.equal(patch.url, serverProxy ? source(kind).streamUrl : source(kind).directUrl)
      assert.equal(patch.format, 'mkv')
      assert.equal(patch.audioCodec, 'dts')
      assert.equal(Object.hasOwn(patch, 'serverProxy'), false)
      assert.equal(patch.url.includes('temporary'), false)
      assert.equal(store.getState().movieSettingsOperations[7].status, 'applying')
      store.getState().setMovies([movie(kind)])
      assert.equal(store.getState().movies[0].directLink, !serverProxy)
      assert.equal(store.getState().movies[0].format, 'mkv')
      const operation = store.getState().movieSettingsOperations[7]
      store.getState().finishMoviePlaybackSettings(7, operation.token)
      await new Promise(resolve => setImmediate(resolve))
    }
  })
}

test('missing direct URLs and resolver failures do not switch to server relay or retain stale media', async () => {
  const policy = await load('modules/emby/playbackMode.ts')
  assert.throws(() => policy.embyPlaybackUpdate({ ...source('emby'), directUrl: undefined }, true), /未取得/)
  const resolver = await load('modules/room/watch-together/movie-source-resolver.ts', {
    apiFetch: async () => Response.json({ success: false, message: '无权读取影片' }, { status: 403 }),
  })
  await assert.rejects(resolver.resolveMovieSource({ movie: movie('emby'), sourceType: 'emby' }), /无权/)
})

for (const change of ['leave', 'authority', 'version', 'server']) {
  test(`a pending relay resolution cannot save after ${change} changes`, async () => {
    let release, writes = 0
    let server = 'https://zviewer.example'
    const auth = { user: { id: 1, role: 'user' } }
    const api = await load('store/roomStore.ts', { useAuthStore: { getState: () => auth }, getApiUrl: () => server,
      apiFetch: async (url, options) => {
        if (url.includes('/movie-source?')) return new Promise(resolve => { release = () => resolve(Response.json(source('emby'))) })
        if (options?.method === 'PUT') writes++
        return Response.json({ success: true, movies: [{ ...movie('emby'), source: 'emby' }] })
      } })
    const store = api.useRoomStore
    store.setState({ roomId: 'room', roomOwnerUserId: 1, movies: [movie('emby')] })
    const pending = store.getState().saveMoviePlaybackSettings(7, { serverProxy: false })
    if (change === 'leave') store.getState().setRoomId('another')
    else if (change === 'authority') auth.user = null
    else if (change === 'server') server = 'https://another.example'
    else {
      api.dependency('modules/emby/mediaLibraryOperation.ts').beginMediaLibraryChange(7)
    }
    release()
    await pending.catch(() => {})
    assert.equal(writes, 0)
  })
}

test('older server responses retain direct playback without silently selecting the relay URL', async () => {
  const resolver = await load('modules/room/watch-together/movie-source-resolver.ts', {
    apiFetch: async () => Response.json({ ...source('emby'), resolvedDirectUrl: undefined }),
  })
  const result = await resolver.resolveMovieSource({ movie: { ...movie('emby'), directLink: true }, sourceType: 'emby' })
  assert.equal(result.sourceUrl, source('emby').directUrl)
  assert.equal(result.noProxyFallback, true)
})

test('private library relay changes are rejected before resolving or writing media', async () => {
  const requests = []
  const api = await load('store/roomStore.ts', { useAuthStore: { getState: () => ({ user: { id: 1, role: 'user' } }) },
    apiFetch: async (url, options) => { requests.push({ url, options }); return Response.json({ success: true, movies: [] }) } })
  api.useRoomStore.setState({ roomId: 'room', roomOwnerUserId: 1,
    movies: [{ ...movie('emby'), serverUrl: 'http://192.168.1.2' }] })
  await assert.rejects(api.useRoomStore.getState().saveMoviePlaybackSettings(7, { serverProxy: false }), /内网/)
  assert.equal(requests.some(item => item.url.includes('/movie-source') || item.options?.method === 'PUT'), false)
})
