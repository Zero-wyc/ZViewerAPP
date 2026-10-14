import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'
import Hls from 'hls.js'

function harness(origin, server, tunnel, LoaderBase) {
  const stored = new Map()
  const globals = {
    URL, URLSearchParams,
    window: { location: { origin, protocol: 'https:', hostname: new URL(origin).hostname } },
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
  }
  const auth = loadTs('src/upstream/lib/authTransport.ts', {}, globals)
  auth.saveAuthTokens('fixture-access', 'fixture-refresh')
  const transport = loadTs('src/platform/connectionTransport.ts', {}, globals)
  if (tunnel) transport.bindConnectionTransport(server,
    'http://127.0.0.1:3333/private' + new URL(server).pathname.replace(/\/$/, ''))
  const apiCode = readFileSync('src/upstream/lib/api.ts', 'utf8')
  const api = {}
  runInNewContext(stripTypeScriptTypes(apiCode.slice(apiCode.indexOf('export function getApiUrl('),
    apiCode.indexOf('/** 实时获取当前生效的 socket.io'))).replace('export ', '') + ';exports.getApiUrl=getApiUrl;',
  { ...globals, ...transport, computeApiUrl: () => server, exports: api })
  const urls = loadTs('src/mobile/serverUrl.ts', { '../platform/connectionTransport': transport }, globals)
  const proxy = loadTs('src/upstream/modules/player/services/url-proxy.ts', {
    '../../../../platform/connectionTransport': transport,
    '@/lib/api': api, '../../../../mobile/serverUrl': urls,
  }, globals)
  const helpers = loadTs('src/upstream/modules/player/services/hls-proxy.ts', {}, globals)
  const requests = []
  class BaseLoader {
    stats = { loading: { start: 0 } }
    load(context, config, callbacks) {
      assert.equal(this.stats.loading.start, 0, 'hls.js loaders are single-use')
      this.stats.loading.start = 1
      this.context = context
      this.callbacks = callbacks
      requests.push({ context, config, callbacks, loader: this })
    }
    abort() { this.aborted = true; this.callbacks?.onAbort?.(this.stats, this.context, null) }
    destroy() { this.destroyed = true }
    getCacheAge() { return 7 }
    getResponseHeader() { return 'fixture' }
  }
  const code = readFileSync('src/upstream/modules/player/engines/hls-engine.ts', 'utf8')
  const exports = {}
  runInNewContext(stripTypeScriptTypes(code.slice(code.indexOf('function createProxyLoader('),
    code.indexOf('/** 等待 hls.js'))) + ';exports.loader=createProxyLoader;', {
    ...globals, ...transport, ...proxy, ...helpers, ...api,
    Hls: { DefaultConfig: { loader: LoaderBase ?? BaseLoader } }, exports,
  })
  return { auth, proxy, transport, loader: exports.loader, requests, get request() { return requests.at(-1) } }
}

test('HLS keeps authentication and playlist bases on both mobile origins and certificate channels', () => {
  const source = 'https://cdn.example/play/show/index.m3u8'
  for (const origin of ['https://zviewer.local', 'https://localhost']) {
    for (const server of ['https://server.example', 'http://server.example:3333', 'https://server.example/base']) {
      for (const tunnel of [false, true]) {
        if (tunnel && server.startsWith('http:')) continue
        const h = harness(origin, server, tunnel)
        assert.equal(h.auth.getAccessToken(), 'fixture-access', 'HTTPS login stores media token')
        const target = h.proxy.resolveProxyUrl(source, undefined, 'hls')
        const wrapped = h.proxy.appendAuthToken(h.proxy.buildProxyUrl(source))
        assert.equal(target, source, 'plain HLS resolves to the upstream URL')
        for (const initial of [wrapped]) {
          const Loader = h.loader(initial)
          const resources = [initial, new URL('enc.key', source).href, 'https://segments.example:999/plist0.ts']
          for (let index = 0; index < resources.length; index++) {
            const expected = index === 0 ? source : resources[index]
            let responseBase
            new Loader().load({ url: resources[index] }, {}, { onSuccess: response => { responseBase = response.url } })
            const remote = new URL(h.transport.logicalConnectionUrl(h.request.context.url))
            assert.equal(remote.origin, new URL(server).origin)
            assert.equal(remote.pathname, new URL(server).pathname.replace(/\/$/, '') + '/api/stream/proxy')
            assert.equal(remote.searchParams.get('token'), 'fixture-access')
            assert.equal(remote.searchParams.get('url'), expected)
            assert.ok(!remote.searchParams.get('url').includes('fixture-access'))
            h.request.callbacks.onSuccess({ url: h.request.context.url }, {}, h.request.context, {})
            assert.equal(responseBase, expected)
            assert.equal(h.request.context.url, expected)
          }
        }
      }
    }
  }
})

