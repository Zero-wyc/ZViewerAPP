import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve() }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup(overrides = {}) {
  const { createScreenShareSession } = loadTs('src/mobile/screenShareSession.ts')
  const calls = [], emitted = [], handlers = new Map(), snapshots = []
  const socket = {
    connected: true,
    on(name, cb) { handlers.set(name, cb) },
    off(name, cb) { if (handlers.get(name) === cb) handlers.delete(name) },
    emit(...args) { emitted.push(args) },
  }
  const native = Object.fromEntries(['start', 'stop', 'pause', 'resume', 'createOffer', 'setAnswer', 'addIceCandidate', 'removePeer'].map(name => [name, async options => {
    calls.push([name, options]);
    if (overrides[name]) return await overrides[name](options)
    if (name === 'start') return { width: 576, height: 1280, frameRate: 0, audio: false }
    if (name === 'createOffer') return { type: 'offer', sdp: 'offer' }
  }]))
  let id = 0, callback, removed = 0
  const controller = createScreenShareSession({ roomId: 'test-room', native, socket, iceServers: [],
    subscribe: async cb => { callback = cb; return () => removed++ }, newId: () => `session-${++id}`,
    changed: value => snapshots.push(value),
  })
  return { controller, calls, socket, emitted, handlers, snapshots, event: value => callback(value), removed: () => removed,
    fire: (name, value) => handlers.get(name)?.(value), state: () => controller.getSnapshot() }
}

test('double start requests consent once; late viewers use native SDP and native ICE', async () => {
  const gate = deferred(), t = setup({ start: () => gate.promise })
  const a = t.controller.start(), b = t.controller.start()
  await flush(); assert.equal(t.calls.filter(([n]) => n === 'start').length, 1)
  gate.resolve({ width: 720, height: 1280, frameRate: 0, audio: false }); await Promise.all([a, b])
  assert.equal(t.state().state, 'sharing'); assert.equal(t.state().transport, 'waiting-viewers')
  assert.equal(t.emitted[0][0], 'sharer-ready')
  t.fire('viewer-ready', { from: 'viewer' }); await flush()
  assert.equal(t.emitted[1][0], 'signal-offer')
  t.fire('signal-answer', { from: 'viewer', data: { type: 'answer', sdp: 'answer' } })
  t.fire('signal-ice-candidate', { from: 'viewer', data: { candidate: 'candidate' } }); await flush()
  assert.deepEqual(t.calls.slice(-2).map(([name]) => name), ['setAnswer', 'addIceCandidate'])
  t.event({ sessionId: 'session-1', type: 'ice', peerId: 'viewer', candidate: { candidate: 'native' } })
  assert.equal(t.emitted.at(-1)[0], 'signal-ice-candidate')
  await t.controller.dispose()
})

test('viewer-ready before capture is recovered through sharer-ready, duplicate requests are bounded', async () => {
  const t = setup()
  t.fire('viewer-ready', { from: 'early' }); assert.equal(t.calls.length, 0)
  await t.controller.start()
  t.fire('viewer-ready', { from: 'early' }); t.fire('viewer-ready', { from: 'early' }); await flush()
  assert.equal(t.calls.filter(([name]) => name === 'createOffer').length, 1)
  t.fire('viewer-left', { viewerSocketId: 'early' }); await flush()
  assert.equal(t.state().viewers, 0); assert.equal(t.state().state, 'sharing')
  await t.controller.dispose()
})

test('permission rejection is retryable and never broadcasts sharer-ready', async () => {
  let deny = true
  const t = setup({ start: async () => { if (deny) throw { code: 'permission-denied', message: 'private native detail' }; return { width: 720, height: 1280, frameRate: 0, audio: false } } })
  await t.controller.start()
  assert.equal(t.state().state, 'error'); assert.match(t.state().error, /授权/)
  assert(!JSON.stringify(t.snapshots).includes('private native detail')); assert.equal(t.emitted.length, 0)
  deny = false; await t.controller.start(); assert.equal(t.state().state, 'sharing')
  await t.controller.dispose()
})

test('stop during system consent invalidates the late stream and never announces sharing', async () => {
  const gate = deferred(), t = setup({ start: () => gate.promise })
  const start = t.controller.start(); await flush()
  await t.controller.stop(); gate.resolve({ width: 10, height: 10 }); await start
  assert.equal(t.state().state, 'stopped'); assert.equal(t.emitted.length, 0)
  assert.equal(t.calls.at(-1)[0], 'stop')
  await t.controller.dispose()
})

test('old session callbacks cannot stop or alter a restarted capture', async () => {
  const t = setup(); await t.controller.start(); await t.controller.stop(); await t.controller.start()
  t.event({ sessionId: 'session-1', type: 'capture-ended', code: 'capture-ended' })
  t.event({ sessionId: 'session-1', type: 'stats', settings: { width: 1 } }); await flush()
  assert.equal(t.state().state, 'sharing'); assert.equal(t.state().settings.width, 576)
  t.event({ sessionId: 'session-2', type: 'capture-ended', code: 'capture-ended' }); await flush()
  assert.equal(t.state().state, 'stopped'); await t.controller.dispose()
})

test('disconnect and room close release capture; reconnect never silently reauthorizes it', async () => {
  const t = setup(); await t.controller.start()
  t.socket.connected = false; t.fire('disconnect'); await flush()
  assert.equal(t.state().state, 'stopped')
  t.socket.connected = true; t.fire('connect'); await flush(); assert.equal(t.state().state, 'stopped')
  await t.controller.start()
  t.fire('room-closed', { roomId: 'another-room' }); assert.equal(t.state().state, 'sharing')
  t.fire('room-closed', { roomId: 'test-room' }); await flush(); assert.equal(t.state().state, 'stopped')
  await t.controller.dispose()
})

test('pause/resume preserve capture identity; multi-viewer transport is independent of capture', async () => {
  const t = setup(); await t.controller.start(); await t.controller.pause(true)
  assert.equal(t.state().state, 'paused'); await t.controller.pause(false); assert.equal(t.state().state, 'sharing')
  for (let n = 0; n < 5; n++) t.fire('viewer-ready', { from: `v${n}` })
  await flush(); assert.equal(t.state().viewers, 4)
  t.event({ sessionId: 'session-1', type: 'peer-state', peerId: 'v0', connectionState: 'connected' })
  assert.equal(t.state().transport, 'connected')
  for (let n = 0; n < 4; n++) t.fire('viewer-left', { viewerSocketId: `v${n}` })
  await flush(); assert.equal(t.state().transport, 'waiting-viewers'); assert.equal(t.state().state, 'sharing')
  await t.controller.dispose(); assert.equal(t.handlers.size, 0); assert.equal(t.removed(), 1)
})

test('late offer after viewer departure or dispose is never sent', async () => {
  const gate = deferred(), t = setup({ createOffer: () => gate.promise })
  await t.controller.start(); t.fire('viewer-ready', { from: 'viewer' }); await flush()
  t.fire('viewer-left', { viewerSocketId: 'viewer' }); await t.controller.dispose()
  gate.resolve({ type: 'offer', sdp: 'late' }); await flush()
  assert.equal(t.emitted.filter(([name]) => name === 'signal-offer').length, 0)
  assert.equal(t.removed(), 1)
})
