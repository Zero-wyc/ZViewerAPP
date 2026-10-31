import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { parse } from '@babel/parser'
import { normalizeBiliPages, pickBiliPartMeta } from '../src/upstream/modules/music/utils/biliPartName.ts'
import { normalizeBilibiliInput, isBilibiliShortLink } from '../src/upstream/modules/bilibili/input.ts'

const playlistPath = '../src/upstream/modules/music/bilibiliPlaylist.ts'
const cliPath = '../src/upstream/modules/bilibili/cliApi.ts'
const pushPath = '../src/upstream/modules/room/components/MoviePushPanel.tsx'
const listenPath = '../src/upstream/modules/music/hooks/useListenTogether.ts'
const bv = 'BV1234567890'
const view = {
  bvid: bv, title: 'Collection', pic: '', duration: 9999, cid: 101, upName: 'Uploader',
  pages: [
    { page: 2, cid: 202, part: 'Second song', duration: 250 },
    { page: 1, cid: 101, part: 'First song', duration: 212 },
  ],
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function load(path, imports, globals = {}) {
  const context = createContext({
    console, URL, URLSearchParams, Response, AbortController, AbortSignal, DOMException,
    setTimeout, clearTimeout, ...globals,
  })
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context })
  await module.link(name => {
    const values = imports[name]
    assert.ok(values, `Unexpected import ${name}`)
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

async function handler(path, name, globals) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  let found
  function walk(node) {
    if (!node || typeof node !== 'object' || found) return
    if (node.type === 'VariableDeclarator' && node.id?.name === name) {
      found = node.init.type === 'CallExpression' ? node.init.arguments[0] : node.init
      return
    }
    if (node.type === 'FunctionDeclaration' && node.id?.name === name) {
      found = node
      return
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk)
      else walk(value)
    }
  }
  walk(ast)
  assert.ok(found, `Missing handler ${name}`)
  const context = createContext({ console, ...globals })
  const module = new SourceTextModule(stripTypeScriptTypes(`export const handler = ${source.slice(found.start, found.end)}`), { context })
  await module.link(() => assert.fail('extracted handlers have no imports'))
  await module.evaluate()
  return module.namespace.handler
}

function playlist(request, globals) {
  return load(playlistPath, {
    '@/modules/bilibili/bilibiliApi': { getBilibiliVideoView: request },
    './utils/neteaseImage': { portableMusicCoverUrl: value => value },
    './utils/biliPartName': { normalizeBiliPages, pickBiliPartMeta },
  }, globals)
}

async function cli({ embedded = true, requestView = async () => view } = {}) {
  const requests = []
  const proxyUrl = 'http://127.0.0.1:9333'
  const api = await load(cliPath, {
    '../../../platform/connectionTransport': { logicalConnectionUrl: value => value },
    '../../../platform/bilibiliProxy': {
      embeddedBilibiliProxy: { logout: async () => assert.fail('unexpected logout') },
      getEmbeddedProxyStatus: () => ({ proxyUrl, sessionVersion: 1 }),
      isEmbeddedBilibiliHost: () => embedded,
    },
    './nativeQualityPolicy': { getWebViewCapabilities: async () => ({}) },
    '../player/codec-capability': { assertVideoCodecSupported() {} },
    './bilibiliApi': { getBilibiliVideoView: requestView },
  }, {
    fetch: async (input, options) => {
      const url = new URL(input)
      requests.push({ url, options })
      return new Response(JSON.stringify({ success: true, videoUrl: 'https://cdn.invalid/video.mp4', format: 'mp4' }))
    },
  })
  return { api, proxyUrl, requests }
}

test('multipart metadata normalizes ordering and names the selected CID without collection duration', () => {
  const normalized = normalizeBiliPages({ ...view, pages: [...view.pages, view.pages[0], { page: 3, cid: 0 }] })
  assert.deepEqual(normalized.map(part => part.cid), [101, 202])
  assert.deepEqual(pickBiliPartMeta(view, 202, 'Fallback'), {
    name: 'Second song', album: 'Collection', durationSec: 250, multiPart: true,
  })
  assert.equal(pickBiliPartMeta({ ...view, pages: view.pages.map(({ duration, ...page }) => page) }, 202, 'Fallback').durationSec, 0)
  assert.equal(pickBiliPartMeta(view, 0, 'Fallback').name, 'First song')
  assert.equal(pickBiliPartMeta(view, 999, 'Fallback').name, 'Fallback')
  assert.equal(pickBiliPartMeta(view, 999, 'Fallback').durationSec, 0)
})

