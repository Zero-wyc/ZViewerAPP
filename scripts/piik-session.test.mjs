import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { webcrypto } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve() }
const credentials = (extra = {}) => ({ success: true, protocol: 'piik-v24', signalPath: '/signal',
  roomId: 'mapped-room', role: 'host', token: 'fixture-token', iceConfig: { iceServers: [] }, ...extra })
async function harness(handler = async () => Response.json(credentials())) {
  const state = { server: 'https://[::1]:3333/edge', epoch: 1 }, timers = new Map(), sockets = []
  let timerId = 0
  class Socket {
    static OPEN = 1
    readyState = 0
    sent = []
    constructor(url) { this.url = url; sockets.push(this) }
    open() { this.readyState = 1; this.onopen?.() }
    message(value) { this.onmessage?.({ data: JSON.stringify(value) }) }
    send(value) { this.sent.push(JSON.parse(value)) }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code, reason: '' }) }
  }
  const win = new EventTarget()
  win.setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id }
  win.clearTimeout = id => timers.delete(id)
  const context = createContext({ URL, Response, AbortController, AbortSignal, DOMException, Event,
    Date, console, crypto: webcrypto, Uint8Array, window: win, WebSocket: Socket,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout, setInterval: () => 0, clearInterval() {},
  })
  const mocks = {
    '@/lib/api': {
      getLogicalApiUrl: () => state.server, getApiUrl: () => state.server, getAuthSessionEpoch: () => state.epoch,
      apiFetch: (url, options) => handler(url, options),
    },
  }
  const modules = new Map()
  const get = async (file, specifier) => {
    if (mocks[specifier]) return new SyntheticModule(Object.keys(mocks[specifier]), function () {
      for (const [key, value] of Object.entries(mocks[specifier])) this.setExport(key, value)
    }, { context })
    if (!path.extname(file)) file += '.ts'
    file = path.resolve(file)
    if (!modules.has(file)) modules.set(file, new SourceTextModule(stripTypeScriptTypes(await readFile(file, 'utf8')), { context, identifier: file }))
    return modules.get(file)
  }
  const load = async relative => {
    const entry = await get(path.join(root, relative))
    if (entry.status === 'unlinked') await entry.link((specifier, parent) => get(specifier.startsWith('@/') ?
      path.join(root, 'src/upstream', specifier.slice(2)) : path.resolve(path.dirname(parent.identifier), specifier), specifier))
    if (entry.status === 'linked') await entry.evaluate()
    return entry.namespace
  }
  return { state, timers, sockets, win, load }
}
test('signal URL retains remote prefix and IPv6 and maps the native channel once', async () => {
  const h = await harness(), transport = await h.load('src/platform/connectionTransport.ts')
  const api = await h.load('src/upstream/modules/piik-signal/credentials.ts')
  transport.bindConnectionTransport(h.state.server, 'http://127.0.0.1:8000/channel/edge')
  assert.equal(api.signalConnectionUrl('/signal'), 'ws://127.0.0.1:8000/channel/edge/signal')
  assert.equal(api.signalConnectionUrl('/edge/signal'), 'ws://127.0.0.1:8000/channel/edge/signal')
  assert.throws(() => api.signalConnectionUrl('//other.invalid/signal'))
  assert.throws(() => api.signalConnectionUrl('/../signal'))
})
test('credential contract rejects unknown protocols and stale identity responses', async () => {
  let resolve
  const h = await harness(async () => new Promise(done => { resolve = done }))
  const api = await h.load('src/upstream/modules/piik-signal/credentials.ts')
  const request = api.requestCredentials('room', 'share')
  await flush(); h.state.epoch++
  resolve(Response.json(credentials()))
  await assert.rejects(request, error => error.name === 'AbortError')
  const bad = await harness(async () => Response.json(credentials({ protocol: 'future' })))
  await assert.rejects((await bad.load('src/upstream/modules/piik-signal/credentials.ts')).requestCredentials('room', 'share'), error => error.code === 'PROTOCOL')
})
test('only verified waiting errors retry; denial and unavailable responses terminate', async () => {
  for (const [status, body, retriable] of [
    [409, { code: 'HOST_NOT_SHARING' }, true], [409, { message: '房间已关闭' }, false],
    [403, {}, false], [503, {}, false],
  ]) {
    const h = await harness(async () => Response.json(body, { status }))
    const api = await h.load('src/upstream/modules/piik-signal/credentials.ts')
    await assert.rejects(api.requestCredentials('room', 'share'), error => error.retriable === retriable)
  }
})
test('raw WebSocket authenticates with one JSON frame and stops on protocol mismatch', async () => {
  const h = await harness(), { PiikSignalClient } = await h.load('src/upstream/modules/piik-signal/client.ts')
  const fatal = []
  const client = new PiikSignalClient({ authenticate: async () => ({ type: 'authenticate', protocol: 'piik-v24' }),
    onMessage() {}, onFatal: code => fatal.push(code) })
  await client.start()
  const socket = h.sockets[0]; socket.open()
  assert.equal(socket.sent[0].type, 'authenticate')
  socket.message({ type: 'authenticated', protocol: 'future', peerId: 'peer', role: 'host' })
  assert.equal(client.connected, false)
  assert.deepEqual(fatal, ['PROTOCOL'])
  assert.equal(h.timers.size, 0)
})
test('cancelled credential work cannot open a late socket', async () => {
  let resolve
  const h = await harness(), { PiikSignalClient } = await h.load('src/upstream/modules/piik-signal/client.ts')
  const client = new PiikSignalClient({ authenticate: () => new Promise(done => { resolve = done }), onMessage() {} })
  const start = client.start(); client.stop(); resolve({ type: 'authenticate' }); await start
  assert.equal(h.sockets.length, 0)
})
test('terminal errors remain visible when closed subscribers immediately release their link', async () => {
  const h = await harness(), { PiikSignalClient } = await h.load('src/upstream/modules/piik-signal/client.ts')
  const seen = []
  const client = new PiikSignalClient({ authenticate: async () => ({}), onMessage() {} })
  const remove = client.subscribe({
    onMessage() {}, onStatus: status => { if (status === 'closed') remove() },
    onFatal: code => seen.push(code),
  })
  await client.start(); h.sockets[0].open(); h.sockets[0].close(4001)
  assert.deepEqual(seen, ['SESSION_REPLACED'])
  assert.equal(h.timers.size, 0)
})
test('a released first subscriber receives no messages while voice retains the room link', async () => {
  const h = await harness(), { PiikSignalClient } = await h.load('src/upstream/modules/piik-signal/client.ts')
  const { acquireLink } = await h.load('src/upstream/modules/piik-signal/link.ts')
  const seen = []
  const share = acquireLink('scope', { onMessage: () => seen.push('share') }, handlers => new PiikSignalClient({ ...handlers, authenticate: async () => ({}) }))
  const voice = acquireLink('scope', { onMessage: () => seen.push('voice') }, () => { throw Error('duplicate link') })
  await share.client.start(); h.sockets[0].open(); share.release()
  h.sockets[0].message({ type: 'room-voice-state' })
  assert.deepEqual(seen, ['voice'])
  assert.equal(h.sockets[0].readyState, 1)
  voice.release()
  assert.equal(h.sockets[0].readyState, 3)
})
test('native host waits for capture and server acknowledgement, routes by connection ID, and stops without DELETE', async () => {
  const requests = []
  const h = await harness(async (url, options) => { requests.push({ url, options }); return Response.json(credentials()) })
  const { createScreenShareSession } = await h.load('src/mobile/screenShareSession.ts')
  let capture, event
  const offers = [], removed = [], changed = []
  const native = {
    start: () => new Promise(done => { capture = done }),
    stop: async () => {}, pause: async () => {}, resume: async () => {},
    removePeer: async ref => { removed.push(ref) },
    createOffer: async ref => { offers.push(ref); return { type: 'offer', sdp: 'fixture' } },
    setAnswer: async () => {}, addIceCandidate: async () => {},
  }
  const session = createScreenShareSession({ roomId: 'room', native, socket: { connected: true, on() {}, off() {} },
    subscribe: async listener => { event = listener; return () => {} }, changed: value => changed.push(value), newId: () => 'capture-id' })
  await flush()
  const socket = h.sockets[0]; socket.open()
  const auth = socket.sent[0]
  assert.equal(auth.roomId, 'mapped-room')
  assert.match(auth.clientId, /^[a-f0-9]{32}$/)
  socket.message({ type: 'authenticated', protocol: 'piik-v24', peerId: 'host', role: 'host', iceConfig: { iceServers: [] } })
  const starting = session.start({ systemAudio: true, microphone: false })
  assert.equal(socket.sent.some(frame => frame.type === 'start-sharing'), false)
  capture({ width: 720, height: 1280, frameRate: 0, audio: true }); await starting
  const start = socket.sent.find(frame => frame.type === 'start-sharing')
  assert.ok(start.shareGeneration)
  assert.equal(session.getSnapshot().state, 'starting')
  socket.message({ type: 'sharing-started', shareGeneration: start.shareGeneration })
  assert.equal(session.getSnapshot().state, 'sharing')
  socket.message({ type: 'route-update', revision: 2, phase: 'prepare',
    assignment: { upstream: { kind: 'none' }, childPeerIds: ['viewer'] },
    candidate: { childPeerId: 'viewer', connectionId: 'edge-id', transport: 'direct' } })
  await flush()
  assert.equal(offers[0].connectionId, 'edge-id')
  assert.equal(offers[0].remotePeerId, 'viewer')
  event({ sessionId: 'capture-id', type: 'peer-state', connectionId: 'edge-id', remotePeerId: 'viewer', revision: 1, connectionState: 'connected' })
  assert.notEqual(session.getSnapshot().transport, 'connected')
  event({ sessionId: 'capture-id', type: 'peer-state', connectionId: 'edge-id', remotePeerId: 'viewer', revision: 2, connectionState: 'connected' })
  assert.equal(session.getSnapshot().transport, 'connected')
  await session.pause(true)
  assert.equal(socket.sent.at(-1).type, 'set-sharing-paused')
  await session.stop()
  assert.equal(socket.sent.at(-1).type, 'stop-sharing')
  assert.equal(requests.some(request => request.options.method === 'DELETE'), false)
  assert.ok(removed.length)
  await session.dispose()
})
