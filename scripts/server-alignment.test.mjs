import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { create } from 'zustand'

async function load(file, exports = {}) {
  const context = createContext({ URL, URLSearchParams, Response, Error, console })
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL(file, import.meta.url), 'utf8')), { context })
  await module.link(specifier => {
    const values = specifier === 'zustand' ? { create } : exports
    return new SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value) }, { context })
  })
  await module.evaluate()
  return module.namespace
}

test('NCM unavailable survives consumed JSON, preserves account state and can recover', async () => {
  let available = false
  const account = { loggedIn: true, nickname: 'fixture' }
  const api = await load('../src/upstream/modules/music/musicApi.ts', {
    apiGet: async () => {
      const response = Response.json(available ? { code: 200, result: [1] } : { code: 'NCM_UNAVAILABLE' }, { status: available ? 200 : 503 })
      const data = await response.json()
      return { response, data, ok: response.ok, status: response.status }
    },
    apiPost: async () => {}, apiFetch: async () => Response.json({}),
  })
  await assert.rejects(api.apiGet('/api/music/ncm/banner'), e => e.status === 503 && e.code === 'NCM_UNAVAILABLE')
  assert.equal(api.useMusicService.getState().error, api.NCM_UNAVAILABLE_MESSAGE)
  assert.equal(account.loggedIn, true)
  available = true
  api.useMusicService.setState(s => ({ error: null, revision: s.revision + 1 }))
  const result = await api.apiGet('/api/music/ncm/banner')
  assert.equal(result.data.result[0], 1)
})

test('in-process NCM errors preserve msg/code, keep generic 503 local, and isolate cloud login failures', async () => {
  for (const [status, body] of [[401, { code: 301, msg: '请先登录网易云账号' }], [502, { code: 'UPSTREAM_ERROR', message: 'NCM 请求失败' }], [503, { code: 'BUSY', msg: '上游繁忙，请重试' }]]) {
    const requests = []
    const api = await load('../src/upstream/modules/music/musicApi.ts', {
      apiGet: async (url, options) => { requests.push(options); const response = Response.json(body, { status }); return { response, data: await response.json() } },
      apiPost: async () => {},
      apiFetch: async (url, options) => { requests.push(options); return Response.json(body, { status }) },
    })
    for (const [invoke, url] of [[api.apiGet, '/api/music/ncm/user/cloud'], [api.apiFetch, '/api/music/cloud/upload']]) {
      await assert.rejects(invoke(url), error => error.status === status && error.code === body.code && error.message === (body.message || body.msg))
    }
    assert.equal(requests.length, 2)
    assert.ok(requests.every(options => options._retried === true))
    assert.equal(api.useMusicService.getState().error, null)
  }
})

test('direct resolution retains HTTP and business errors rather than returning a stale URL', async () => {
  for (const [status, code] of [[403, 'ROOM_FORBIDDEN'], [401, 'AUTH_FAILED'], [404, 'MOUNT_NOT_FOUND'], [400, 'INTERNAL_NETWORK_FORBIDDEN'], [502, 'UNREACHABLE']]) {
    const api = await load('../src/upstream/modules/direct-link/directLinkApi.ts', {
      apiFetch: async () => Response.json({ success: false, code, message: 'fixture failure' }, { status }),
    })
    await assert.rejects(api.resolveMovieDirectUrl(1), e => e.status === status && e.code === code)
  }
})

test('full playback snapshots preserve false policies and PGC metadata, clear a different source', async () => {
  const api = await load('../src/upstream/modules/sync-playback/services/state-merge.ts')
  const state = { sourceUrl: 'a', sourceType: 'bilibili', currentTime: 0, isPlaying: false, playbackRate: 1, duration: 50, playsvideoEnabled: false, hostCliEnabled: true, noProxyFallback: true, epId: 1, seasonId: 2, seasonTitle: 'fixture', preview: false }
  const built = api.buildStateFromVideo(null, state)
  for (const key of ['playsvideoEnabled', 'hostCliEnabled', 'epId', 'seasonId', 'seasonTitle', 'preview']) assert.equal(built[key], state[key])
  const next = api.restoreStateSnapshot(state, { sourceUrl: 'b', sourceType: 'url', currentTime: 0, isPlaying: false, playbackRate: 1, duration: 0 })
  assert.equal(next.playsvideoEnabled, undefined)
  assert.equal(next.hostCliEnabled, undefined)
  assert.equal(next.preview, undefined)
})
