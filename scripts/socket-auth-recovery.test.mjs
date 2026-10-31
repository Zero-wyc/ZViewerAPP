import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

function source(path) {
  return stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replace(/^export\s*\{[\s\S]*?\}\s*from '[^']+'\r?\n/gm, '')
    .replace(/\bexport (?=(?:async )?function|let|const)/g, '')
}

const flush = () => new Promise(resolve => setImmediate(resolve))

function fixture(results, refreshImplementation) {
  const listeners = new Map(), timers = new Map()
  let timerId = 0, refreshCalls = 0, expired = false, jwtExpired = false
  let server = 'http://fixture.invalid/prefix', clearedTokens = 0
  const setTimeout = (callback, delay) => {
    const id = ++timerId
    timers.set(id, { callback, delay })
    return id
  }
  const clearTimeout = id => timers.delete(id)
  const createSocketRecovery = new Function(
    'setTimeout', 'clearTimeout',
    `${source('../src/upstream/hooks/socketRecovery.ts')}\nreturn createSocketRecovery`
  )(setTimeout, clearTimeout)
  const auth = {
    user: { id: '1', role: 'user' }, autoLoginStatus: 'done', hasLoggedOut: false,
    logout() { auth.user = null; auth.hasLoggedOut = true },
  }
  const useAuthStore = Object.assign(select => select(auth), { getState: () => auth })
  const create = initialize => {
    let state = initialize()
    return Object.assign(() => state, {
      getState: () => state,
      setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) } },
    })
  }
  const socket = {
    connected: false, connects: 0,
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(handler)
      return socket
    },
    removeAllListeners() { listeners.clear() },
    connect() { socket.connects++; socket.connected = true; socket.emit('connect'); return socket },
    disconnect() { socket.drop('io client disconnect'); return socket },
    emit(event, ...args) { for (const handler of [...(listeners.get(event) ?? [])]) handler(...args) },
    drop(reason = 'io server disconnect') { socket.connected = false; socket.emit('disconnect', reason) },
    expire() { socket.emit('auth-expired', { code: 'TOKEN_EXPIRED' }); socket.drop() },
  }
  let completeRefresh
  const pending = new Promise(resolve => { completeRefresh = resolve })
  const refreshAccessToken = () => {
    refreshCalls++
    if (refreshImplementation) return refreshImplementation()
    return results ? Promise.resolve(results.shift() ?? false) : pending
  }
  const hooks = new Function(
    'useEffect', 'io', 'create', 'useAuthStore', 'getSocketUrl', 'refreshAccessToken',
    'hasExpiredSession', 'cancelAuthRefresh', 'buildSocketAuth', 'isAccessTokenExpired',
    'dispatchRoomMediaTeardown', 'clearAuthTokens', 'createSocketRecovery',
    `${source('../src/upstream/hooks/useSocket.ts')}\nreturn { useSocket, resetSocket, reconnectSocket }`
  )(
    effect => effect(), () => socket, create, useAuthStore, () => server, refreshAccessToken,
    () => expired, () => {}, () => ({}), () => jwtExpired, () => {},
    () => { clearedTokens++ }, createSocketRecovery
  )
  hooks.useSocket()
  return {
    ...hooks, socket, auth, completeRefresh,
    calls: () => refreshCalls, timers: () => timers.size, cleared: () => clearedTokens,
    expired: () => { expired = true },
    jwtExpired: () => { jwtExpired = true },
    changeServer: () => { server = 'http://other.invalid' },
    runRetry: async () => {
      const next = [...timers][0]
      assert.ok(next, 'expected an expiry retry')
      timers.delete(next[0]); next[1].callback()
      await flush()
    },
    state: () => hooks.useSocket(),
  }
}

test('expiry refreshes once for all socket subscribers and reconnects the room', async () => {
  const f = fixture()
  f.useSocket()
  let registrations = 0
  f.socket.on('connect', () => registrations++)
  f.socket.expire()
  f.socket.expire()
  await flush()
  assert.equal(f.calls(), 1)
  f.completeRefresh(true)
  await flush()
  assert.equal(f.socket.connects, 2)
  assert.equal(registrations, 1)
  assert.equal(f.state().recoveryError, '')
  f.resetSocket()
})

