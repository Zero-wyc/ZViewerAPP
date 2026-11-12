import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { parse } from '@babel/parser'
import { extractLiveRoomId, mapBilibiliLiveSource } from '../src/upstream/modules/bilibili/live.ts'

async function load(file, mocks = {}) {
  mocks = { subscribeEmbeddedProxy: () => () => {}, ...mocks }
  const context = createContext({ URL, URLSearchParams, Response, DOMException, AbortController, setTimeout, clearTimeout, console })
  const source = stripTypeScriptTypes(await readFile(new URL(`../src/upstream/${file}`, import.meta.url), 'utf8'))
  const imports = new Map(parse(source, { sourceType: 'module' }).program.body.filter(n => n.type === 'ImportDeclaration')
    .map(n => [n.source.value, n.specifiers.map(s => s.imported?.name || 'default')]))
  const module = new SourceTextModule(source, { context })
  await module.link(name => new SyntheticModule(imports.get(name), function () {
    for (const key of imports.get(name)) this.setExport(key, mocks[key] ?? (() => assert.fail(`Unexpected ${key}`)))
  }, { context }))
  await module.evaluate()
  return module.namespace
}
const live = { success: true, roomId: 123, title: 'Live fixture', videoUrl: 'https://cdn.bilivideo.com/live.flv',
  liveStatus: 1, format: 'flv', currentQn: 10000, qualities: [{ id: 10000, label: '原画' }] }

test('live room recognition accepts canonical mobile/fullscreen paths and rejects impostors', () => {
  for (const path of ['123', 'blanc/123', 'h5/123/', 'blackboard/123?x=1']) assert.equal(extractLiveRoomId(`https://live.bilibili.com/${path}`), 123)
  for (const url of ['https://live.bilibili.com.evil.test/123', 'https://www.bilibili.com/video/123', 'https://live.bilibili.com/p/123', 'file://live.bilibili.com/123', 'https://user:pass@live.bilibili.com/123', '123']) assert.equal(extractLiveRoomId(url), 0)
})
test('offline preview retains the room link, cover and no VOD time axis', () => {
  const result = mapBilibiliLiveSource({ ...live, liveStatus: 0, videoUrl: '', cover: '/cover.png' })
  assert.equal(result.isLive, true); assert.equal(result.duration, 0)
  assert.equal(result.resolvedUrl, 'https://live.bilibili.com/123')
  assert.equal(result.cover, '/cover.png'); assert.equal(result.audioUrl, undefined)
})
test('live API forwards quality and movie authorization through the established API transport', async () => {
  let request
  const api = await load('modules/bilibili/bilibiliApi.ts', { apiFetch: async (url, options) => {
    request = { url: new URL(url, 'https://api.example'), signal: options.signal }; return Response.json(live)
  } })
  const result = await api.resolveBilibiliLive('https://live.bilibili.com/123?from=share', { qn: 10000, movieId: 42 })
  assert.equal(request.url.pathname, '/api/stream/resolve-bilibili-live')
  assert.equal(request.url.searchParams.get('movieId'), '42'); assert.equal(request.url.searchParams.get('qn'), '10000')
  assert.equal(request.url.searchParams.get('url'), 'https://live.bilibili.com/123?from=share')
  assert.equal(result.videoUrl, live.videoUrl)
})
test('live API rejects authorization failures and preserves explicit cancellation', async () => {
  const api = await load('modules/bilibili/bilibiliApi.ts', { apiFetch: async () => Response.json({ success: false, message: 'ROOM_FORBIDDEN' }, { status: 403 }) })
  await assert.rejects(api.resolveBilibiliLive('https://live.bilibili.com/123', { movieId: 42 }), /ROOM_FORBIDDEN/)
  const abort = new AbortController(); abort.abort(new DOMException('replaced', 'AbortError'))
  await assert.rejects(api.resolveBilibiliLive('https://live.bilibili.com/123', { signal: abort.signal }), e => e.name === 'AbortError')
  const waiting = await load('modules/bilibili/bilibiliApi.ts', { apiFetch: async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) })
  const controller = new AbortController(); const pending = waiting.resolveBilibiliLive('https://live.bilibili.com/123', { signal: controller.signal })
  controller.abort(new DOMException('source changed', 'AbortError'))
  await assert.rejects(pending, e => e.name === 'AbortError')
})
test('live resolution ignores VOD CLI/recovery caches and refreshes signed addresses with the movie quality', async () => {
  let calls = 0
  const resolver = await load('modules/room/watch-together/movie-source-resolver.ts', {
    extractLiveRoomId, resolveBilibiliLive: async (url, options) => {
      assert.equal(options.movieId, 42); assert.equal(options.qn, 10000)
      return { ...live, videoUrl: live.videoUrl + `?session=${++calls}` }
    },
  })
  const movie = { id: 42, url: 'https://live.bilibili.com/123', currentQn: 10000, serverProxy: true, cliOnly: true }
  const first = await resolver.resolveMovieSource({ movie, sourceType: 'bilibili', recovery: { sourceUrl: 'https://expired.example/old.flv', currentTime: 60 } })
  const second = await resolver.resolveMovieSource({ movie: { ...movie, serverProxy: false }, sourceType: 'bilibili' })
  assert.notEqual(first.sourceUrl, second.sourceUrl); assert.equal(first.isLive, true)
  assert.equal(first.duration, 0); assert.equal(first.liveDirect, false); assert.equal(second.liveDirect, true)
})
test('offline playback fails without falling through to a VOD proxy', async () => {
  const resolver = await load('modules/room/watch-together/movie-source-resolver.ts', {
    extractLiveRoomId, resolveBilibiliLive: async () => ({ ...live, liveStatus: 0, videoUrl: '' }),
  })
  await assert.rejects(resolver.resolveBilibiliOnline({ id: 42, url: 'https://live.bilibili.com/123' }), /未开播/)
})
test('live flags survive full broadcasts and route changes reattach even with the same CDN URL', async () => {
  const merge = await load('modules/sync-playback/services/state-merge.ts')
  const state = { sourceUrl: live.videoUrl, sourceType: 'bilibili', isLive: true, liveDirect: false, currentTime: 0, duration: 0, playbackRate: 1, isPlaying: true }
  assert.equal(merge.buildStateFromVideo(null, state).isLive, true)
  assert.equal(merge.buildStateFromVideo(null, state).liveDirect, false)
  assert.equal(merge.isSameMediaSource(state, { ...state, liveDirect: true }), false)
  assert.equal(merge.isStateEqual(state, { ...state, liveDirect: true }), false)
  assert.equal(merge.isSameMediaSource(state, { ...state, isLive: false }), false)
  assert.equal(merge.restoreStateSnapshot(state, { ...state, isLive: false }).isLive, false)
})