test('single-part metadata retains the video title and has finite duration fallbacks', () => {
  assert.equal(pickBiliPartMeta({ ...view, pages: [view.pages[0]] }, 202, 'Video title').name, 'Video title')
  assert.equal(pickBiliPartMeta({ ...view, pages: [{ page: 1, cid: 101 }] }, 101, 'Video title').durationSec, 9999)
  assert.equal(pickBiliPartMeta({ ...view, pages: [{ page: 1, cid: 101, duration: Infinity }] }, 101, 'Video title').durationSec, 9999)
  assert.equal(pickBiliPartMeta({ duration: Infinity }, 101, 'Video title').durationSec, 0)
})

test('blank part names and missing details retain an explicit title fallback', () => {
  const blank = { ...view, pages: view.pages.map(page => ({ ...page, part: '' })) }
  assert.equal(pickBiliPartMeta(blank, 202, 'Fallback').name, 'Collection · P2')
  assert.deepEqual(pickBiliPartMeta(null, 202, 'Fallback'), {
    name: 'Fallback', album: '', durationSec: 0, multiPart: false,
  })
})

test('detail requests are shared by concurrent naming and whole-video expansion', async () => {
  const wait = deferred()
  let calls = 0
  const api = await playlist(() => { calls++; return wait.promise })
  const first = api.resolveBiliPartMeta(bv, 101, 'Fallback')
  const second = api.resolveBiliPartMeta(bv, 202, 'Fallback')
  const parts = api.loadBilibiliParts({ ...view, title: 'Fallback' })
  wait.resolve(view)
  assert.equal((await first).name, 'First song')
  assert.equal((await second).name, 'Second song')
  assert.deepEqual(Array.from(await parts, part => part.name), ['First song', 'Second song'])
  assert.equal(calls, 1)
})

test('failed details are not cached and successful details expire after ten minutes', async () => {
  let calls = 0, now = 0
  const api = await playlist(async () => {
    if (++calls === 1) throw new Error('unavailable')
    return view
  }, { Date: class extends Date { static now() { return now } } })
  assert.equal((await api.resolveBiliPartMeta(bv, 202, 'Fallback')).name, 'Fallback')
  assert.equal((await api.resolveBiliPartMeta(bv, 202, 'Fallback')).name, 'Second song')
  await api.loadBilibiliView(bv)
  assert.equal(calls, 2)
  now = 600001
  await api.loadBilibiliView(bv)
  assert.equal(calls, 3)
})

test('recommendation payloads use selected part metadata and never collection duration', async () => {
  const convert = await handler(listenPath, 'biliRecToUpsertItem', {
    resolveBiliPartMeta: async (...args) => pickBiliPartMeta(view, args[1], args[2]),
    portableMusicCoverUrl: value => value,
  })
  const payload = await convert({ ...view, cid: 202, duration: 9999 })
  assert.equal(payload.name, 'Second song')
  assert.equal(payload.album, 'Collection')
  assert.equal(payload.durationMs, 250000)
  assert.equal(payload.biliCid, 202)
  const missing = await convert({ ...view, cid: 999, duration: 9999 })
  assert.equal(missing.durationMs, 0)
})

test('page parsing accepts only complete positive safe integer query values', async () => {
  const { api } = await cli()
  for (const input of [`${bv}?p=3`, `${bv}?foo=1&page=7#top`, `${bv}?P=2&other=1`]) {
    assert.ok(api.extractBilibiliPage(input) > 0)
  }
  for (const input of [bv, `${bv}?p=0`, `${bv}?p=-1`, `${bv}?p=2.5`, `${bv}?p=2oops`, `${bv}?p=9007199254740992`]) {
    assert.equal(api.extractBilibiliPage(input), undefined, input)
  }
})