test('transient failures retry at most three times and retain the account', async () => {
  const f = fixture([false, false, false])
  f.socket.expire()
  await flush()
  await f.runRetry()
  await f.runRetry()
  assert.equal(f.calls(), 3)
  assert.equal(f.timers(), 0)
  assert.equal(f.socket.connects, 1)
  assert.equal(f.auth.user.role, 'user')
  assert.match(f.state().recoveryError, /恢复失败/)
  f.resetSocket()
})

test('a transient refresh failure can recover on the second attempt', async () => {
  const f = fixture([false, true])
  f.socket.expire()
  await flush()
  await f.runRetry()
  assert.equal(f.calls(), 2)
  assert.equal(f.socket.connects, 2)
  assert.equal(f.timers(), 0)
  f.resetSocket()
})

test('revoked refresh credentials clear the session without retrying', async () => {
  const f = fixture([false])
  f.expired()
  f.socket.expire()
  await flush()
  assert.equal(f.calls(), 1)
  assert.equal(f.auth.user, null)
  assert.equal(f.cleared(), 1)
  assert.equal(f.timers(), 0)
  assert.equal(f.socket.connects, 1)
})

for (const reason of ['io server disconnect', 'io client disconnect', 'ping timeout', 'transport close']) {
  test(`${reason} without an expiry notice does not refresh`, async () => {
    const f = fixture()
    f.socket.drop(reason)
    await flush()
    assert.equal(f.calls(), 0)
    assert.equal(f.socket.connects, 1)
    f.resetSocket()
  })
}

test('old servers can recover when the saved access JWT has actually expired', async () => {
  const f = fixture([true])
  f.jwtExpired()
  f.socket.drop()
  await flush()
  assert.equal(f.calls(), 1)
  assert.equal(f.socket.connects, 2)
  f.resetSocket()
})

for (const event of ['viewer-kicked', 'room-closed']) {
  test(`${event} cancels a pending refresh and an expired legacy JWT cannot revive it`, async () => {
    const f = fixture()
    f.socket.expire()
    await flush()
    f.socket.emit(event, { roomId: 'fixture-room' })
    f.jwtExpired()
    f.socket.drop()
    f.socket.emit('connect_error', new Error('认证令牌无效或已过期'))
    f.completeRefresh(true)
    await flush()
    assert.equal(f.calls(), 1)
    assert.equal(f.socket.connects, 1)
    assert.equal(f.timers(), 0)
    f.resetSocket()
  })

  test(`${event} cancels a scheduled expiry retry`, async () => {
    const f = fixture([false, true])
    f.socket.expire()
    await flush()
    assert.equal(f.timers(), 1)
    f.socket.emit(event, { roomId: 'fixture-room' })
    await flush()
    assert.equal(f.timers(), 0)
    assert.equal(f.calls(), 1)
    assert.equal(f.socket.connects, 1)
    f.resetSocket()
  })
}

for (const change of ['logout', 'identity', 'role', 'server', 'reset']) {
  test(`${change} invalidates a late refresh completion`, async () => {
    const f = fixture()
    f.socket.expire()
    await flush()
    if (change === 'logout') f.auth.logout()
    if (change === 'identity') f.auth.user = { id: '2', role: 'user' }
    if (change === 'role') f.auth.user = { id: '1', role: 'admin' }
    if (change === 'server') f.changeServer()
    if (change === 'reset') f.resetSocket()
    f.completeRefresh(true)
    await flush()
    assert.equal(f.socket.connects, 1)
    assert.equal(f.timers(), 0)
    f.resetSocket()
  })
}

test('an expiry notice is cleared across a normal transport reconnect', async () => {
  const f = fixture()
  f.socket.emit('auth-expired', { code: 'TOKEN_EXPIRED' })
  f.socket.drop('transport close')
  f.socket.connect()
  f.socket.drop()
  await flush()
  assert.equal(f.calls(), 0)
  f.resetSocket()
})

test('a malformed expiry notice cannot revive an unexpired session', async () => {
  const f = fixture()
  f.socket.emit('auth-expired', { code: 'TOKEN_INVALID' })
  f.socket.drop()
  await flush()
  assert.equal(f.calls(), 0)
  f.resetSocket()
})

