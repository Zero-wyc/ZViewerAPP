import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Server } from 'socket.io'
import { io } from 'socket.io-client'
import { loadTs } from './test-ts-module.mjs'

const flush = () => new Promise(resolve => setImmediate(resolve))
const { createSocketRecovery } = loadTs('src/upstream/hooks/socketRecovery.ts')

test('socket recovery deduplicates refresh and stops on rejection, network failure or cancellation', async () => {
  for (const outcome of ['success', 'rejected', 'network', 'cancelled', 'switched']) {
    let finish, refreshes = 0, connects = 0, rejected = 0, current = true, status = ''
    const recovery = createSocketRecovery({
      refresh: () => {refreshes++; return new Promise(resolve => {finish = resolve})},
      current: () => current, expired: () => outcome === 'rejected',
      connect: () => connects++, reject: () => rejected++, status: s => {status = s},
    })
    const first = recovery.recover(), second = recovery.recover()
    assert.equal(first, second)
    await flush()
    if (outcome === 'cancelled') recovery.cancel()
    if (outcome === 'switched') current = false
    finish(outcome === 'success' || outcome === 'cancelled' || outcome === 'switched')
    await first
    assert.equal(refreshes, 1)
    assert.equal(connects, outcome === 'success' ? 1 : 0)
    assert.equal(rejected, outcome === 'rejected' ? 1 : 0)
    if (outcome === 'network') {
      assert.match(status, /重试/)
      await recovery.recover(); assert.equal(refreshes, 1, 'no refresh loop')
      const retry = recovery.retry(); await flush(); finish(true); await retry
      assert.equal(connects, 1)
    }
  }
})

function store(initial) {
  let state = initial
  const use = selector => selector ? selector(state) : state
  use.getState = () => state
  use.setState = patch => {state = {...state, ...patch}}
  return use
}

test('real Socket.IO server disconnect refreshes the shared hook, reconnects and joins with a new socket', async () => {
  const http = createServer(), server = new Server(http)
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const url = `http://127.0.0.1:${http.address().port}`
  let token = 'expired', refreshes = 0, connections = 0
  const joins = []
  const auth = store({autoLoginStatus: 'done', user: {id: '4', role: 'user'}, logout() {auth.setState({user: null})}})
  server.on('connection', socket => {
    connections++
    socket.on('request-join', (_payload, ack) => {joins.push(socket.id); ack({success: true, message: '已加入房间'})})
    if (connections === 1) setTimeout(() => socket.disconnect(true), 60)
  })
  const hooks = loadTs('src/upstream/hooks/useSocket.ts', {
    react: {useEffect: fn => fn()},
    'socket.io-client': {io}, zustand: {create: fn => store(fn())},
    '@/store/authStore': {useAuthStore: auth},
    '@/lib/api': {getSocketUrl: () => url, refreshAccessToken: async () => {refreshes++; token = 'renewed'; return true}, hasExpiredSession: () => false, cancelAuthRefresh() {}},
    '@/lib/authTransport': {buildSocketAuth: () => ({token}), clearAuthTokens() {}},
    '@/lib/mediaTeardown': {dispatchRoomMediaTeardown() {}}, './socketRecovery': {createSocketRecovery},
  }, {URL})
  hooks.useSocket()
  const socket = hooks.useSocket().socket
  const restored = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Socket did not recover')), 4000)
    socket.on('connect', () => socket.emit('request-join', {roomId: 'room'}, ack => {
      assert.equal(ack.success, true)
      if (joins.length === 2) {clearTimeout(timeout); resolve()}
    }))
  })
  try {
    await restored
    assert.equal(refreshes, 1); assert.equal(connections, 2)
    assert.notEqual(joins[0], joins[1]); assert.equal(typeof socket.auth, 'function')
    assert.equal(server.sockets.sockets.get(socket.id).handshake.auth.token, 'renewed')
    assert.equal(hooks.useSocket().connected, true)
  } finally {hooks.resetSocket(); await new Promise(resolve => server.close(resolve)); http.close()}
})