test('embedded resolution passes the URL-selected part and explicit native options retain precedence', async () => {
  const { api, proxyUrl, requests } = await cli({ requestView: () => assert.fail('native resolution must remain local') })
  await api.resolveBilibiliViaCli(proxyUrl, `https://www.bilibili.com/video/${bv}?p=2`)
  assert.equal(requests[0].url.searchParams.get('page'), '2')
  assert.equal(requests[0].url.searchParams.has('cid'), false)
  await api.resolveBilibiliViaCli(proxyUrl, `${bv}?p=2`, 101, 64, false, true, { page: 1, qualityMode: 'manual' })
  assert.equal(requests[1].url.searchParams.get('cid'), '101')
  assert.equal(requests[1].url.searchParams.get('page'), '1')
  assert.equal(requests[1].url.searchParams.get('qualityMode'), 'manual')
})

test('external CLI fills the selected CID with page-specific cache entries and respects explicit CID', async () => {
  let calls = 0
  const { api, proxyUrl, requests } = await cli({ embedded: false, requestView: async () => { calls++; return view } })
  await api.resolveBilibiliViaCli(proxyUrl, bv, undefined, undefined, false, true, { page: 2 })
  await api.resolveBilibiliViaCli(proxyUrl, bv)
  await api.resolveBilibiliViaCli(proxyUrl, bv, undefined, undefined, false, true, { page: 2 })
  await api.resolveBilibiliViaCli(proxyUrl, bv, 303, undefined, false, true, { page: 2 })
  assert.deepEqual(requests.map(request => request.url.searchParams.get('cid')), ['202', '101', '202', '303'])
  assert.equal(calls, 2)
})

test('external CLI rejects missing selected parts instead of substituting first CID', async () => {
  const { api, proxyUrl, requests } = await cli({ embedded: false })
  await assert.rejects(api.resolveBilibiliViaCli(proxyUrl, bv, undefined, undefined, false, true, { page: 99 }), /P99/)
  assert.equal(requests.length, 0)
})

test('PGC episode and season resolution do not query UGC part metadata', async () => {
  const { api, proxyUrl, requests } = await cli({ embedded: false, requestView: () => assert.fail('PGC is not UGC') })
  await api.resolveBangumiViaCli(proxyUrl, 123)
  await api.resolveBangumiViaCli(proxyUrl, 0, undefined, undefined, false, true, { seasonId: 456 })
  assert.equal(requests[0].url.searchParams.get('epId'), '123')
  assert.equal(requests[1].url.searchParams.get('seasonId'), '456')
  assert.ok(requests.every(request => !request.url.searchParams.has('bvid')))
})

test('cancelled external part preflight cannot start a late media resolve', async () => {
  const wait = deferred(), controller = new AbortController()
  const { api, proxyUrl, requests } = await cli({ embedded: false, requestView: () => wait.promise })
  const pending = api.resolveBilibiliViaCli(proxyUrl, bv, undefined, undefined, false, true, { page: 2, signal: controller.signal })
  const reason = new Error('obsolete request')
  controller.abort(reason)
  wait.resolve(view)
  await assert.rejects(pending, error => error === reason)
  assert.equal(requests.length, 0)
})

async function push({ embedded = true, proxy = true, input = `https://www.bilibili.com/video/${bv}?p=2`, result = { ...view, cid: 202 } } = {}) {
  const { api } = await cli({ embedded })
  const calls = [], values = [], selectors = [], errors = []
  const globals = {
    isHost: true, roomId: 'room', sourceType: 'bilibili', url: input,
    normalizeBilibiliInput, isBilibiliShortLink,
    extractBvid: api.extractBvid, extractBangumiId: api.extractBangumiId, extractBilibiliPage: api.extractBilibiliPage,
    getBilibiliInputResolvePolicy: () => ({ proxyUrl: proxy ? 'http://proxy.invalid' : null, cliOnly: false }),
    isEmbeddedBilibiliHost: () => embedded,
    resolveBilibiliViaCli: async (...args) => { calls.push(['cli', ...args]); return result },
    resolveBangumiViaCli: async (...args) => { calls.push(['pgc', ...args]); return result },
    resolveBilibili: async (...args) => { calls.push(['server', ...args]); return result },
    resolvedViaCliRef: { current: false },
    setResolvedMovie: value => values.push(value),
    setShowPageSelector: value => selectors.push(value),
    setLoading() {}, setResolveProgress() {},
    message: { info() {}, warning() {}, error: value => errors.push(value) },
    CliConnectionError: api.CliConnectionError, CliResolveError: api.CliResolveError,
  }
  return { run: await handler(pushPath, 'handleResolve', globals), calls, values, selectors, errors }
}