test('fallback uses a fresh real hls.js loader and restores the CDN playlist base', async () => {
  const requests = []
  const previousSelf = globalThis.self
  class Xhr {
    readyState = 0
    status = 0
    open(method, url) { this.url = url; this.readyState = 1 }
    setRequestHeader() {}
    abort() { this.readyState = 0 }
    send() {
      requests.push(this.url)
      queueMicrotask(() => {
        this.status = requests.length === 1 ? 0 : 200
        this.statusText = this.status ? 'OK' : 'Network Error'
        this.responseURL = this.url
        this.responseText = '#EXTM3U\n#EXT-X-ENDLIST\n'
        this.readyState = 4
        this.onreadystatechange?.()
      })
    }
    getAllResponseHeaders() { return '' }
  }
  globalThis.self = { XMLHttpRequest: Xhr, performance, setTimeout, clearTimeout }
  try {
    const source = 'https://cdn.example/index.m3u8'
    const h = harness('https://zviewer.local', 'https://server.example', false, Hls.DefaultConfig.loader)
    const Loader = h.loader(source)
    const loader = new Loader(Hls.DefaultConfig)
    const response = await new Promise((resolve, reject) => loader.load({ url: source, responseType: 'text' }, {
      loadPolicy: Hls.DefaultConfig.manifestLoadPolicy.default,
    }, { onSuccess: resolve, onError: reject, onTimeout: () => reject(Error('timeout')), onAbort: () => reject(Error('unexpected abort')) }))
    assert.equal(requests.length, 2)
    assert.equal(requests[0], source)
    assert.equal(new URL(requests[1]).searchParams.get('token'), 'fixture-access')
    assert.equal(response.url, source)
    assert.ok(loader.stats.loaded > 0)
    loader.destroy()
  } finally { globalThis.self = previousSelf }
})

test('plain HLS preserves direct redirects, then falls back once and authenticates all subsequent proxy resources', () => {
  for (const failure of ['onError', 'onTimeout']) {
    const h = harness('https://zviewer.local', 'https://server.example', false)
    const source = 'https://cdn.example/show/index.m3u8'
    const Loader = h.loader(source)
    const loader = new Loader()
    let errors = 0, aborted = 0
    const config = { loadPolicy: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 20000, errorRetry: {}, timeoutRetry: {} } }
    loader.load({ url: source }, config, { onSuccess() {}, onError: () => errors++, onTimeout: () => errors++, onAbort: () => aborted++ })
    assert.equal(h.request.context.url, source)
    assert.equal(h.request.config.loadPolicy.maxLoadTimeMs, 6000)
    h.request.callbacks[failure]({ code: 0 }, h.request.context)
    assert.equal(h.requests.length, 2)
    assert.equal(h.requests[0].loader.aborted, true)
    assert.equal(aborted, 0, 'route change is not a user cancellation')
    const retry = new URL(h.request.context.url)
    assert.equal(retry.searchParams.get('token'), 'fixture-access')
    assert.equal(retry.searchParams.get('url'), source)
    assert.equal(h.request.config, config)
    assert.equal(loader.stats, h.request.loader.stats)
    assert.equal(loader.getCacheAge(), 7)
    h.request.callbacks[failure]({ code: 502 }, h.request.context)
    assert.equal(errors, 1)
    assert.equal(h.requests.length, 2, 'never loops between routes')
    loader.abort()
    assert.equal(aborted, 1)
    const delegated = h.request.loader
    loader.destroy()
    assert.equal(delegated.destroyed, true)
    const childUrl = 'https://cdn.example/show/enc.key'
    new Loader().load({ url: childUrl }, {}, { onSuccess() {} })
    const childProxy = new URL(h.request.context.url)
    assert.equal(childProxy.searchParams.get('token'), 'fixture-access')
    assert.equal(childProxy.searchParams.get('url'), childUrl)
  }
  const h = harness('https://localhost', 'https://server.example', false)
  const source = 'https://cdn.example/index.m3u8'
  let resolved
  new (h.loader(source))().load({ url: source }, {}, { onSuccess: response => { resolved = response.url } })
  h.request.callbacks.onSuccess({ url: 'https://redirect.example/path/index.m3u8' }, {}, h.request.context, {})
  assert.equal(resolved, 'https://redirect.example/path/index.m3u8')
})

