import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import * as transport from '../src/platform/connectionTransport.ts'

async function loadModule(path, imports, globals = {}) {
  const context = createContext({ URL, Uint8Array, TextEncoder, Date, console, ...globals })
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'))
  const module = new SourceTextModule(source, { context })
  await module.link(name => {
    const dependency = imports[name]
    assert.ok(dependency, `unexpected import: ${name}`)
    return new SyntheticModule(Object.keys(dependency), function () {
      for (const [key, value] of Object.entries(dependency)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

const serverUrl = await loadModule('../src/mobile/serverUrl.ts', {
  '../platform/connectionTransport': transport,
})
const ipv6 = '2001:db8:1234:5678:abcd:ef01:2345:6789'

test('IPv6 server input preserves brackets, port, prefix and explicit HTTPS', () => {
  const origin = `https://[${ipv6}]:3333`
  assert.equal(serverUrl.normalizeServerUrl(`  ${origin}/  `), origin)
  assert.equal(serverUrl.normalizeServerUrl(`[${ipv6}]:3333/edge/`), `${origin}/edge`)
  assert.deepEqual(Array.from(serverUrl.serverCandidates(origin)), [origin])
  assert.deepEqual(Array.from(serverUrl.serverCandidates(`[${ipv6}]:3333`)), [origin, origin.replace('https:', 'http:')])
  assert.throws(() => serverUrl.normalizeServerUrl(`https://user:pass@[${ipv6}]:3333`))
  assert.throws(() => serverUrl.normalizeServerUrl(`${origin}/?token=private`))
})

test('IPv6 API, media and WebSocket URLs round trip through one native transport', () => {
  const server = `https://[${ipv6}]:3333/edge`
  const local = 'http://127.0.0.1:9876/private-channel/edge'
  transport.bindConnectionTransport(server, local)
  try {
    assert.equal(serverUrl.serverResource(server, '/api/auth/public-settings'), `${local}/api/auth/public-settings`)
    assert.equal(serverUrl.authenticatedMediaUrl(server, '/api/media/movie?id=1', 'a/b'), `${local}/api/media/movie?id=1&token=a%2Fb`)
    const websocket = `wss://[${ipv6}]:3333/edge/socket.io/?EIO=4&transport=websocket`
    const forwarded = 'ws://127.0.0.1:9876/private-channel/edge/socket.io/?EIO=4&transport=websocket'
    assert.equal(transport.connectionUrl(websocket), forwarded)
    assert.equal(transport.logicalConnectionUrl(forwarded), websocket)
    assert.equal(transport.logicalConnectionUrl(`${local}/room/123`), `${server}/room/123`)
    const other = 'https://[::1]:3333/edge/api/media/movie'
    assert.equal(serverUrl.authenticatedMediaUrl(server, other, 'private'), other)
    assert.equal(transport.connectionUrl(other), other)
  } finally { transport.clearConnectionTransport() }
})

async function loadHarmonyConnection() {
  const servers = [], remotes = []
  function remote(tls) {
    const listeners = new Map()
    const instance = {
      tls, sent: [],
      on(name, callback) { listeners.set(name, callback) },
      async bind(address) { this.bound = address },
      async connect(options) {
        this.connected = options
        // NetAddress.family defaults to IPv4 in NetworkKit, even after an IPv6 bind.
        if (options.address.address.includes(':') && (options.address.family ?? 1) !== 2) throw new Error('IPv6 address with IPv4 family')
      },
      async send(data) { this.sent.push(new TextDecoder().decode(tls ? data : data.data)) },
      async close() {},
    }
    remotes.push(instance)
    return instance
  }
  const socket = {
    Protocol: { TLSv12: 4, TLSv13: 5 },
    constructTCPSocketInstance: () => remote(false),
    constructTLSSocketInstance: () => remote(true),
    constructTCPSocketServerInstance() {
      const listeners = new Map()
      const server = {
        async listen() {},
        async getLocalAddress() { return { address: '127.0.0.1', port: 9876 } },
        async close() {},
        on(name, callback) { listeners.set(name, callback) },
        connect(local) { listeners.get('connect')(local) },
      }
      servers.push(server)
      return server
    },
  }
  const module = await loadModule('../ZV-HarmonyOS/entry/src/main/ets/services/ServerConnection.ets', {
    '@kit.NetworkKit': { socket, http: {} },
    '@kit.ArkTS': {
      url: { URL },
      util: { TextEncoder, TextDecoder: class { decodeWithStream(data) { return new TextDecoder().decode(data) } } },
    },
    '@kit.CryptoArchitectureKit': {
      cryptoFramework: { createRandom: () => ({ generateRandomSync: () => ({ data: new Uint8Array(24).fill(10) }) }) },
    },
    '@kit.BasicServicesKit': { BusinessError: Error },
  }, { setTimeout: () => 0 })
  return { connection: new module.ServerConnection(), servers, remotes }
}

for (const [scheme, host, family, exception] of [
  ['http', `[${ipv6}]`, 2, false],
  ['https', `[${ipv6}]`, 2, true],
  ['http', '127.0.0.1', 1, false],
  ['https', 'media.example.com', 1, true],
]) {
  test(`Harmony ${scheme} tunnel connects ${host} with matching address family and preserves Upgrade`, async () => {
    const { connection, servers, remotes } = await loadHarmonyConnection()
    const target = `${scheme}://${host}:3333`
    const result = await connection.configure({ url: `${target}/edge`, allowUntrustedCertificate: exception })
    const localUrl = new URL(result.url)
    const listeners = new Map(), replies = []
    servers[0].connect({
      on(name, callback) { listeners.set(name, callback) },
      async close() {},
      async send(data) { replies.push(data) },
    })
    const request = `GET ${localUrl.pathname}/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: ${localUrl.host}\r\nOrigin: https://zviewer.local\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nRange: bytes=0-31\r\n\r\n`
    listeners.get('message')({ message: new TextEncoder().encode(request).buffer })
    await new Promise(resolve => setImmediate(resolve))
    const remote = remotes[0]
    assert.equal(replies.length, 0, 'a valid connect must not produce a 502')
    assert.equal(remote.bound.family, family)
    assert.equal(remote.bound.address, family === 2 ? '::' : '0.0.0.0')
    assert.equal(remote.connected.address.family, family)
    assert.equal(remote.connected.address.address, host.replace(/^\[|\]$/g, ''))
    assert.equal(remote.connected.address.port, 3333)
    const forwarded = remote.sent.join('')
    assert.ok(forwarded.startsWith('GET /edge/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\n'))
    assert.ok(forwarded.includes(`\r\nHost: ${host}:3333\r\n`))
    assert.ok(forwarded.includes(`\r\nOrigin: ${target}\r\n`))
    assert.ok(forwarded.includes(`\r\nReferer: ${target}/\r\n`))
    assert.ok(forwarded.includes('\r\nUpgrade: websocket\r\n'))
    assert.ok(forwarded.includes('\r\nConnection: Upgrade\r\n'))
    assert.ok(forwarded.includes('\r\nRange: bytes=0-31\r\n'))
    if (exception) assert.equal(remote.connected.skipRemoteValidation, true)
    await connection.configure({ url: '', allowUntrustedCertificate: false })
  })
}

test('valid-certificate HTTPS IPv6 remains on the verified platform transport', async () => {
  const { connection, servers, remotes } = await loadHarmonyConnection()
  const target = `https://[${ipv6}]:3333/edge`
  assert.equal((await connection.configure({ url: target, allowUntrustedCertificate: false })).url, target)
  assert.equal(servers.length, 0)
  assert.equal(remotes.length, 0)
})