test('changing quality retains the selected part for native and server resolution', async () => {
  const { api } = await cli()
  for (const proxy of [true, false]) {
    const calls = []
    const run = await handler(pushPath, 'handleQualityChange', {
      resolvedMovie: { ...view, cid: 202, currentPage: 2, resolvedUrl: `https://www.bilibili.com/video/${bv}` },
      url: `https://www.bilibili.com/video/${bv}`,
      normalizeBilibiliInput, isBilibiliShortLink,
      extractBvid: api.extractBvid, extractBangumiId: api.extractBangumiId, extractBilibiliPage: api.extractBilibiliPage,
      getBilibiliInputResolvePolicy: () => ({ proxyUrl: proxy ? 'http://proxy.invalid' : null, cliOnly: false }),
      isEmbeddedBilibiliHost: () => true,
      resolveBilibiliViaCli: async (...args) => { calls.push(['cli', ...args]); return view },
      resolveBilibiliWithOptions: async (...args) => { calls.push(['server', ...args]); return view },
      resolvedViaCliRef: { current: false },
      setQualityLoading() {}, setResolveProgress() {}, setResolvedMovie() {},
      message: { error: value => assert.fail(value) },
    })
    await run('64')
    if (proxy) {
      assert.equal(calls[0][3], 202)
      assert.equal(calls[0][7].page, 2)
    } else {
      assert.equal(calls[0][4].cid, 202)
      assert.equal(calls[0][4].page, 2)
    }
  }
})

test('adding a search-selected part passes the native page and skips the duplicate selector', async () => {
  const h = await push()
  await h.run()
  assert.equal(h.calls[0][7].page, 2)
  assert.equal(h.values[0].currentPage, 2)
  assert.deepEqual(h.selectors, [false])
  assert.deepEqual(h.errors, [])
})

test('server addition retains the pinned page and an unpinned video still offers parts', async () => {
  const pinned = await push({ proxy: false })
  await pinned.run()
  assert.equal(pinned.calls[0][4].page, 2)
  assert.equal(pinned.selectors[0], false)
  const unpinned = await push({ input: `https://www.bilibili.com/video/${bv}` })
  await unpinned.run()
  assert.equal(unpinned.selectors[0], true)
})

test('invalid or mismatched selected parts cannot be relabeled as a successful pinned selection', async () => {
  for (const config of [{ input: `https://www.bilibili.com/video/${bv}?p=99` }, { result: { ...view, cid: 101, currentPage: 1 } }]) {
    const h = await push(config)
    await h.run()
    assert.equal(h.values.length, 0)
    assert.match(h.errors[0], /P\d+/)
  }
})

test('PGC episode selection ignores UGC page markers and retains its episode identifier', async () => {
  const h = await push({ input: 'https://www.bilibili.com/bangumi/play/ep123?p=2' })
  await h.run()
  assert.equal(h.calls[0][0], 'pgc')
  assert.equal(h.calls[0][2], 123)
  assert.equal(h.selectors[0], true)
})

async function recommendations({ canManage = true, delayed = false } = {}) {
  const wait = deferred(), sent = [], notices = [], current = { currentKey: 'bili:current:1', queue: [], biliItem: { biliBvid: bv } }
  const socket = { connected: true, emit: (event, payload, ack) => { sent.push([event, payload]); ack?.({ success: true }) } }
  const socketRef = { current: socket }, roomIdRef = { current: 'room' }, loadRequestRef = { current: 1 }
  const convert = await handler(listenPath, 'biliRecToUpsertItem', {
    resolveBiliPartMeta: delayed ? () => wait.promise : async () => pickBiliPartMeta(view, 202, 'Fallback'),
    portableMusicCoverUrl: value => value,
  })
  const run = await handler(listenPath, 'addBiliRecommendations', {
    socketRef, roomIdRef, loadRequestRef, isHostRef: { current: false },
    useMusicStore: { getState: () => ({ ...current, markBiliRecommended() {} }) },
    musicItemKey: item => `bili:${item.biliBvid}:${item.biliCid ?? 0}`,
    fetchBiliRecs: async () => [{ ...view, cid: 202 }],
    biliRecToUpsertItem: convert, biliRecKey: item => `bili:${item.bvid}:${item.cid}`,
    message: { info: value => notices.push(value), success: value => notices.push(value), error: value => notices.push(value) },
  })
  return { run: () => run(canManage), wait, sent, notices, current, socketRef, roomIdRef, loadRequestRef }
}

