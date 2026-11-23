import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { create } from 'zustand'
import { transformWithOxc } from 'vite'
import { parse } from '@babel/parser'

const source = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const upstream = path => `upstream/${path}`

async function load(path, imports = {}, globals = {}) {
  const context = createContext({ URL, URLSearchParams, AbortSignal, Error, ...globals })
  const text = await source(upstream(path))
  const javascript = path.endsWith('.tsx') ? (await transformWithOxc(text, path, { jsx: { runtime: 'automatic' } })).code : stripTypeScriptTypes(text)
  const module = new SourceTextModule(javascript, { context })
  await module.link(specifier => {
    assert.ok(Object.hasOwn(imports, specifier), `Unexpected import: ${specifier}`)
    const values = imports[specifier]
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

const localStorageFixture = () => {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}

const server = 'http://server.example:1234'
const getApiUrl = () => server

test('movie permission normalizes lists and applies privilege, deny, allow and room defaults in order', async () => {
  const { normalizeMoviePermission, canRequestMovie, memberCanRequestMovie } = await load('store/moviePermission.ts', {
    '@/lib/api': { apiFetch: undefined, safeJson: undefined },
  })
  const permission = normalizeMoviePermission({
    allowMembers: 'true', allowedUserIds: ['7', 7, 0, 8], deniedUserIds: [8],
    allowedGuestIds: [' a ', 'a', 'b', '', 7], deniedGuestIds: [' b '],
  })
  assert.equal(permission.allowMembers, false)
  assert.deepEqual([...permission.allowedUserIds], [7, 8])
  assert.deepEqual([...permission.allowedGuestIds], ['a', 'b'])
  assert.deepEqual([...permission.deniedGuestIds], ['b'])
  assert.equal(normalizeMoviePermission(null).allowMembers, false)
  const ordinary = { isHost: false, isModerator: false, canManageMovie: false }
  for (const allowMembers of [false, true]) {
    const state = { ...permission, allowMembers }
    for (const [userId, guestId, expected] of [
      [7, 'b', true], [8, 'a', false], [9, 'a', allowMembers],
      [0, ' a ', true], [0, 'b', false], [0, 'c', allowMembers], [0, undefined, allowMembers],
    ]) {
      assert.equal(canRequestMovie(state, { ...ordinary, userId, guestId }), expected)
      assert.equal(memberCanRequestMovie(state, userId, guestId), expected)
    }
  }
  assert.equal(canRequestMovie(permission, { isHost: true, guestId: 'b' }), true)
  assert.equal(canRequestMovie(permission, { isHost: false, role: 'root', guestId: 'b' }), true)
  assert.equal(canRequestMovie(permission, { ...ordinary, isModerator: true, guestId: 'b' }), false)
  assert.equal(canRequestMovie(permission, { ...ordinary, canManageMovie: true, userId: 8 }), false)
})

test('room nickname counts Unicode characters and persists distinct room values', async () => {
  const localStorage = localStorageFixture()
  const displayName = await load('modules/room/lib/displayName.ts', {}, { window: { localStorage } })
  const { isValidDisplayName, guestDefaultDisplayName, ensureRoomDisplayName } = displayName
  assert.equal(displayName.DISPLAY_NAME_MAX, 20)
  assert.equal(isValidDisplayName(`  ${'😀'.repeat(20)}  `), true)
  assert.equal(isValidDisplayName('😀'.repeat(21)), false)
  assert.equal(isValidDisplayName('  '), false)
  assert.match(guestDefaultDisplayName(), /^游客[A-Z0-9]{4}$/)
  assert.equal(ensureRoomDisplayName('a', '账号名'), '账号名')
  const guestName = ensureRoomDisplayName('b', null)
  assert.match(guestName, /^游客[A-Z0-9]{4}$/)
  assert.equal(ensureRoomDisplayName('b', '另一个账号'), guestName)
  const { useRoomDisplayNameStore } = await load('store/roomDisplayNameStore.ts', {
    zustand: { create }, '@/modules/room/lib/displayName': displayName,
  })
  assert.equal(useRoomDisplayNameStore.getState().rename('a', '  新昵称😀  '), true)
  assert.equal(useRoomDisplayNameStore.getState().rename('a', '😀'.repeat(21)), false)
  assert.equal(localStorage.getItem('zviewer.room-display-name:a'), '新昵称😀')
  assert.equal(localStorage.getItem('zviewer.room-display-name:b'), guestName)
  assert.equal(ensureRoomDisplayName('a'), '新昵称😀')
  const { roomDisplayNameScope, roomDisplayNameKey } = displayName
  const account = { id: 7, role: 'user' }
  const scopes = [
    roomDisplayNameScope(server, account),
    roomDisplayNameScope('https://other.example', account),
    roomDisplayNameScope(server, { ...account, id: 8 }),
    roomDisplayNameScope(server, { id: 7, role: 'guest' }),
  ]
  const store = useRoomDisplayNameStore.getState()
  const keys = scopes.map(scope => roomDisplayNameKey('a', scope))
  assert.equal(new Set(keys).size, 4)
  assert.equal(keys[0], `${server}|u:7|a`)
  assert.equal(keys[3], `${server}|guest|a`)
  assert.equal(store.rename('a', '仅此账号和服务器', scopes[0]), true)
  store.ensure('a', '其他服务器', scopes[1])
  store.ensure('a', '另一个账号', scopes[2])
  store.ensure('a', null, scopes[3])
  const names = useRoomDisplayNameStore.getState().names
  assert.deepEqual(keys.slice(0, 3).map(key => names[key]), ['仅此账号和服务器', '其他服务器', '另一个账号'])
  assert.match(names[keys[3]], /^游客[A-Z0-9]{4}$/)
  for (const key of keys) assert.equal(localStorage.getItem(`zviewer.room-display-name:${key}`), names[key])
})

test('Bilibili edge hosts use a Referer on stream proxy routes', async () => {
  const identity = value => value
  const media = await load('modules/player/services/url-proxy.ts', {
    '../../../../platform/connectionTransport': { connectionUrl: identity, logicalConnectionUrl: identity },
    '../../../../mobile/serverUrl': { authenticatedMediaUrl: (_server, url) => url },
    '@/lib/api': { getApiUrl },
  }, { window: { localStorage: localStorageFixture(), location: { origin: server } } })
  const referer = 'https://www.bilibili.com'
  for (const suffix of ['solseed.cn', 'szbdyd.com', 'bilivideo.cn']) {
    const address = `https://edge.${suffix}/movie.m4s`
    assert.equal(media.isBilibiliMediaUrl(address), true)
    assert.equal(media.isBilibiliMediaUrl(`https://bad${suffix}/movie.m4s`), false)
    for (const proxy of [media.buildProxyUrl(address, referer), media.resolveMediaRoute(address).url]) {
      const url = new URL(proxy)
      assert.equal(url.searchParams.get('url'), address)
      assert.equal(url.searchParams.get('referer'), referer)
    }
  }
  assert.equal(new URL(media.buildProxyUrl('https://site.example/v.mp4')).searchParams.has('referer'), false)
  const nonBiliWithHeaders = new URL(media.resolveMediaRoute('https://cdn.other.example/video.mp4', { Referer: 'https://other.example' }).url)
  assert.equal(nonBiliWithHeaders.searchParams.has('referer'), false)
})

test('crawler API resolves challenge URLs through the connection transport and uses extended timeouts', async () => {
  const timeouts = []
  const routed = []
  let proxyUrl = '/api/crawler/challenge/fixture/site'
  const api = await load('modules/crawler/api.ts', {
    '@/lib/api': {
      getApiUrl, apiGet: undefined,
      apiPost: async (url, _body, options) => {
        assert.ok(options.signal instanceof AbortSignal)
        return url.endsWith('/search')
          ? { ok: false, data: { code: 'challenge_required', details: { challengeId: 'fixture', proxyUrl } } }
          : { ok: true, data: { url: 'https://media.example/stream.m3u8' } }
      },
    },
    '../../../platform/connectionTransport': { connectionUrl: url => { routed.push(url); return `${url}?route=bridge` } },
  }, { AbortSignal: new Proxy(AbortSignal, { get(target, key) {
    if (key !== 'timeout') return Reflect.get(target, key)
    return ms => { timeouts.push(ms); return new AbortController().signal }
  } }) })
  const search = () => api.searchCrawlerSite('room', 'site', 'film')
  await assert.rejects(search(), error => error instanceof api.CrawlerChallengeError &&
    error.challenge.proxyUrl === `${server}${proxyUrl}?route=bridge`)
  assert.deepEqual(routed, [`${server}${proxyUrl}`])
  proxyUrl = 'https://server.example/verify'
  await assert.rejects(search(), error => error.challenge.proxyUrl === proxyUrl)
  await api.resolveCrawlerPlay('room', 'https://site.example/detail')
  assert.deepEqual(timeouts, [90_000, 90_000, 120_000])
  const item = { title: 'film', url: 'https://site.example/detail' }
  assert.equal(api.pickPlayableUrl(item), '')
  assert.equal(api.pickPlayableUrl({ ...item, extra: { play_url: ' https://media.example/film.mp4?t=1 ' } }), 'https://media.example/film.mp4?t=1')
  assert.equal(api.pickPlayableUrl({ ...item, url: 'https://media.example/film.m3u8#test' }), 'https://media.example/film.m3u8#test')
})

test('crawler playback refreshes the selected quality and rejects iframe results', async () => {
  const writes = []
  const headers = { Referer: 'https://site.example' }
  const format = await load('lib/mediaFormat.ts')
  const primaryUrl = 'https://media.example/hd.m3u8'
  const selectedUrl = 'https://media.example/fhd.mp4'
  let playResult = {
    url: primaryUrl, format: 'hls', title: '最新版', ruleId: 'new-rule',
    qualities: [{ name: 'HD', url: primaryUrl }, { name: 'FHD', url: selectedUrl, format: 'mp4', headers }],
  }
  const runtimeSettings = await load('modules/room/watch-together/runtime-settings.ts')
  let activeServer = server
  const state = { roomId: 'room', roomSessionRevision: 1, updateMovie: async (...args) => writes.push(args) }
  let resolution
  const playback = await load('modules/crawler/playback.ts', {
    '@/lib/api': { getLogicalApiUrl: () => activeServer },
    '@/modules/room/watch-together/runtime-settings': runtimeSettings,
    '@/lib/mediaFormat': format,
    '@/lib/antileech-proxy-url': { buildAntileechProxyUrl: (sourceType, url, actualHeaders, options) => {
      assert.equal(sourceType, 'cms')
      assert.equal(url, selectedUrl)
      assert.equal(actualHeaders, headers)
      assert.equal(options.force, true)
      assert.equal(options.relative, true)
      return '/api/stream/proxy?fixture'
    } },
    '@/store/roomStore': { useRoomStore: { getState: () => state } },
    './api': { resolveCrawlerPlay: async (roomId, pageUrl) => {
      assert.equal(roomId, 'room')
      assert.equal(pageUrl, 'https://site.example/detail')
      return resolution?.promise ?? playResult
    } },
  })
  const movie = { id: 42, title: '旧标题', sourceMeta: { kind: 'crawler', sourceId: 'fixture', pageUrl: 'https://site.example/detail' } }
  assert.equal(playback.needsCrawlerRefresh(movie), true)
  assert.equal(playback.needsCrawlerRefresh({ sourceMeta: { kind: 'crawler' } }), false)
  assert.equal(await playback.resolveCrawlerSelection('room', { ...movie, sourceMeta: null }), null)
  const primary = await playback.resolveCrawlerSelection('room', movie)
  assert.equal(primary.url, primaryUrl)
  assert.equal(primary.sourceMeta.quality, 'HD')
  const refreshed = await playback.refreshCrawlerMovie('room', movie, 'FHD')
  assert.equal(refreshed.sourceMeta.quality, 'FHD')
  const [[roomId, id, selection]] = writes
  assert.equal(roomId, 'room')
  assert.equal(id, 42)
  assert.equal(selection.url, '/api/stream/proxy?fixture')
  assert.equal(selection.format, 'mp4')
  assert.equal(selection.title, '最新版')
  assert.equal(selection.sourceMeta.quality, 'FHD')
  assert.deepEqual([...selection.sourceMeta.qualities], ['HD', 'FHD'])
  assert.equal(playback.crawlerAwarePlaybackKey(movie), playback.crawlerAwarePlaybackKey({ ...movie, ...refreshed }))
  assert.notEqual(playback.crawlerAwarePlaybackKey(movie), playback.crawlerAwarePlaybackKey({ ...movie, serverProxy: true }))
  assert.notEqual(playback.crawlerAwarePlaybackKey(movie), playback.crawlerAwarePlaybackKey({ ...movie,
    sourceMeta: { ...movie.sourceMeta, pageUrl: 'https://site.example/other' },
  }))
  for (const change of [() => { state.roomId = 'other' }, () => { state.roomSessionRevision += 1 }, () => { activeServer = 'https://other.example' }]) {
    resolution = deferred()
    const pending = playback.refreshCrawlerMovie('room', movie)
    change()
    resolution.resolve(playResult)
    assert.equal(await pending, null)
    assert.equal(writes.length, 1)
    Object.assign(state, { roomId: 'room', roomSessionRevision: 1 })
    activeServer = server
  }
  resolution = undefined
  playResult = { format: 'iframe', url: primaryUrl, note: '仅原站可播' }
  await assert.rejects(playback.refreshCrawlerMovie('room', movie), /仅原站可播/)
  assert.equal(writes.length, 1)
})

test('fullscreen portals use only the active stage and fall back for full-page and media elements', async () => {
  const body = { tagName: 'BODY' }
  const documentElement = { tagName: 'HTML' }
  const stage = { tagName: 'DIV' }
  const document = { body, documentElement, fullscreenElement: null }
  const fullscreen = await load('lib/fullscreen-utils.ts', {}, { document })
  const { resolvePortalHost } = await load('lib/portal-host.ts', {
    react: { useSyncExternalStore: undefined }, './fullscreen-utils': fullscreen,
  }, { document })
  assert.equal(fullscreen.isElementFullscreen(null), false)
  assert.equal(resolvePortalHost(), body)
  document.fullscreenElement = documentElement
  assert.equal(fullscreen.isElementFullscreen(documentElement), false)
  assert.equal(fullscreen.isElementFullscreen(stage), false)
  assert.equal(resolvePortalHost(), body)
  document.fullscreenElement = stage
  assert.equal(fullscreen.isElementFullscreen(stage), true)
  assert.equal(fullscreen.isElementFullscreen({ tagName: 'DIV', contains: () => false }), false)
  assert.equal(resolvePortalHost(), stage)
  for (const tagName of ['VIDEO', 'AUDIO', 'IMG', 'CANVAS', 'IFRAME']) {
    document.fullscreenElement = { tagName }
    assert.equal(resolvePortalHost(), body)
  }
  document.fullscreenElement = null
  document.webkitFullscreenElement = stage
  assert.equal(resolvePortalHost(), stage)
})

test('static contracts preserve playlist routing, overridable cache and room admission boundaries', async () => {
  const [music, api, mobile] = await Promise.all([
    source(upstream('modules/music/pages/MusicHomePage.tsx')),
    source(upstream('lib/api.ts')),
    source('mobile/MobileRoom.tsx'),
  ])
  assert.match(music, /titleEN="TOP LIST"(?:(?!\/>)[\s\S])*?kind="playlist"/)
  assert.match(api, /fetch\(url,\s*\{\s*cache: 'no-store',\s*\.\.\.rest,/)
  assert.match(mobile, /useRoomMoviePermission\(socket, room\.phase === 'ready' \? roomId : undefined\)/)
  assert.doesNotMatch(mobile, /live2d/i)
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('F1 accepts Go completion and external search results, and forwards the verify signal', async () => {
  let response = { ok: true, data: { success: true, completed: true } }
  const signal = new AbortController().signal
  const api = await load('modules/crawler/api.ts', {
    '@/lib/api': { apiGet: undefined, getApiUrl, apiPost: async (url, body, options) => {
      assert.equal(url, '/api/crawler/challenge/id%2Ftest/verify')
      assert.equal(body, undefined)
      assert.equal(options.signal, signal)
      return response
    } },
    '../../../platform/connectionTransport': { connectionUrl: value => value },
  })
  const verify = () => api.verifyCrawlerChallenge('id/test', signal)
  const completed = await verify()
  assert.equal(completed.completed, true)
  assert.equal(completed.result, undefined)
  const result = { success: true, items: [] }
  response = { ok: true, data: { success: true, result } }
  assert.equal((await verify()).result, result)
  response = { ok: true, data: { success: true } }
  await assert.rejects(verify(), /验证还没有完成/)
})

test('F8 a room permission broadcast wins over an in-flight GET snapshot', async () => {
  const get = deferred()
  const listeners = new Map()
  const updates = []
  let cleanup
  const socket = {
    on: (event, handler) => listeners.set(event, handler),
    off: (event, handler) => {
      assert.equal(listeners.get(event), handler)
      listeners.delete(event)
    },
  }
  const { useRoomMoviePermission } = await load('modules/room/hooks/useRoomMoviePermission.ts', {
    react: { useEffect: effect => { cleanup = effect() } },
    '@/store/roomStore': { useRoomStore: select => select({ setMoviePermission: x => updates.push(x) }) },
    '@/store/moviePermission': {
      fetchMoviePermission: () => {
        assert.ok(listeners.has('movie:permission-changed'))
        return get.promise
      },
      normalizeMoviePermission: value => value,
    },
  })
  useRoomMoviePermission(socket, 'room')
  const event = listeners.get('movie:permission-changed')
  event({ roomId: 'other', permission: { allowMembers: false } })
  event({ roomId: 'room', permission: { allowMembers: true } })
  get.resolve({ allowMembers: false })
  await flush()
  assert.deepEqual(updates, [{ allowMembers: true }])
  cleanup()
  assert.equal(listeners.size, 0)
})

// Drive the modal's real event handlers and lifecycle without a browser or network.
function modalRenderer() {
  const cells = []
  let effects = [], cursor = 0
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const hook = init => { const i = cursor++; return cells[i] ??= init() }
  const useMemo = (factory, deps) => {
    const cell = hook(() => ({}))
    if (!sameDeps(cell.deps, deps)) Object.assign(cell, { deps, value: factory() })
    return cell.value
  }
  const react = {
    useState: initial => {
      const cell = hook(() => ({ value: initial }))
      return [cell.value, next => { cell.value = typeof next === 'function' ? next(cell.value) : next }]
    },
    useRef: current => hook(() => ({ current })),
    useMemo,
    useCallback: (callback, deps) => useMemo(() => callback, deps),
    useLayoutEffect: (effect, deps) => {
      const cell = hook(() => ({}))
      if (sameDeps(cell.deps, deps)) return
      cell.deps = deps
      effects.push(() => { cell.cleanup?.(); cell.cleanup = effect() })
    },
  }
  const jsx = (type, props) => ({ type, props })
  return {
    react, jsx: { jsx, jsxs: jsx, Fragment: 'Fragment' },
    render: (Component, props) => {
      cursor = 0
      const tree = Component(props)
      const pending = effects
      effects = []
      pending.forEach(effect => effect())
      return tree
    },
  }
}

function* descendants(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* descendants(child)
  } else if (node?.props) {
    yield node
    yield* descendants(node.props.children)
  }
}
const elementText = node => Array.isArray(node) ? node.map(elementText).join('')
  : typeof node === 'string' ? node : elementTextChild(node)
const elementTextChild = node => node?.props ? elementText(node.props.children) : ''

test('F1/F3/F9/F10 crawler workers drain and queue challenges, and only the current verification can update results', async () => {
  const ui = modalRenderer()
  const calls = [], verifies = [], opened = [], successes = []
  let retrySearch
  const sites = Array.from({ length: 5 }, (_, i) => ({ id: `site${i}`, name: `站点${i}` }))
  const state = { roomId: 'room' }
  class CrawlerChallengeError extends Error {
    constructor(site) {
      super('需要验证')
      this.challenge = { id: site, proxyUrl: `http://127.0.0.1/prefix/${site}` }
    }
  }
  const icons = Object.fromEntries(['AlertTriangle', 'Check', 'ChevronDown', 'ChevronRight', 'ExternalLink', 'Film', 'Globe', 'ListVideo', 'Loader2', 'Plus', 'RefreshCw', 'Search', 'SearchX', 'ShieldCheck', 'X'].map(name => [name, name]))
  const result = { success: true, items: [] }
  const fixture = await load('modules/room/components/CrawlerSearchModal.tsx', {
    react: ui.react, 'react/jsx-runtime': ui.jsx, 'lucide-react': icons,
    '@/components/ui/FullscreenOverlay': { FullscreenOverlay: 'Overlay' },
    '@/components/ui/Button': { Button: 'Button' },
    '@/components/ui/Input': { Input: 'Input' },
    '@/components/ui/Typography': { Text: 'Text' },
    '@/components/ui/message': { message: { success: text => successes.push(text) } },
    '@/store/roomStore': { useRoomStore: select => select(state) },
    '@/lib/mediaFormat': { detectMediaFormat: undefined },
    '@/lib/antileech-proxy-url': { buildAntileechProxyUrl: undefined },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    '../../../../platform/connectionTransport': { logicalConnectionUrl: url => url.replace('http://127.0.0.1/prefix', 'https://server.example') },
    '@/modules/crawler/api': {
      CrawlerChallengeError,
      fetchCrawlerSites: async () => sites,
      pickPlayableUrl: () => '', resolveCrawlerPlay: undefined,
      searchCrawlerSite: async (...args) => {
        calls.push(args)
        if (Number(args[1].slice(-1)) < 3 && !args[4]) throw new CrawlerChallengeError(args[1])
        return args[4] && retrySearch ? retrySearch.promise : result
      },
      verifyCrawlerChallenge: (id, signal) => {
        const pending = deferred()
        verifies.push({ id, signal, ...pending })
        return pending.promise
      },
    },
  }, { AbortController, window: { open: (...args) => opened.push(args) } })
  const props = { open: true, onClose() { props.open = false } }
  const render = () => ui.render(fixture.CrawlerSearchModal, props)
  const nodes = () => [...descendants(render())]
  const find = (predicate) => {
    const node = nodes().find(predicate)
    assert.ok(node, 'expected control in the modal')
    return node
  }
  const button = text => find(n => n.type === 'Button' && elementText(n) === text).props
  const input = () => find(n => n.type === 'Input').props
  const frame = () => find(n => n.type === 'iframe').props.src
  const dismiss = () => find(n => n.type === 'button' && n.props.title === '关闭').props.onClick()
  render()
  await flush()
  input().onChange({ target: { value: '原查询' } })
  button('搜索').onClick()
  await flush()
  assert.deepEqual(calls.map(args => args[1]), sites.map(site => site.id))
  assert.equal(button('搜索').disabled, false)
  assert.equal(verifies.length, 0)
  assert.match(frame(), /site0$/)
  assert.match(elementText(render()), /当前通过安全连接桥访问/)
  button('外部打开').onClick()
  assert.deepEqual(opened, [['https://server.example/site0', '_blank', 'noopener']])

  const complete = button('我已完成').onClick
  complete()
  complete()
  assert.equal(verifies.length, 1)
  dismiss()
  assert.equal(verifies[0].signal.aborted, true)
  verifies[0].resolve({ result })
  await flush()
  assert.equal(successes.length, 0)
  assert.match(frame(), /site1$/)

  input().onChange({ target: { value: '已编辑但尚未提交' } })
  button('我已完成').onClick()
  verifies[1].resolve({ completed: true })
  await flush()
  assert.deepEqual(calls.at(-1).slice(0, 4), ['room', 'site1', '原查询', 30])
  assert.equal(calls.at(-1)[4], verifies[1].signal)
  assert.equal(successes.length, 1)
  assert.match(frame(), /site2$/)

  button('我已完成').onClick()
  render().props.onClose()
  render()
  assert.equal(verifies[2].signal.aborted, true)
  props.open = true
  render()
  await flush()
  verifies[2].resolve({ completed: true })
  await flush()
  assert.equal(calls.length, 6)
  assert.ok(!nodes().some(n => n.type === 'iframe'))

  button('搜索').onClick()
  await flush()
  retrySearch = deferred()
  button('我已完成').onClick()
  verifies[3].resolve({ completed: true })
  await flush()
  assert.equal(calls.at(-1)[4], verifies[3].signal)
  input().onChange({ target: { value: '新一轮查询' } })
  button('搜索').onClick()
  await flush()
  assert.equal(verifies[3].signal.aborted, true)
  retrySearch.resolve(result)
  await flush()
  assert.equal(successes.length, 1)
  assert.match(frame(), /site0$/)
})

function extractComponentDeclarations(text, component, names) {
  const { program } = parse(text, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const declaration = program.body.map(item => item.declaration ?? item).find(item => item.id?.name === component)
  return names.map(name => {
    const statement = declaration.body.body.find(item => item.declarations?.some(variable => variable.id.name === name))
    assert.ok(statement, `Expected ${name} in ${component}`)
    return text.slice(statement.start, statement.end)
  }).join('\n')
}

test('F7 stale global and individual permission PUT replies cannot write or notify another room session', async () => {
  const text = await source(upstream('modules/room/components/RoomInfoPanel.tsx'))
  const names = ['captureMoviePermissionSession', 'handleToggleMoviePermission', 'handleToggleMemberMoviePermission']
  const code = extractComponentDeclarations(text, 'RoomInfoPanel', names)
  for (const handler of names.slice(1)) {
    for (const change of ['room', 'revision', 'server', 'none']) {
      for (const failed of [false, true]) {
        const pending = deferred(), updates = [], notices = []
        const room = { roomId: 'room', roomSessionRevision: 1 }
        let currentServer = server
        const context = createContext({
          roomId: room.roomId, moviePermissionBusy: false, moviePermissionBusyKey: null,
          moviePermission: { allowMembers: false }, useRoomStore: { getState: () => room },
          getLogicalApiUrl: () => currentServer, updateMoviePermission: () => pending.promise,
          setMoviePermission: value => updates.push(value),
          setMoviePermissionBusy() {}, setMoviePermissionBusyKey() {},
          console: { error() {} }, Error, message: { info: value => notices.push(value), error: value => notices.push(value) },
        })
        const program = new SourceTextModule(stripTypeScriptTypes(`${code}\nexport { ${handler} }`), { context })
        await program.link(() => { throw new Error('Unexpected import') })
        await program.evaluate()
        const run = program.namespace[handler]({ guestId: 'guest' }, true)
        if (change === 'room') room.roomId = 'other'
        if (change === 'revision') room.roomSessionRevision += 1
        if (change === 'server') currentServer = 'https://other.example'
        if (failed) pending.reject(new Error('failed'))
        else pending.resolve({ allowMembers: true })
        await run
        assert.equal(updates.length, Number(change === 'none' && !failed))
        if (change !== 'none') assert.deepEqual(notices, [])
        if (failed && change === 'none') assert.deepEqual(notices, ['failed'])
      }
    }
  }
})

test('F2/F5 manual, next and autoplay commands use the host load path and its sync-state broadcast', async () => {
  const read = name => source(upstream(`modules/room/watch-together/${name}.ts`))
  const [list, watch, next, playback, remount] = await Promise.all([
    source(upstream('modules/room/components/MovieListPanel.tsx')),
    read('useWatchTogether'), read('useNextPlaylistMovie'), read('playlistPlayback'), read('usePlayerRemountKey'),
  ])
  const manual = extractComponentDeclarations(list, 'MovieListPanel', ['handlePlay'])
  assert.match(manual, /if \(!isHost && !canManage\)/)
  assert.match(manual, /emit\('play-movie'/)
  assert.doesNotMatch(manual, /refreshCrawlerMovie|updateMovie|resolveCrawlerSelection/)
  assert.match(next, /await requestPlaylistMovie\(/)
  assert.match(playback, /emit\('play-movie'/)
  assert.match(watch, /createAutoContinueHandler\([\s\S]*?emit\('play-movie'/)
  assert.match(watch, /const handleCurrentMovie[\s\S]*?setCurrentMovieId\(payload\.movieId\)/)
  assert.match(watch, /const movie = movies\.find\(\(m\) => m\.id === currentMovieId\)/)
  assert.match(watch, /else if \(needsCrawlerRefresh\(movie\)\)[\s\S]*?if \(!isCurrent\(\)\) return[\s\S]*?sourceUrl: selection\.url[\s\S]*?void write\(movie, selection\)\.catch/)
  assert.match(watch, /message\.error\(err instanceof Error[\s\S]*?resetForRetry\(err instanceof Error/)
  assert.match(watch, /sourceUrl: r\.sourceUrl/)
  assert.match(watch, /broadcastState\(applied\)/)
  assert.match(watch, /const key = `\$\{crawlerAwarePlaybackKey\(movie\)\}:\$\{retryToken\}`/)
  assert.match(remount, /\}, \[currentMovieId\]\)/)
})

test('F4 and F11 add permission and room joins use the intended identities', async () => {
  const [mobile, join, displayName] = await Promise.all([
    source('mobile/MobileRoom.tsx'), source('mobile/useMobileRoom.ts'),
    source(upstream('modules/room/hooks/useRoomDisplayName.ts')),
  ])
  assert.match(mobile, /const loggedInModerator = userId > 0 && moderators\.includes\(userId\)/)
  assert.match(mobile, /canRoomViewerPerform\(matrix, 'addMovie', \{\s*isHost: room\.isHost, isModerator: loggedInModerator, role: user\?\.role/)
  assert.match(mobile, /const canAdd = canAddByMatrix \|\| canRequestMovie\(moviePermission, \{\s*isHost: room\.isHost, role: user\?\.role, userId, guestId: myGuestId/)
  assert.match(join, /ensureRoomDisplayName\([\s\S]*?roomDisplayNameScope\(getLogicalApiUrl\(\), currentUser\)/)
  assert.match(displayName, /roomDisplayNameScope\(getLogicalApiUrl\(\), user\)/)
})