function apiHarness(fetch) {
  let selected = 'https://server.test/base'
  const tokens = [], events = [], exports = {}
  const code = readFileSync('src/upstream/lib/api.ts', 'utf8')
  const body = stripTypeScriptTypes(code.slice(code.indexOf('type RequestOptions'))).replace(/export /g, '')
  runInNewContext(body+';Object.assign(exports,{apiFetch,refreshAccessToken,cancelAuthRefresh,resetSessionExpired,hasExpiredSession})', {
    exports, fetch, AbortSignal, URL, connectionUrl: url => url,
    getApiUrl: () => selected, getRefreshToken: () => 'fixture-refresh', saveAuthTokens: (...args) => tokens.push(args), buildAuthHeaders: () => ({}),
    CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options.detail}},
    window: {dispatchEvent: event => events.push(event)},
  })
  return {...exports, tokens, events, switchServer: url => {selected = url}}
}

test('REST 403 stays a business denial; admission denial signals once without refreshing credentials', async () => {
  const calls = []
  const api = apiHarness(async url => {calls.push(url); return Response.json({message: '请先通过房间准入验证'}, {status: 403})})
  const response = await api.apiFetch('/api/rooms/room/movies')
  assert.equal(response.status, 403); assert.equal(calls.length, 1)
  assert.equal(api.events.length, 1); assert.equal(api.events[0].type, 'zviewer:room-access-denied')
  assert.equal((await response.json()).message, '请先通过房间准入验证', 'notification does not consume caller response')
})

test('401 refreshes only once; stale logout/server-switch responses cannot overwrite or replay another identity', async () => {
  for (const kind of ['normal', 'logout', 'switch']) {
    let finish, calls = 0
    const api = apiHarness(async url => {
      calls++
      if (url.endsWith('/refresh')) return new Promise(resolve => {finish = resolve})
      return Response.json({}, {status: calls === 1 ? 401 : 200})
    })
    const task = api.apiFetch('/api/rooms/room/movies')
    await flush()
    if (kind === 'logout') api.cancelAuthRefresh()
    if (kind === 'switch') api.switchServer('https://different.test')
    finish(Response.json({success: true, accessToken: 'new-token'}))
    const response = await task
    assert.equal(calls, kind === 'normal' ? 3 : 2)
    assert.equal(api.tokens.length, kind === 'normal' ? 1 : 0)
    assert.equal(response.status, kind === 'normal' ? 200 : 401)
  }
})

test('a late 401 from the previous server never refreshes the newly selected identity', async () => {
  let finish, calls = 0
  const api = apiHarness(async () => {calls++;return new Promise(resolve => {finish = resolve})})
  const request = api.apiFetch('/api/rooms/room/movies')
  api.switchServer('https://new.test')
  finish(Response.json({}, {status:401}))
  assert.equal((await request).status,401);assert.equal(calls,1)
})

test('repeated successful handshakes followed by forced disconnects have a bounded refresh budget', async () => {
  let refreshes = 0, status = ''
  const recovery = createSocketRecovery({refresh:async()=>{refreshes++;return true},current:()=>true,expired:()=>false,connect(){},reject(){},status:s=>{status=s}})
  for(let i=0;i<5;i++){recovery.connected();await recovery.disconnected()}
  assert.equal(refreshes,3);assert.match(status,/连续断开/)
  await recovery.retry();assert.equal(refreshes,4)
})

