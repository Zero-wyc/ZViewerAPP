import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function harness() {
  const capture = deferred(), window = new EventTarget(), timeouts = new Map()
  const calls = []
  const bridge = { getScreenShareCaptureSupport: async () => ({ supported: true }), armScreenShareCapture: async value => calls.push(['arm', value]), cancelScreenShareCapture: async value => calls.push(['cancel', value]) }
  class Peer {
    connectionState = 'new'; remoteDescription = null; candidates = []; closed = false
    addTrack() {} close() { this.closed = true }
    async createOffer() { return { type: 'offer', sdp: 'native-ArkWeb-SDP' } }
    async setLocalDescription() {}
    async setRemoteDescription(value) { this.remoteDescription = value }
    async addIceCandidate(value) { this.candidates.push(value) }
  }
  const peers = []
  const { createHarmonyScreenShare } = loadTs('src/platform/harmonyScreenShare.ts', { './runtime': { getHarmonyBridge: () => bridge } }, {
    window, CustomEvent, navigator: { mediaDevices: { getDisplayMedia: () => capture.promise } },
    RTCPeerConnection: class extends Peer { constructor() { super(); peers.push(this) } },
    RTCRtpSender: { getCapabilities: () => null },
    setInterval: () => 1, clearInterval: () => {}, setTimeout: (callback, delay) => { timeouts.set(delay, callback); return delay }, clearTimeout: id => timeouts.delete(id),
  })
  const track = new EventTarget(); Object.assign(track, { readyState: 'live', enabled: true, stops: 0,
    getSettings: () => ({ width: 576, height: 1280, frameRate: 30 }), stop() { this.stops++ } })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [], removeTrack() {} }
  return { api: createHarmonyScreenShare(), capture, window, bridge, calls, peers, track, stream, timeouts }
}

test('Harmony capture requires native host support; configured FPS is never presented as measured FPS', async () => {
  const t = harness(); assert.equal((await t.api.getCapabilities()).video, true)
  t.bridge.getScreenShareCaptureSupport = async () => ({ supported: false })
  assert.equal((await t.api.getCapabilities()).video, false)
  const start = t.api.start({ sessionId: 'capture', iceServers: [] }); await flush(); t.capture.resolve(t.stream)
  const settings = await start
  assert.equal(settings.width, 576); assert.equal(settings.frameRate, 0); assert.equal(settings.audio, false)
  await t.api.stop({ sessionId: 'capture' }); assert.equal(t.track.stops, 1)
})

test('Harmony cancels pending authorization immediately and releases a late native display stream', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [] })
  const rejected = assert.rejects(start, error => error.code === 'cancelled')
  await flush(); await t.api.stop({ sessionId: 'capture' }); await rejected
  t.capture.resolve(t.stream); await flush()
  assert.equal(t.track.stops, 1); assert.equal(t.timeouts.size, 0)
})

test('an unresponsive native capture times out and remains retryable without claiming a stream', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [] })
  const rejected = assert.rejects(start, error => error.code === 'capture-start-failed')
  await flush(); t.timeouts.get(45000)(); await rejected
  assert.equal(t.track.stops, 0); assert.equal(t.calls.at(-1)[0], 'cancel')
  t.capture.resolve(t.stream); await flush(); assert.equal(t.track.stops, 1)
})

test('Harmony buffers ICE before answer; stop closes native ArkWeb peers and display tracks', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [] })
  t.capture.resolve(t.stream); await start
  await t.api.createOffer({ sessionId: 'capture', peerId: 'viewer' })
  await t.api.addIceCandidate({ sessionId: 'capture', peerId: 'viewer', candidate: { candidate: 'early' } })
  assert.equal(t.peers[0].candidates.length, 0)
  await t.api.setAnswer({ sessionId: 'capture', peerId: 'viewer', description: { type: 'answer', sdp: 'answer' } })
  assert.equal(t.peers[0].candidates.length, 1)
  await t.api.pause({ sessionId: 'capture' }); assert.equal(t.track.enabled, false)
  await t.api.resume({ sessionId: 'capture' }); assert.equal(t.track.enabled, true)
  t.window.dispatchEvent(new Event('zviewer:screen-capture-stop')); await flush()
  assert.equal(t.peers[0].closed, true); assert.equal(t.track.stops, 1)
})
