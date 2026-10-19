import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'
const root = new URL('../src/upstream/', import.meta.url)
const api = loadTs(new URL('modules/emby/embyApi.ts', root), {
  '@/lib/api': { apiFetch: () => {}, getApiUrl: () => 'https://server.example' },
  '../../../platform/connectionTransport': { connectionUrl: url => url },
  './mediaLibraryUrl': loadTs(new URL('modules/emby/mediaLibraryUrl.ts', root), {}, { URL }),
    '@/modules/direct-link/directLinkApi': { buildProxyUrl: () => {} },
}, { URLSearchParams })
const series = loadTs(new URL('modules/emby/seriesPages.ts', root), { './embyApi': api })
test('series enumeration preserves season/episode order and item IDs; mixed non-video files are excluded', async () => {
  const entries = { show: [{ name: 'S2', path: 's2', type: 'directory', embyType: 'Season' }, { name: 'S1', path: 's1', type: 'directory', embyType: 'Season' }],
    s2: [{ name: 'B', path: 'b', type: 'file', embyType: 'Episode', indexNumber: 2, parentIndexNumber: 2, duration: 100 }, { name: 'poster', path: 'image', type: 'file', embyType: 'Photo' }],
    s1: [{ name: 'A', path: 'a', type: 'file', embyType: 'Video', filePath: '/动画/S01E03.mkv' }] }
  const pages = await series.enumerateSeriesPages(7, { name: 'show', path: 'show' }, async (_, path) => entries[path])
  assert.deepEqual(Array.from(pages, p => [p.page, p.path, p.mountId]), [[1, 'b', 7], [2, 'a', 7]])
  assert.match(pages[0].part, /S2E2/); assert.match(pages[1].part, /EP3/)
})
test('seasonless series is browsed once; leaving during enumeration rejects the entire stale result', async () => {
  let calls = 0, active = true
  const browse = async () => { calls++; return [{ name: 'A', path: 'a', type: 'file', embyType: 'Video' }] }
  assert.equal((await series.enumerateSeriesPages(1, { name: 'x', path: 'x' }, browse)).length, 1); assert.equal(calls, 1)
  const pages = await series.enumerateSeriesPages(1, { name: 'x', path: 'x' }, async () => { active = false; return await browse() }, () => active)
  assert.equal(pages.length, 0)
})
test('episode fallback handles S/E, EP and Chinese episode names without inventing missing metadata', () => {
  assert.equal(api.parseEpisodeFromFilePath('/a/S01E02.mkv').episode, 2)
  assert.equal(api.parseEpisodeFromFilePath('第一部 第03话.mkv').episode, 3)
  assert.equal(api.parseEpisodeFromFilePath('Show EP12.mkv').episode, 12)
  assert.equal(api.parseEpisodeFromFilePath('movie.mkv'), null)
})
function clearMethod(state, request) {
  const code = readFileSync(new URL('store/roomStore.ts', root), 'utf8'), a = code.indexOf('  clearMovies: async'), b = code.indexOf('  reorderMovies:', a)
  const exports = {}, changes = []
  runInNewContext(stripTypeScriptTypes('const actions = {' + code.slice(a, b) + '}; exports.clear = actions.clearMovies'), { exports, apiFetch: request, parseResponse: res => res.json(), get: () => state, set: update => { changes.push(update); Object.assign(state, update) }, Error, encodeURIComponent })
  return { ...exports, changes }
}
test('clear performs one room-wide DELETE and cancels playback/continuation only after successful response', async () => {
  const calls = [], state = { roomId: 'a/b', roomSessionRevision: 2, currentMovieId: 1, movies: [{ id: 1 }, { id: 2 }], autoContinueRevision: 4, watchTogether: { sourceUrl: 'old', isPlaying: true } }
  const action = clearMethod(state, async (...args) => { calls.push(args); return { ok: true, json: async () => ({ success: true, removed: 2 }) } })
  await action.clear('a/b'); assert.equal(calls.length, 1); assert.equal(calls[0][0], '/api/rooms/a%2Fb/movies'); assert.equal(calls[0][1].method, 'DELETE')
  assert.equal(state.currentMovieId, null); assert.equal(state.watchTogether.isPlaying, false); assert.equal(state.autoContinueRevision, 5); assert.equal(state.pendingQualityChange, null)
})
test('403 and old-server 404 keep authoritative movies and playback intact', async () => {
  for (const status of [403, 404]) {
    const state = { roomId: 'a', roomSessionRevision: 2, currentMovieId: 1 }, action = clearMethod(state, async () => ({ ok: false, status, json: async () => ({ success: false }) }))
    await assert.rejects(action.clear('a')); assert.equal(action.changes.length, 0); assert.equal(state.currentMovieId, 1)
  }
})
test('a late successful clear cannot affect another room or a rejoined session with the same room ID', async () => {
  for (const change of [{ roomId: 'b' }, { roomSessionRevision: 3 }]) {
    const state = { roomId: 'a', roomSessionRevision: 2, currentMovieId: 9 }, action = clearMethod(state, async () => { Object.assign(state, change); return { ok: true, json: async () => ({ success: true }) } })
    await action.clear('a'); assert.equal(action.changes.length, 0); assert.equal(state.currentMovieId, 9)
  }
})
test('episode/version requests supersede each other for one movie and remain independent across movies', () => {
  const module = loadTs(new URL('modules/emby/mediaLibraryOperation.ts', root)), first = module.beginMediaLibraryChange(1), other = module.beginMediaLibraryChange(2), last = module.beginMediaLibraryChange(1)
  assert.equal(first(), false); assert.equal(other(), true); assert.equal(last(), true)
})
test('scroll leases survive nested panels and volume cancellation, restoring original state exactly once', () => {
  const style = { overflow: 'auto', paddingRight: '4px' }, module = loadTs(new URL('components/ui/bodyScrollLock.ts', root), {}, { document: { body: { style }, documentElement: { clientWidth: 393 } }, window: { innerWidth: 393 } })
  const panel = module.lockBodyScroll(), slider = module.lockBodyScroll(); slider(); assert.equal(style.overflow, 'hidden'); slider(); panel(); assert.equal(style.overflow, 'auto'); assert.equal(style.paddingRight, '4px')
  const drag = module.lockBodyScroll(), nested = module.lockBodyScroll(); drag(); assert.equal(style.overflow, 'hidden'); nested(); assert.equal(style.overflow, 'auto')
})
test('movie-source encodes version ID, preserves HLS/audio metadata, and rejects failed protocols', async () => {
  for (const kind of ['emby', 'jellyfin']) {
    let call
    const m = loadTs(new URL('modules/emby/embyApi.ts', root), {
      '@/lib/api': { apiFetch: async path => { call = path; return { ok: true, json: async () => ({ success: true, videoUrl: '/stream', format: 'hls', audioCodec: 'aac', mediaSourceId: 'a/b', multiVersion: true, versions: [{ id: 'a/b' }] }) } }, getApiUrl: () => '' },
      '../../../platform/connectionTransport': { connectionUrl: url => url }, './mediaLibraryUrl': loadTs(new URL('modules/emby/mediaLibraryUrl.ts', root), {}, { URL }),
    '@/modules/direct-link/directLinkApi': { buildProxyUrl: () => {} },
    }, { URLSearchParams })
    const result = await m.getEmbyApiMovieSource(kind, 2, 'a/b'); assert.equal(call, `/api/${kind}/movie-source?movieId=2&ms=a%2Fb`); assert.equal(result.format, 'hls'); assert.equal(result.audioCodec, 'aac'); assert.equal(result.mediaSourceId, 'a/b')
  }
  const failed = loadTs(new URL('modules/emby/embyApi.ts', root), {
    '@/lib/api': { apiFetch: async () => ({ ok: false, json: async () => ({ success: false, message: 'forbidden' }) }), getApiUrl: () => '' },
    '../../../platform/connectionTransport': { connectionUrl: url => url }, './mediaLibraryUrl': loadTs(new URL('modules/emby/mediaLibraryUrl.ts', root), {}, { URL }),
    '@/modules/direct-link/directLinkApi': { buildProxyUrl: () => {} },
  }, { URLSearchParams })
  await assert.rejects(failed.getEmbyApiMovieSource('emby', 2), /forbidden/)
})