test('noProxyFallback keeps HLS resources direct and cancellation does not start a proxy request', () => {
  const h = harness('https://zviewer.local', 'https://server.example', false)
  const source = 'https://cdn.example/index.m3u8'
  const Loader = h.loader(source, undefined, null, { noProxyFallback: true })
  for (const resource of [source, 'https://other.example/enc.key', 'http://segments.example/a.ts']) {
    let errors = 0, aborted = 0
    const loader = new Loader()
    loader.load({ url: resource }, {}, { onSuccess() {}, onError: () => errors++, onAbort: () => aborted++ })
    assert.equal(h.request.context.url, resource)
    const count = h.requests.length
    h.request.callbacks.onError({ code: 0 }, h.request.context)
    assert.equal(errors, 1)
    assert.equal(h.requests.length, count)
    loader.abort()
    assert.equal(aborted, 1)
    assert.equal(h.requests.length, count)
  }
})

test('media route matrix keeps non-HLS playback policies unchanged', () => {
  const h = harness('https://zviewer.local', 'https://server.example', false)
  const direct = h.proxy.resolveMediaRoute('https://cdn.example/video.mp4', undefined, 'mp4')
  assert.equal(direct.url, 'https://cdn.example/video.mp4')
  assert.equal(direct.allowFallback, true)

  const flv = h.proxy.resolveMediaRoute('https://cdn.example/live.flv', undefined, 'flv')
  assert.equal(flv.url, 'https://cdn.example/live.flv')
  assert.equal(flv.allowFallback, true)

  const protectedHeaders = h.proxy.resolveMediaRoute(
    'https://cdn.example/video.m3u8',
    { Referer: 'https://source.example/' },
    'hls'
  )
  assert.match(protectedHeaders.url, /\/api\/stream\/proxy\?url=/)
  assert.equal(protectedHeaders.allowFallback, false)

  const biliDash = h.proxy.resolveMediaRoute(
    'https://fixture.bilivideo.com/video.m4s',
    undefined,
    'dash'
  )
  assert.match(biliDash.url, /\/api\/stream\/proxy\?url=/)
  assert.equal(biliDash.allowFallback, false)

  const biliMp4 = h.proxy.resolveMediaRoute(
    'https://fixture.bilivideo.com/video.mp4?platform=pc',
    undefined,
    'mp4'
  )
  assert.match(biliMp4.url, /\/api\/stream\/proxy\?url=/)
  assert.equal(biliMp4.allowFallback, false)

  const biliHtml5 = h.proxy.resolveMediaRoute(
    'https://fixture.bilivideo.com/video.mp4?platform=html5',
    undefined,
    'mp4'
  )
  assert.equal(biliHtml5.url, 'https://fixture.bilivideo.com/video.mp4?platform=html5')
  assert.equal(biliHtml5.allowFallback, true)

  const local = h.proxy.resolveMediaRoute('/api/stream/file.mp4', undefined, 'mp4')
  assert.equal(local.url, 'https://server.example/api/stream/file.mp4?token=fixture-access')
  assert.equal(local.allowFallback, false)

  const cli = h.proxy.resolveMediaRoute(
    'http://127.0.0.1:9333/proxy?url=https%3A%2F%2Fcdn.example%2Fvideo.mp4',
    undefined,
    'mp4'
  )
  assert.equal(cli.url, 'http://127.0.0.1:9333/proxy?url=https%3A%2F%2Fcdn.example%2Fvideo.mp4')
  assert.equal(cli.allowFallback, false)
})
