import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'

async function load(file, imports = {}) {
  const context = createContext({ URL, URLSearchParams, Response, Error, TextEncoder, AbortController, console })
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8')), { context })
  await module.link(name => new SyntheticModule(Object.keys(imports[name]), function () {
    for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
  }, { context }))
  await module.evaluate()
  return module.namespace
}

test('FLV uses an admitted viewing capability and the current connection prefix', async () => {
  const requested = []
  const controller = new AbortController()
  const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
      react: { useEffect() {}, useState() {}, useCallback: fn => fn },
    '@/lib/api': {
      getApiUrl: () => 'http://127.0.0.1:47111/current-channel/prefix', getRtmpHost() {}, getRtmpPort() {},
      apiFetch: async (path, opts) => { requested.push({ path, opts }); return Response.json({ success: true, url: '/live/ROOM.flv?ticket=view-only' }) },
    },
  })
  assert.equal(await api.getWatchPlaybackUrl('ROOM', controller.signal), 'http://127.0.0.1:47111/current-channel/prefix/live/ROOM.flv?ticket=view-only')
  assert.equal(requested[0].path, '/api/stream-push/watch/ROOM')
  assert.equal(requested[0].opts.signal, controller.signal)
})

test('denied and malformed viewing capabilities never fall back to a publish key', async () => {
  for (const response of [Response.json({ success: false, message: '请先入房' }, { status: 403 }), Response.json({ success: true, url: '/live/PUBLISH-SECRET.flv' })]) {
    let requests = 0
    const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
    react: { useEffect() {}, useState() {}, useCallback: fn => fn },
      '@/lib/api': { getApiUrl: () => 'https://fixture.invalid', getRtmpHost() {}, getRtmpPort() {}, apiFetch: async () => { requests++; return response } },
    })
    await assert.rejects(api.getWatchPlaybackUrl('ROOM'))
    assert.equal(requests, 1)
  }
})

test('disposed viewing requests cannot resurrect playback', async () => {
  let effect, resolve, cleanup
  const states = []
  const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
    react: { useEffect(fn) { effect = fn }, useState(value) { return [value, next => states.push(next)] }, useCallback: fn => fn },
    '@/lib/api': { getApiUrl: () => 'https://fixture.invalid', getRtmpHost() {}, getRtmpPort() {}, apiFetch: () => new Promise(done => { resolve = done }) },
  })
  api.useWatchPlayback('ROOM')
  cleanup = effect()
  cleanup()
  resolve(Response.json({ success: true, url: '/live/ROOM.flv?ticket=old' }))
  await new Promise(done => setImmediate(done))
  assert.equal(states.length, 1)
  assert.equal(states[0].url, '')
})

test('viewing tickets are nonempty, room-bound and cannot be rebound to another server', async () => {
  for (const url of ['/live/OTHER.flv?ticket=secret', '/live/ROOM.flv?ticket=', '/live/ROOM.flv?not-ticket=secret']) {
    const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
      react: { useEffect() {}, useState() {}, useCallback: fn => fn },
      '@/lib/api': { getApiUrl: () => 'https://fixture.invalid', getRtmpHost() {}, getRtmpPort() {}, apiFetch: async () => Response.json({ success: true, url }) },
    })
    await assert.rejects(api.getWatchPlaybackUrl('ROOM'))
  }
  let base = 'https://first.invalid'
  const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
    react: { useEffect() {}, useState() {}, useCallback: fn => fn },
    '@/lib/api': { getApiUrl: () => base, getRtmpHost() {}, getRtmpPort() {}, apiFetch: async () => { base = 'https://second.invalid'; return Response.json({ success: true, url: '/live/ROOM.flv?ticket=first-server-only' }) } },
  })
  await assert.rejects(api.getWatchPlaybackUrl('ROOM'), /服务器连接已变更/)
})

test('a denied viewer can retry admission without a publisher key and superseded requests are aborted', async () => {
  const slots = [], requests = []
  let cursor, effect, cleanup, previousDeps, changed
  const api = await load('../src/upstream/modules/screen-sharing/streamPushApi.ts', {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
      useCallback: fn => fn,
      useEffect(fn, deps) { changed = !previousDeps || deps.some((v, i) => v !== previousDeps[i]); previousDeps = deps; effect = fn },
    },
    '@/lib/api': { getApiUrl: () => 'https://fixture.invalid/prefix', getRtmpHost() {}, getRtmpPort() {}, apiFetch: (path, { signal }) => new Promise(resolve => requests.push({ path, signal, resolve })) },
  })
  const render = (room = 'ROOM') => { cursor = 0; const state = api.useWatchPlayback(room); if (changed) { cleanup?.(); cleanup = effect() } return state }
  render()
  requests[0].resolve(Response.json({ success: false, message: '请先入房' }, { status: 403 }))
  await new Promise(done => setImmediate(done))
  const denied = render()
  assert.equal(denied.error, '请先入房')
  denied.retry()
  assert.equal(render().url, '')
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests.length, 2)
  requests[1].resolve(Response.json({ success: true, url: '/live/ROOM.flv?ticket=view-only' }))
  await new Promise(done => setImmediate(done))
  assert.equal(render().url, 'https://fixture.invalid/prefix/live/ROOM.flv?ticket=view-only')
  assert.equal(render('NEXT').url, '')
  assert.equal(requests[1].signal.aborted, true)
  assert(requests.every(({ path }) => path.startsWith('/api/stream-push/watch/')))
  cleanup()
})

test('local movie playback binds movieId while unpublished root previews retain path', async () => {
  const api = await load('../src/upstream/modules/server-files/serverFilesApi.ts', { '@/lib/api': { apiFetch() {}, getApiUrl() {} } })
  assert.equal(api.buildServerFileProxyUrl('uploads:/private-note.txt', 17), '/api/server-files/proxy?movieId=17')
  assert.equal(api.buildServerFileProxyUrl('uploads:/preview.mkv'), '/api/server-files/proxy?path=uploads%3A%2Fpreview.mkv')
})

test('subtitle failure and oversized content are rejected before any parsing or selection', async () => {
  const api = await load('../src/upstream/components/VideoPlayer/subtitleResponse.ts')
  for (const response of [Response.json({ success: false, code: 'SUBTITLE_TOO_LARGE' }, { status: 413 }), Response.json({ success: false, message: '权限已失效' }, { status: 403 }), Response.json({ success: true, content: 'x'.repeat(2 * 1024 * 1024 + 1), format: 'srt' }), Response.json({ success: true, content: 'inert fixture', format: 'html' })]) await assert.rejects(api.readSubtitleLoadResponse(response))
  const result = await api.readSubtitleLoadResponse(Response.json({ success: true, content: '1\n00:00:00,000 --> 00:00:01,000\nfixture', filename: 'ok.srt', format: 'srt' }))
  assert.equal(result.filename, 'ok.srt')
})