test('switching server invalidates late public settings and keeps the new server permissions', async () => {
  let completeOld
  let requests = 0
  const create = initializer => {
    let state
    const get = () => state
    const set = update => Object.assign(state, typeof update === 'function' ? update(state) : update)
    state = initializer(set, get)
    return { getState: get }
  }
  const module = loadTs(new URL('store/systemSettingsStore.ts', root), {
    zustand: { create }, '@/lib/api': {
      apiFetch: async () => { requests++; if (requests === 1) return await new Promise(resolve => { completeOld = resolve }); return { ok: true, json: async () => ({ success: true, settings: { betaFeaturesEnabled: true, roomCreationMode: 'all-users' } }) } },
      safeJson: response => response.json(),
    },
  })
  const store = module.useSystemSettingsStore.getState(), old = store.fetchSettings()
  store.invalidate(); await store.fetchSettings()
  completeOld({ ok: true, json: async () => ({ success: true, settings: { betaFeaturesEnabled: false, roomCreationMode: 'admin-only' } }) }); await old
  assert.equal(store.betaFeaturesEnabled, true); assert.equal(store.roomCreationMode, 'all-users'); assert.equal(store.loading, false)
})

test('old-server search 404 has an actionable message and never pretends to return an empty successful search', async () => {
  const old = loadTs(new URL('modules/emby/embyApi.ts', root), {
    '@/lib/api': { apiFetch: async () => ({ ok: false, status: 404, json: async () => { throw Error('must not parse an HTML 404') } }), getApiUrl: () => '' },
    '../../../platform/connectionTransport': { connectionUrl: url => url }, './mediaLibraryUrl': loadTs(new URL('modules/emby/mediaLibraryUrl.ts', root), {}, { URL }),
    '@/modules/direct-link/directLinkApi': { buildProxyUrl: () => {} },
  }, { URLSearchParams })
  await assert.rejects(old.searchEmbyMount(1, 'title'), /请升级服务端/)
})

test('direct versions use the exact MediaSourceId and preserve signed source parameters', () => {
  const module = loadTs(new URL('modules/emby/mediaLibraryUrl.ts', root), {}, { URL })
  const url = new URL(module.normalizeMediaLibraryDirectUrl('https://media.example/stream?api_key=private&ms=medium%2Fid'))
  assert.equal(url.searchParams.get('MediaSourceId'), 'medium/id'); assert.equal(url.searchParams.has('ms'), false); assert.equal(url.searchParams.get('api_key'), 'private')
  assert.equal(new URL(module.normalizeMediaLibraryDirectUrl('https://media.example/stream?MediaSourceId=chosen&ms=old')).searchParams.get('MediaSourceId'), 'chosen')
})