test('manager queue writes and viewer requests both use resolved part names', async () => {
  for (const canManage of [true, false]) {
    const h = await recommendations({ canManage })
    assert.equal(await h.run(), 1)
    assert.equal(h.sent[0][0], canManage ? 'music:queue-upsert' : 'music:control-request')
    assert.equal(h.sent[0][1].item.name, 'Second song')
    assert.equal(h.sent[0][1].item.durationMs, 250000)
  }
})

test('part naming finishing after room, song or load changes cannot enqueue into the old session', async () => {
  for (const invalidate of [
    h => { h.roomIdRef.current = 'other-room' },
    h => { h.current.currentKey = 'ncm:2' },
    h => { h.loadRequestRef.current++ },
    h => { h.socketRef.current.connected = false },
  ]) {
    const h = await recommendations({ delayed: true })
    const pending = h.run()
    await Promise.resolve()
    invalidate(h)
    h.wait.resolve(pickBiliPartMeta(view, 202, 'Fallback'))
    await pending
    assert.equal(h.sent.length, 0)
    assert.equal(h.notices.length, 0)
  }
})

async function continuation({ delayed = false, denyFirst = false } = {}) {
  const wait = deferred(), sent = [], playing = [], notices = []
  const current = { currentKey: 'bili:current:1', playMode: 'order', biliItem: { biliBvid: bv }, queue: [] }
  const socket = { connected: true, emit(event, payload, ack) {
    sent.push([event, payload])
    ack({ success: !(denyFirst && payload.item.biliCid === 101) })
  } }
  const socketRef = { current: socket }, roomIdRef = { current: 'room' }, loadRequestRef = { current: 1 }, fmPlayRequestRef = { current: 0 }
  const convert = await handler(listenPath, 'biliRecToUpsertItem', {
    resolveBiliPartMeta: delayed ? () => wait.promise : async (_bvid, cid, title) => pickBiliPartMeta(view, cid, title),
    portableMusicCoverUrl: value => value,
  })
  let fallbacks = 0
  const run = await handler(listenPath, 'handleBiliContinue', {
    socketRef, roomIdRef, loadRequestRef, fmPlayRequestRef, isHostRef: { current: true },
    useMusicStore: { getState: () => ({ ...current, markBiliRecommended() {} }) },
    musicItemKey: item => `bili:${item.biliBvid}:${item.biliCid ?? 0}`,
    activeQueueOf: state => state.queue,
    fetchBiliRecs: async () => [{ ...view, cid: 101 }, { ...view, cid: 202 }],
    biliRecToUpsertItem: convert, biliRecKey: item => `bili:${item.bvid}:${item.cid}`,
    switchSong: () => { fallbacks++ },
    loadAndPlaySong: item => playing.push(item), broadcastSyncState() {},
    message: { info: value => notices.push(value) },
  })
  return { run, wait, sent, playing, notices, current, socketRef, roomIdRef, loadRequestRef, fmPlayRequestRef,
    get fallbacks() { return fallbacks } }
}

test('related-song continuation reuses the acknowledged first part title and duration', async () => {
  const h = await continuation()
  await h.run()
  assert.deepEqual(h.sent.map(([, payload]) => payload.item.biliCid), [202, 101])
  assert.equal(h.playing[0].name, 'First song')
  assert.equal(h.playing[0].durationMs, 212000)
  assert.match(h.notices[0], /First song/)
})

test('a rejected first recommendation cannot start as a local substitute for the queue', async () => {
  const h = await continuation({ denyFirst: true })
  await h.run()
  assert.equal(h.playing.length, 0)
  assert.equal(h.fallbacks, 1)
})

test('pause, seek, mode and room changes during part naming prevent late recommendation autoplay', async () => {
  for (const invalidate of [
    h => { h.fmPlayRequestRef.current++ },
    h => { h.current.playMode = 'repeat-one' },
    h => { h.roomIdRef.current = 'other-room' },
  ]) {
    const h = await continuation({ delayed: true })
    const pending = h.run()
    await Promise.resolve()
    invalidate(h)
    h.wait.resolve(pickBiliPartMeta(view, 101, 'Fallback'))
    await pending
    assert.equal(h.sent.length, 0)
    assert.equal(h.playing.length, 0)
    assert.equal(h.notices.length, 0)
  }
})
