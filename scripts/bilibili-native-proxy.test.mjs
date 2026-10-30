import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../ZV-HarmonyOS/entry/src/main/ets/services/BilibiliLocalProxy.ets', import.meta.url), 'utf8')
const executable = stripTypeScriptTypes(source)
  .replace(/^import .*;\r?$/gm, '')
  .replace('export class BilibiliLocalProxy', 'class BilibiliLocalProxy')
const target = 'https://primary.bilivideo.com/fixture.m4s'
const backup = 'https://backup.bilivideo.com/fixture.m4s'
const origin = 'https://zviewer.local'
const turn = () => new Promise(resolve => setImmediate(resolve))
const pending = () => new Promise(() => {})
const partialHeaders = {
  'status-line': 'HTTP/1.1 206 Partial Content',
  'content-type': 'video/mp4',
  'content-length': '4',
  'content-range': 'bytes 0-3/8',
}

function fixture(responses, options = {}) {
  const requests = []
  const connection = new EventEmitter()
  connection.sent = []
  connection.closeCount = 0
  connection.send = async ({ data }) => {
    connection.sent.push(data)
    if (options.send) await options.send(data)
  }
  connection.close = async () => {
    connection.closeCount++
    connection.emit('close')
    if (options.closeError) throw new Error('fixture close failure')
  }
  const http = {
    RequestMethod: { GET: 'GET', HEAD: 'HEAD' },
    createHttp() {
      const request = {
        listeners: {},
        destroyCount: 0,
        on(event, callback) { this.listeners[event] = callback },
        destroy() { this.destroyCount++ },
        async requestInStream(url, requestOptions) {
          this.url = url
          this.options = requestOptions
          return responses[requests.indexOf(this)](this)
        },
      }
      requests.push(request)
      return request
    },
  }
  const context = vm.createContext({
    http, socket: {}, cryptoFramework: {}, util: { TextEncoder },
    BilibiliCredentialStore: class {},
    console, Promise, Map, ArrayBuffer, Uint8Array,
  })
  vm.runInContext(`${executable}\nglobalThis.ProxyClass = BilibiliLocalProxy`, context)
  const proxy = new context.ProxyClass()
  proxy.targets.set(target, [backup])
  return {
    proxy, requests, connection,
    start: (method = 'GET', range = 'bytes=0-3') => proxy.proxyEndpoint(connection, target, range, method, origin),
  }
}

function success(request) {
  request.listeners.headersReceive(partialHeaders)
  request.listeners.dataReceive(Uint8Array.of(1, 2, 3, 4).buffer)
  return 206
}

function assertReleased(state) {
  assert.deepEqual(state.requests.map(request => request.destroyCount), state.requests.map(() => 1))
  assert.equal(state.connection.listenerCount('close'), 0)
  assert.equal(state.connection.listenerCount('error'), 0)
}

test('all rejected CDN candidates are destroyed before a single 502 response', async () => {
  const rejected = request => {
    request.listeners.headersReceive({
      'status-line': 'HTTP/1.1 403 Forbidden',
      'content-type': 'text/plain',
      'content-length': '0',
    })
    request.listeners.dataReceive(new ArrayBuffer(4))
    return 403
  }
  const state = fixture([rejected, rejected])
  await state.start()
  await turn()
  assert.equal(state.requests.length, 2)
  assert.equal(state.connection.sent.length, 1)
  assert.match(state.connection.sent[0], /^HTTP\/1\.1 502 Bad Gateway\r\n/)
  assertReleased(state)
})

test('invalid CDN headers cancel their stream and permit the next candidate', async () => {
  for (const invalid of [
    { 'deny-reason': 'fixture denied' },
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/xml' },
    { 'content-range': '' },
  ]) {
    const state = fixture([request => {
      request.listeners.headersReceive({ ...partialHeaders, ...invalid })
      return pending()
    }, success])
    await state.start()
    assert.equal(state.requests.length, 2)
    assert.match(state.connection.sent[0], /^HTTP\/1\.1 206 OK\r\n/)
    assert.equal(state.connection.sent.length, 2)
    assertReleased(state)
  }
})

test('a complete range preserves headers and ordered chunks received before headers', async () => {
  const state = fixture([request => {
    request.listeners.dataReceive(Uint8Array.of(1, 2).buffer)
    request.listeners.headersReceive(partialHeaders)
    request.listeners.dataReceive(Uint8Array.of(3, 4).buffer)
    return 206
  }])
  await state.start()
  assert.match(state.connection.sent[0], /Content-Range: bytes 0-3\/8\r\n/)
  assert.match(state.connection.sent[0], /Access-Control-Allow-Origin: https:\/\/zviewer\.local\r\n/)
  assert.deepEqual(state.connection.sent.slice(1).map(chunk => [...new Uint8Array(chunk)]), [[1, 2], [3, 4]])
  assert.equal(state.requests[0].options.header.Range, 'bytes=0-3')
  assert.equal(state.connection.closeCount, 1)
  assertReleased(state)
})

