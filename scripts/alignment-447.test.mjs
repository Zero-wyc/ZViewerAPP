import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'

const root = new URL('../src/upstream/', import.meta.url)
const auto = loadTs(new URL('modules/room/watch-together/autoContinue.ts', root))
const order = loadTs(new URL('modules/room/components/playlistOrder.ts', root))
const read = path => readFileSync(new URL(path, root), 'utf8')
test('selected Bili URL is parsed immediately; permission and missing native proxy block resolution', async () => {
  const code = read('modules/room/components/MoviePushPanel.tsx')
  const start = code.indexOf('  const handleResolve = async'), end = code.indexOf('  const handleQualityChange', start)
  const calls = [], errors = []
  const sandbox = { exports: {}, isHost: true, roomId: 'room', sourceType: 'bilibili', url: 'https://www.bilibili.com/video/BVold',
    message: { info: msg => errors.push(msg), warning: msg => errors.push(msg), error: msg => errors.push(msg) },
    setLoading: () => {}, setResolveProgress: () => {}, setResolvedMovie: () => {}, setShowPageSelector: () => {},
    extractBvid: url => { calls.push(['bvid', url]); return 'BVselected' }, extractBangumiId: url => { calls.push(['pgc', url]); return null },
    getActiveCliProxyUrl: () => null, isEmbeddedBilibiliHost: () => false,
    resolveBilibili: async url => { calls.push(['resolve', url]); return { duration: 10 } }, resolvedViaCliRef: { current: false },
    console: { error: () => {}, warn: () => {} },
  }
  runInNewContext(stripTypeScriptTypes(code.slice(start, end)) + ';exports.resolve = handleResolve', sandbox)
  const selected = 'https://www.bilibili.com/video/BVnew'
  await sandbox.exports.resolve(selected)
  assert.deepEqual(calls, [['bvid', selected], ['pgc', selected], ['resolve', selected]])
  calls.length = 0; sandbox.isHost = false; await sandbox.exports.resolve(selected); assert.equal(calls.length, 0)
  sandbox.isHost = true; sandbox.isEmbeddedBilibiliHost = () => true; await sandbox.exports.resolve(selected)
  assert.equal(calls.some(([kind]) => kind === 'resolve'), false); assert.ok(errors.some(msg => msg.includes('本机 B 站代理不可用')))
})
test('player remount preserves auto continue; a real host role change invalidates it', () => {
  const code = read('modules/room/watch-together/useWatchTogether.ts')
  const start = code.indexOf('    if (isHostRef.current !== isHost)'), end = code.indexOf('  }, [isHost])', start)
  const state = { autoContinueEnabled: true, autoContinueRevision: 4 }, ref = { current: true }
  const run = host => runInNewContext(stripTypeScriptTypes(code.slice(start, end)), { isHost: host, isHostRef: ref, useRoomStore: { setState: update => Object.assign(state, update(state)) } })
  run(true); assert.equal(state.autoContinueEnabled, true); assert.equal(state.autoContinueRevision, 4)
  run(false); assert.equal(state.autoContinueEnabled, false); assert.equal(state.autoContinueRevision, 5)
})
test('danmaku additions stay open, isolate sources, reject duplicates and allow failed retries', async () => {
  const code = read('modules/room/watch-together/DanmakuSearchModal.tsx')
  const start = code.indexOf('  const handleAddEpisode ='), end = code.indexOf('  const handleBack =', start)
  const state = { roomId: 'r', tracks: [] }, calls = [], notices = [], addBusy = { current: false }
  let fail = false
  const sandbox = { exports: {}, source: 'bilibili-video', selectedResult: { title: 'Show' }, roomId: 'r', addBusy,
    useDanmakuStore: { getState: () => state }, setAddingEpisodeId: () => {},
    fetchDanmaku: async () => [], addTrack: async (id, label, source) => { calls.push(id); if (fail) throw Error('403'); state.tracks.push({ trackId: id, source }) },
    message: { success: value => notices.push(value), error: value => notices.push(value) }, console: { error: () => {} },
    onClose: () => { throw Error('Must remain open') },
  }
  runInNewContext(stripTypeScriptTypes(code.slice(start, end)) + ';exports.add = handleAddEpisode', sandbox)
  await sandbox.exports.add({ id: '1', title: 'Episode' }); await sandbox.exports.add({ id: '1', title: 'Episode' }); assert.deepEqual(calls, ['bilibili-video:1'])
  sandbox.source = 'dandanplay'; await sandbox.exports.add({ id: '1', title: 'Episode' }); assert.equal(state.tracks.length, 2)
  fail = true; await sandbox.exports.add({ id: '2', title: 'Episode' }); assert.equal(state.tracks.length, 2); assert.equal(addBusy.current, false)
  fail = false; await sandbox.exports.add({ id: '2', title: 'Episode' }); assert.equal(state.tracks.length, 3)
  state.tracks = []; await sandbox.exports.add({ id: '1', title: 'Episode' }); assert.equal(state.tracks.length, 1)
})
test('sorting follows REST root/admin-owner permissions, including transferred hosts', () => {
  for (const role of ['guest', 'user', 'admin']) assert.equal(order.canReorderPlaylist(role, '2', 1), false)
  assert.equal(order.canReorderPlaylist('admin', '2', 2), true)
  assert.equal(order.canReorderPlaylist('admin', '2', null), false)
  assert.equal(order.canReorderPlaylist('root', '2', null), true)
})
test('touch moves submit the full list and reject search, deleted items and bounds', () => {
  const movies = [{ id: 4 }, { id: 2 }, { id: 9 }]
  assert.deepEqual(Array.from(order.movePlaylistItem(movies, 2, -1, '')), [2, 4, 9])
  assert.deepEqual(Array.from(order.movePlaylistItem(movies, 2, 1, '')), [4, 9, 2])
  for (const [id, dir, search] of [[4, -1, ''], [9, 1, ''], [88, 1, ''], [2, 1, 'test']]) assert.equal(order.movePlaylistItem(movies, id, dir, search), null)
  assert.deepEqual(movies.map(m => m.id), [4, 2, 9])
})
test('sorting failures never change authoritative state and propagate 403/network errors', async () => {
  const code = read('store/roomStore.ts')
  const method = code.slice(code.indexOf('  reorderMovies: async'), code.lastIndexOf('\n}))'))
  for (const network of [false, true]) {
    let request
    const sandbox = { exports: {}, jsonHeaders: () => ({}), parseResponse: async r => r.json(), apiFetch: async (path, init) => {
      request = { path, body: JSON.parse(init.body) }
      if (network) throw Error('offline')
      return { ok: false, json: async () => ({ success: false, message: '没有权限' }) }
    } }
    runInNewContext(stripTypeScriptTypes('exports.store = ({' + method + '})'), sandbox)
    await assert.rejects(sandbox.exports.store.reorderMovies('r /1', [3, 1]), network ? /offline/ : /没有权限/)
    assert.equal(request.path, '/api/rooms/r%20%2F1/movies/reorder')
    assert.deepEqual(request.body.orderedIds, [3, 1])
  }
})
test('auto continue uses latest ordering; repeats cannot skip; final item never loops', async () => {
  let snapshot = { eligible: true, key: 'load1', currentId: 1, movies: [{ id: 1 }, { id: 3 }, { id: 2 }] }
  const selected = [], errors = []; let ends = 0, finish
  const handler = auto.createAutoContinueHandler({ read: () => snapshot, play: id => { selected.push(id); return new Promise(resolve => { finish = resolve }) }, onEnd: () => ends++, onError: error => errors.push(error) })
  const pending = handler.ended(); await handler.ended(); assert.deepEqual(selected, [3]); finish(); await pending; await handler.ended(); assert.deepEqual(selected, [3])
  snapshot = { ...snapshot, key: 'load2', currentId: 2 }; await handler.ended(); await handler.ended(); assert.equal(ends, 1)
  assert.deepEqual(errors, [])
})
test('disabled, viewer, preview and screen-share eligibility never advance; deletion stops retries', async () => {
  let snapshot = { eligible: false, key: '1', currentId: 1, movies: [{ id: 1 }, { id: 2 }] }, guard, reject
  let calls = 0, errors = 0
  const handler = auto.createAutoContinueHandler({ read: () => snapshot, play: (_id, current) => { calls++; guard = current; return new Promise((_resolve, fail) => { reject = fail }) }, onEnd: () => {}, onError: () => errors++ })
  await handler.ended(); assert.equal(calls, 0)
  snapshot.eligible = true; const pending = handler.ended(); assert.equal(guard(), true)
  snapshot.movies = [{ id: 1 }]; assert.equal(guard(), false); reject(Error('deleted')); await pending; assert.equal(errors, 0)
})
test('leave, host transfer and toggle revision cancel pending continuation, including off/on', async () => {
  for (const action of ['dispose', 'transfer', 'off-on']) {
    let snapshot = { eligible: true, key: '1:rev1', currentId: 1, movies: [{ id: 1 }, { id: 2 }] }, guard, reject
    let errors = 0
    const handler = auto.createAutoContinueHandler({ read: () => snapshot, play: (_id, current) => { guard = current; return new Promise((_resolve, fail) => { reject = fail }) }, onEnd: () => {}, onError: () => errors++ })
    const pending = handler.ended()
    if (action === 'dispose') handler.dispose()
    if (action === 'transfer') snapshot.eligible = false
    if (action === 'off-on') snapshot.key = '1:rev3'
    assert.equal(guard(), false); reject(Error('late response')); await pending; assert.equal(errors, 0)
  }
})
test('auto continue errors are surfaced without optimistic selection or repeated ended requests', async () => {
  let calls = 0, errors = 0
  const snapshot = { eligible: true, key: '1', currentId: 1, movies: [{ id: 1 }, { id: 2 }] }
  const handler = auto.createAutoContinueHandler({ read: () => snapshot, play: async () => { calls++; throw Error('timeout') }, onEnd: () => {}, onError: () => errors++ })
  await handler.ended(); await handler.ended(); assert.equal(calls, 1); assert.equal(errors, 1); assert.equal(snapshot.currentId, 1)
})
test('Emby/Jellyfin posters use the chosen server and native exception channel without tokens', () => {
  const transport = loadTs(new URL('../src/platform/connectionTransport.ts', import.meta.url), {}, { URL })
  let base = 'http://selected.example/base'
  const api = loadTs(new URL('modules/emby/embyApi.ts', root), {
    '@/lib/api': { apiFetch: () => {}, getApiUrl: () => base },
    '../../../platform/connectionTransport': transport,
    '@/modules/direct-link/directLinkApi': { buildProxyUrl: () => {} },
  }, { URLSearchParams })
  for (const scheme of ['http', 'https']) for (const kind of ['emby', 'jellyfin']) {
    base = `${scheme}://selected.example/base`
    const url = new URL(api.buildEmbyImageUrl(7, 'item/a?', 'tag/?', kind))
    assert.equal(url.origin, `${scheme}://selected.example`)
    assert.equal(url.pathname, `/base/api/${kind}/mounts/7/image`)
    assert.equal(url.searchParams.get('itemId'), 'item/a?'); assert.equal(url.searchParams.get('tag'), 'tag/?')
    assert.deepEqual([...url.searchParams.keys()], ['itemId', 'tag', 'maxWidth'])
  }
  transport.bindConnectionTransport(base, 'http://127.0.0.1:9988/private/base')
  assert.ok(api.buildEmbyImageUrl(7, 'a', 'b', 'jellyfin').startsWith('http://127.0.0.1:9988/private/base/api/jellyfin/'))
  assert.equal(api.buildEmbyImageUrl(7, 'a'), null)
})
test('native back consumes the top panel first and disposes handlers independently', () => {
  const stack = loadTs(new URL('components/ui/overlayBack.ts', root)), events = []
  const closeParent = stack.registerOverlayBack(() => events.push('parent'))
  const closeChild = stack.registerOverlayBack(() => events.push('child'))
  assert.equal(stack.consumeOverlayBack(), true); closeChild(); assert.equal(stack.consumeOverlayBack(), true); closeParent(); assert.equal(stack.consumeOverlayBack(), false)
  assert.deepEqual(events, ['child', 'parent'])
})