test('ordinary owner has REST control; guests, playback roles and non-owners do not', () => {
  const {canReorderPlaylist} = loadTs('src/upstream/modules/room/components/playlistOrder.ts')
  for (const role of ['user', 'admin']) {
    assert.equal(canReorderPlaylist(role, '4', 4), true)
    assert.equal(canReorderPlaylist(role, '5', 4), false)
    assert.equal(canReorderPlaylist(role, '4', null), false)
  }
  assert.equal(canReorderPlaylist('guest', '0', 0), false)
  assert.equal(canReorderPlaylist(undefined, '4', 4), false)
  assert.equal(canReorderPlaylist('root', '9', null), true)
})

function roomHarness(asHost = false) {
  const handlers = new Map(), events = new Map(), cleanups = [], states = [], emitted = [], teardown = []
  const room = {roomId: 'room', movies: [{id: 7}], reset() {}, exitRoom() {}, setRoomId() {}, setActiveRoomId() {}, setRoomName() {}, setRoomOwnerUserId(id) {this.roomOwnerUserId = id}}
  const socket = {id: 'socket1', connected: true, on: (name, fn) => handlers.set(name, fn), off: name => handlers.delete(name),
    disconnect() {socket.connected = false; handlers.get('disconnect')?.()}, connect() {},
    timeout() {return this}, emit: (...args) => emitted.push(args)}
  const hooks = loadTs('src/mobile/useMobileRoom.ts', {
    react: {useRef: value => ({current: value}), useCallback: fn => fn,
      useEffect: fn => cleanups.push(fn()), useState: value => {const state = {value}; states.push(state); return [value, v => {state.value = typeof v === 'function' ? v(state.value) : v}]}},
    '@/store/roomStore': {useRoomStore: {getState: () => room}},
    '@/store/authStore': {useAuthStore: {getState: () => ({user: {id: '4', role: 'user'}})}},
    '@/lib/api': {getApiUrl: () => 'https://server.test'},
    '@/store/danmakuStore': {useDanmakuStore: {getState: () => ({setRoomId() {}, loadTracks() {}, loadMeta() {}})}},
    '@/lib/mediaTeardown': {dispatchRoomMediaTeardown: value => teardown.push(value)},
  }, {URL, setTimeout, clearTimeout, CustomEvent: class {constructor(type) {this.type = type}},
    window: {dispatchEvent() {}, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name)}})
  hooks.useMobileRoom(socket, 'room', {asHost})
  const reply = (data = {}) => emitted.at(-1)[2](null, {success: true, message: '已加入房间', data})
  return {socket, handlers, events, cleanups, states, emitted, teardown, room, reply}
}

test('resource 403 re-enters admission at most once and terminal room events cannot revive media', () => {
  const h = roomHarness()
  h.reply(); assert.equal(h.states[0].value, 'ready')
  const denied = () => h.events.get('zviewer:room-access-denied')({detail: {server: 'https://server.test', url: 'https://server.test/api/emby/movie-source?movieId=7'}})
  denied(); assert.equal(h.emitted.length, 2); assert.equal(h.states[0].value, 'joining')
  h.reply(); denied(); assert.equal(h.emitted.length, 2); assert.equal(h.states[0].value, 'error')
  h.handlers.get('viewer-kicked')({}); h.handlers.get('connect')()
  assert.equal(h.states[0].value, 'closed'); assert.equal(h.emitted.length, 2)
  h.handlers.get('join-approved')({roomId: 'room'}); assert.equal(h.states[0].value, 'closed')
})

test('verified host registration records persistent owner; disconnect invalidates late acks and ownership', () => {
  const h = roomHarness(true)
  h.reply(); assert.equal(h.room.roomOwnerUserId, 4)
  h.handlers.get('disconnect')(); assert.equal(h.room.roomOwnerUserId, null)
  h.reply(); assert.equal(h.states[0].value, 'connecting')
  h.handlers.get('connect')(); h.reply()
  assert.equal(h.states[0].value, 'ready')
  h.handlers.get('host-transferred')({newHostSocketId: 'other', oldHostSocketId: 'socket1', newOwnerUserId: 5})
  assert.equal(h.room.roomOwnerUserId, 5)
})