test('TOKEN_INVALID does not fall back to an expired legacy JWT', async () => {
  const f = fixture()
  f.jwtExpired()
  f.socket.emit('auth-expired', { code: 'TOKEN_INVALID' })
  f.socket.drop()
  await flush()
  assert.equal(f.calls(), 0)
  f.resetSocket()
})

test('connect errors share one refresh and cannot spin after an unsuccessful attempt', async () => {
  const f = fixture([false])
  f.socket.connected = false
  f.socket.emit('connect_error', new Error('认证令牌无效或已过期'))
  f.socket.emit('connect_error', new Error('unauthorized'))
  await flush()
  f.socket.emit('connect_error', new Error('token invalid'))
  await flush()
  assert.equal(f.calls(), 1)
  assert.equal(f.timers(), 0)
  f.resetSocket()
})

function refreshFixture(...responses) {
  const requests = [], tokens = [], storage = new Map()
  const fetch = async (url, options) => {
    requests.push({ url, options })
    const response = responses.shift()
    if (typeof response !== 'number') return response
    return Response.json({
      success: response === 200,
      ...(response === 200 ? { accessToken: 'renewed-fixture-token' } : {}),
    }, { status: response })
  }
  const api = new Function(
    'fetch', 'getRefreshToken', 'saveAuthTokens', 'buildAuthHeaders', 'localStorage',
    'window', 'viteEnv', 'connectionUrl',
    `${source('../src/upstream/lib/api.ts').replaceAll('import.meta.env', 'viteEnv')}
     return { refreshAccessToken, resetSessionExpired, cancelAuthRefresh, hasExpiredSession, setCustomApiUrl }`
  )(
    fetch, () => '', token => tokens.push(token), () => ({}),
    { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    { location: { origin: 'http://fixture.invalid', hostname: 'fixture.invalid' } }, {}, url => url
  )
  return { ...api, requests, tokens }
}

for (const status of [429, 502, 503]) {
  test(`the actual HTTP ${status} refresh remains eligible for recovery`, async () => {
    const f = refreshFixture(status, 200)
    assert.equal(await f.refreshAccessToken(), false)
    assert.equal(f.hasExpiredSession(), false)
    assert.equal(await f.refreshAccessToken(), true)
    assert.equal(f.requests.length, 2)
    assert.deepEqual(f.tokens, ['renewed-fixture-token'])
  })
}

for (const status of [401, 403]) {
  test(`the actual HTTP ${status} refresh is final until a new login`, async () => {
    const f = refreshFixture(status, 200)
    assert.equal(await f.refreshAccessToken(), false)
    assert.equal(await f.refreshAccessToken(), false)
    assert.equal(f.requests.length, 1)
    assert.equal(f.hasExpiredSession(), true)
    f.resetSessionExpired()
    assert.equal(await f.refreshAccessToken(), true)
  })
}

for (const change of ['cancel', 'server']) {
  test(`${change} prevents stale HTTP refresh tokens from being saved`, async () => {
    let complete
    const f = refreshFixture(new Promise(resolve => { complete = resolve }))
    const task = f.refreshAccessToken()
    if (change === 'cancel') f.cancelAuthRefresh()
    else f.setCustomApiUrl('http://other.invalid')
    complete(Response.json({ success: true, accessToken: 'stale-fixture-token' }))
    assert.equal(await task, false)
    assert.equal(f.tokens.length, 0)
  })
}

test('actual HTTP refresh shares one in-flight request across concurrent callers', async () => {
  let complete
  const f = refreshFixture(new Promise(resolve => { complete = resolve }))
  const first = f.refreshAccessToken(), second = f.refreshAccessToken()
  assert.equal(f.requests.length, 1)
  complete(Response.json({ success: true, accessToken: 'renewed-fixture-token' }))
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(f.tokens, ['renewed-fixture-token'])
})

test('socket expiry retries the actual HTTP refresh after a 503', async () => {
  const api = refreshFixture(503, 200)
  const f = fixture(undefined, api.refreshAccessToken)
  f.socket.expire()
  await flush()
  assert.equal(api.requests.length, 1)
  await f.runRetry()
  assert.equal(api.requests.length, 2)
  assert.equal(f.socket.connects, 2)
  f.resetSocket()
})