test('network rejection before headers falls back and late callbacks cannot cancel the new request', async () => {
  let rejectedRequest
  const state = fixture([request => {
    rejectedRequest = request
    throw new Error('fixture connection refused')
  }, request => {
    rejectedRequest.listeners.headersReceive({ ...partialHeaders, 'deny-reason': 'late rejection' })
    rejectedRequest.listeners.dataReceive(new ArrayBuffer(4))
    return success(request)
  }])
  await state.start()
  assert.equal(state.requests.length, 2)
  assert.equal(state.connection.sent.length, 2)
  assert.equal(state.connection.closeCount, 1)
  assertReleased(state)
})

test('a truncated response closes its connection without appending a backup response', async () => {
  const state = fixture([request => {
    request.listeners.headersReceive(partialHeaders)
    request.listeners.dataReceive(new ArrayBuffer(2))
    return 206
  }, success])
  await state.start()
  assert.equal(state.requests.length, 1)
  assert.equal(state.connection.closeCount, 1)
  assert.equal(state.connection.sent.length, 2)
  assertReleased(state)
})

test('HEAD sends only headers and retains the upstream content length', async () => {
  const state = fixture([request => {
    request.listeners.headersReceive({ ...partialHeaders, 'content-length': '4096' })
    request.listeners.dataReceive(new ArrayBuffer(4))
    return 206
  }])
  await state.start('HEAD')
  assert.equal(state.connection.sent.length, 1)
  assert.match(state.connection.sent[0], /Content-Length: 4096\r\n/)
  assert.equal(state.requests[0].options.method, 'HEAD')
  assertReleased(state)
})

for (const event of ['close', 'error']) {
  test(`downstream ${event} cancels an unsettled upstream without trying backups`, { timeout: 1000 }, async () => {
    const state = fixture([() => pending(), success])
    const operation = state.start()
    await turn()
    state.connection.emit(event)
    await operation
    assert.equal(state.requests.length, 1)
    assert.equal(state.requests[0].destroyCount, 1)
    assert.equal(state.connection.sent.length, 0)
    assertReleased(state)
  })
}

test('send rejection cancels upstream immediately and is handled before stream completion', { timeout: 1000 }, async () => {
  const state = fixture([request => {
    request.listeners.headersReceive(partialHeaders)
    request.listeners.dataReceive(new ArrayBuffer(4))
    return pending()
  }, success], { send: async () => { throw new Error('fixture disconnected') } })
  await state.start()
  await turn()
  assert.equal(state.requests.length, 1)
  assert.equal(state.connection.sent.length, 1)
  assert.equal(state.connection.closeCount, 1)
  assertReleased(state)
})

test('downstream closure releases an unsettled send as well as an unsettled upstream', { timeout: 1000 }, async () => {
  const state = fixture([request => {
    request.listeners.headersReceive(partialHeaders)
    request.listeners.dataReceive(new ArrayBuffer(4))
    return pending()
  }], { send: () => pending() })
  const operation = state.start()
  await turn()
  state.connection.emit('close')
  await operation
  assert.equal(state.connection.sent.length, 1)
  assertReleased(state)
})

test('overflow before headers cancels upstream and falls back without forwarding rejected data', { timeout: 1000 }, async () => {
  const state = fixture([request => {
    request.listeners.dataReceive(new ArrayBuffer(17 * 1024 * 1024))
    return pending()
  }, success])
  await state.start()
  assert.equal(state.requests.length, 2)
  assert.equal(state.connection.sent.length, 2)
  assertReleased(state)
})

test('overflow after headers closes the partial response and releases pending sends', { timeout: 1000 }, async () => {
  const state = fixture([request => {
    request.listeners.headersReceive(partialHeaders)
    for (let i = 0; i < 5; i++) request.listeners.dataReceive(new ArrayBuffer(4 * 1024 * 1024))
    return pending()
  }, success], { send: () => pending() })
  await state.start()
  assert.equal(state.requests.length, 1)
  assert.equal(state.connection.closeCount, 1)
  assertReleased(state)
})

test('a failed error reply also handles failure while closing the socket', async () => {
  const state = fixture([], {
    send: async () => { throw new Error('fixture send failure') },
    closeError: true,
  })
  state.proxy.reply(state.connection, 502, 'Bad Gateway', '')
  await turn()
  await turn()
  assert.equal(state.connection.closeCount, 1)
})
