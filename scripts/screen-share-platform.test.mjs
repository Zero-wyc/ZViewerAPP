import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'
const quality = loadTs('src/platform/screenShareQuality.ts')
const frameMeter = loadTs('src/platform/screenShareFrameMeter.ts')

const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
class Track extends EventTarget {
  constructor(kind, level = 0) { super(); Object.assign(this, { kind, level, readyState: 'live', enabled: true, stops: 0 }) }
  getSettings() { return this.kind === 'video' ? { width: 576, height: 1280, frameRate: 30 } : { sampleRate: 48000, channelCount: 1 } }
  sample() { return this.readyState === 'live' && this.enabled ? typeof this.level === 'function' ? this.level() : this.level : 0 }
  stop() { this.stops++; this.readyState = 'ended' }
  clone() { return new Track(this.kind, this.level) }
}
class Stream {
  constructor(tracks = []) { this.tracks = [...tracks] }
  getTracks() { return [...this.tracks] }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video') }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio') }
}
class AudioNode {
  inputs = []; outputs = []; gain = { value: 1 }
  connect(target) { this.outputs.push(target); target.inputs.push(this) }
  disconnect() { for (const target of this.outputs) target.inputs = target.inputs.filter(node => node !== this); this.outputs = [] }
  sample() { return this.inputs.reduce((sum, node) => sum + node.sample(), 0) * this.gain.value }
}
function harness() {
  const capture = deferred(), window = new EventTarget(), timeouts = new Map(), intervals = new Map(), captures = [capture]
  const calls = [], events = [], contexts = [], microphones = [], displayOptions = []
  let captureIndex = 0
  const media = { microphone: async () => { const track = new Track('audio', .2); microphones.push(track); return new Stream([track]) } }
  const { createMicrophoneCapture } = loadTs('src/platform/microphoneCapture.ts', {
    './permissions': { permissions: { requestMicrophoneStream: () => media.microphone() } },
    './roomMicrophoneCoordination': { coordinateRoomMicrophone: async value => calls.push(['microphone-owner', value]), coordinateMicrophonePolicy: async value => calls.push(['microphone-policy', value]) },
  }, { MediaStream: Stream })
  const microphoneCapture = createMicrophoneCapture()
  const bridge = { getScreenShareCaptureSupport: async () => ({ supported: true }), armScreenShareCapture: async value => calls.push(['arm', value]), cancelScreenShareCapture: async value => calls.push(['cancel', value]), screenShareCaptureStarted: async value => calls.push(['started', value]) }
  window.addEventListener('zviewer:screen-share', event => events.push(event.detail))
  class Peer {
    connectionState = 'new'; remoteDescription = null; candidates = []; closed = false; tracks = []
    addTrack(track) { this.tracks.push(track) } close() { this.closed = true }
    async createOffer() { return { type: 'offer', sdp: 'native-ArkWeb-SDP' } }
    async setLocalDescription() {}
    async setRemoteDescription(value) { this.remoteDescription = value }
    async addIceCandidate(value) { this.candidates.push(value) }
  }
  const peers = []
  const { createHarmonyScreenShare } = loadTs('src/platform/harmonyScreenShare.ts', { './runtime': { getHarmonyBridge: () => bridge }, './microphoneCapture': { microphoneCapture }, './screenShareQuality': quality, './screenShareFrameMeter': frameMeter }, {
    window, CustomEvent, MediaStream: Stream, navigator: { mediaDevices: { getDisplayMedia: options => { displayOptions.push(options); return captures[captureIndex++].promise } } },
    AudioContext: class {
      closed = 0; resumed = 0; gains = []; sources = []
      constructor() { contexts.push(this) }
      createMediaStreamDestination() { const node = new AudioNode(); node.stream = new Stream([new Track('audio', () => node.sample())]); this.destination = node; return node }
      createGain() { const node = new AudioNode(); this.gains.push(node); return node }
      createMediaStreamSource(stream) { const node = new AudioNode(); node.sample = () => stream.getAudioTracks().reduce((sum, track) => sum + track.sample(), 0); this.sources.push(node); return node }
      async resume() { this.resumed++ }
      async close() { this.closed++ }
    },
    RTCPeerConnection: class extends Peer { constructor() { super(); peers.push(this) } },
    RTCRtpSender: { getCapabilities: () => null },
    screen: { width: 960, height: 640 }, devicePixelRatio: 3,
    setInterval: callback => { const id = Symbol(); intervals.set(id, callback); return id }, clearInterval: id => intervals.delete(id), setTimeout: (callback, delay) => { timeouts.set(delay, callback); return delay }, clearTimeout: id => timeouts.delete(id),
  })
  const track = new Track('video'), systemTrack = new Track('audio', .4), stream = new Stream([track, systemTrack])
  const nextCapture = () => { const next = deferred(); captures.push(next); return next }
  return { api: createHarmonyScreenShare(), capture, nextCapture, window, bridge, calls, events, peers, track, systemTrack, stream, timeouts, intervals, contexts, microphoneCapture, microphones, media, displayOptions }
}

test('Harmony capture requires native host support; configured FPS is never presented as measured FPS', async () => {
  const t = harness(), supported = await t.api.getCapabilities()
  for (const feature of ['video', 'systemAudio', 'microphone', 'background']) assert.equal(supported[feature], true)
  t.bridge.getScreenShareCaptureSupport = async () => ({ supported: false })
  const unsupported = await t.api.getCapabilities()
  for (const feature of ['video', 'systemAudio', 'microphone', 'background']) assert.equal(unsupported[feature], false)
  const start = t.api.start({ sessionId: 'capture', iceServers: [] }); await flush(); t.capture.resolve(t.stream)
  const settings = await start
  assert.equal(settings.width, 576); assert.equal(settings.frameRate, 0); assert.equal(settings.audio, false)
  await t.api.stop({ sessionId: 'capture' }); assert.equal(t.track.stops, 1)
})

test('quality reaches native capture, while the documented Harmony system ceiling bounds 90 FPS requests', async () => {
  for (const [resolution, width, height] of [['720p', 1280, 720], ['1080p', 1920, 1080], ['1440p', 2560, 1440], ['2160p', 3840, 2160], ['native', 2880, 1920]]) {
    const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [], resolution, frameRate: 90 })
    t.capture.resolve(t.stream)
    const settings = await start, video = t.displayOptions[0].video
    assert.equal(video.width.ideal, width); assert.equal(video.height.ideal, height)
    assert.equal(video.frameRate.max, 60)
    assert.equal(settings.targetFrameRate, 60); assert.equal(settings.configuredFrameRate, 30); assert.equal(settings.frameRate, 0)
    assert.equal((await t.api.getCapabilities()).maxFrameRate, 60)
    if (resolution === 'native') assert.equal(video.width.max, undefined)
    await t.api.stop({ sessionId: 'capture' })
  }
  const portrait = quality.screenShareVideoConstraints({ resolution: '1080p', frameRate: 60 }, 1080, 2400)
  assert.equal(portrait.width.max, 1080); assert.equal(portrait.height.max, 1920); assert.equal(portrait.frameRate.max, 60)
  const invalid = quality.screenShareVideoOptions({ resolution: 'unbounded', frameRate: 100000 })
  assert.equal(invalid.resolution, '720p'); assert.equal(invalid.frameRate, 30)
})

test('frame meter counts delivered frames, closes every VideoFrame, and cancels its private clone without stopping capture', async () => {
  let now = 0, controller, closedFrames = 0, cloneStops = 0, originalStops = 0, cancelled = 0
  const clone = { stop() { cloneStops++ } }, original = { clone: () => clone, stop() { originalStops++ } }
  const { createScreenShareFrameMeter } = loadTs('src/platform/screenShareFrameMeter.ts', {}, {
    performance: { now: () => now }, MediaStreamTrackProcessor: class { readable = new ReadableStream({ start(value) { controller = value }, cancel() { cancelled++ } }) },
  })
  const meter = createScreenShareFrameMeter(original)
  assert.equal(meter.sample(), undefined)
  for (let n = 0; n < 60; n++) { controller.enqueue({ close() { closedFrames++ } }); await flush() }
  now = 1000; assert.equal(meter.sample(), 60)
  assert.equal(closedFrames, 60)
  meter.stop(); meter.stop(); await flush()
  assert.equal(cloneStops, 1); assert.equal(originalStops, 0); assert.equal(cancelled, 1)
  assert.equal(meter.sample(), undefined)
})

test('unsupported or failed native frame measurement never opens a second capture or reports a target as measured FPS', () => {
  assert.equal(frameMeter.createScreenShareFrameMeter({}), undefined)
  let stopped = 0
  const { createScreenShareFrameMeter } = loadTs('src/platform/screenShareFrameMeter.ts', {}, { MediaStreamTrackProcessor: class { constructor() { throw new Error('not supported') } } })
  assert.equal(createScreenShareFrameMeter({ clone: () => ({ stop() { stopped++ } }) }), undefined)
  assert.equal(stopped, 1)
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

test('Harmony sends one mixed audio track; source switches and pause control actual graph output', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [], systemAudio: true, microphone: true })
  t.capture.resolve(t.stream)
  const settings = await start
  assert.equal(settings.systemAudio, true); assert.equal(settings.microphone, true); assert.equal(settings.audio, true)
  assert.equal(t.displayOptions[0].audio.echoCancellation, false)
  await t.api.createOffer({ sessionId: 'capture', peerId: 'viewer' })
  const outgoing = t.peers[0].tracks.filter(track => track.kind === 'audio')
  assert.equal(outgoing.length, 1); assert.notEqual(outgoing[0], t.systemTrack)
  assert(Math.abs(outgoing[0].sample() - .6) < 1e-9)
  await t.api.setAudioOptions({ sessionId: 'capture', systemAudio: false, microphone: true })
  assert.equal(t.systemTrack.enabled, false); assert.equal(outgoing[0].sample(), .2)
  await t.api.pause({ sessionId: 'capture' })
  assert.equal(t.track.enabled, false); assert.equal(outgoing[0].sample(), 0)
  await t.api.setAudioOptions({ sessionId: 'capture', systemAudio: true, microphone: true })
  assert.equal(outgoing[0].sample(), 0, 'changing sources while paused must not unmute capture')
  await t.api.resume({ sessionId: 'capture' })
  assert.equal(t.track.enabled, true); assert(Math.abs(outgoing[0].sample() - .6) < 1e-9)
  await t.api.setAudioOptions({ sessionId: 'capture', systemAudio: true, microphone: false })
  assert.equal(outgoing[0].sample(), .4); assert.equal(t.microphones[0].stops, 1)
  await t.api.stop({ sessionId: 'capture' })
  assert.equal(outgoing[0].stops, 1); assert.equal(outgoing[0].sample(), 0)
  assert.equal(t.track.stops, 1); assert.equal(t.systemTrack.stops, 1)
  assert.equal(t.contexts[0].closed, 1); assert.equal(t.intervals.size, 0)
  assert.equal(t.microphoneCapture.getSnapshot().screenShareActive, false)
})

test('room microphone ownership suppresses duplicate speech without muting system audio, and resumes after release', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [], systemAudio: true, microphone: true })
  t.capture.resolve(t.stream); await start
  await t.api.createOffer({ sessionId: 'capture', peerId: 'viewer' })
  const outgoing = t.peers[0].tracks.find(track => track.kind === 'audio')
  t.microphoneCapture.setVoiceState({ joined: true, publishing: true })
  assert.equal(outgoing.sample(), .4)
  assert.equal(t.events.at(-1).settings.microphoneSuppressed, true)
  assert.equal(t.events.at(-1).settings.microphone, false)
  assert.equal(t.events.at(-1).settings.systemAudio, true)
  t.microphoneCapture.setVoiceState({ joined: false, publishing: false })
  assert(Math.abs(outgoing.sample() - .6) < 1e-9)
  assert.equal(t.events.at(-1).settings.microphoneSuppressed, false)
  t.microphoneCapture.setVoiceState({ joined: false, publishing: false, adminMuted: true })
  assert.equal(outgoing.sample(), .4, 'administrator microphone mute also applies to screen sharing')
  await t.api.stop({ sessionId: 'capture' })
  assert.equal(t.microphones[0].stops, 1)
})

test('missing native system audio is reported instead of claiming silent capture, and the failed start releases video', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [], systemAudio: true })
  const rejected = assert.rejects(start, /系统没有提供音频轨/)
  t.capture.resolve(new Stream([t.track])); await rejected
  assert.equal(t.track.stops, 1); assert.equal(t.contexts[0].closed, 1)
  assert.equal(t.calls.some(([kind]) => kind === 'started'), false)
  assert.equal(t.calls.at(-1)[0], 'cancel')
})

test('a rejected background start releases the completed audio graph, microphone lease, and display stream', async () => {
  const t = harness(); t.bridge.screenShareCaptureStarted = async () => { throw new Error('background unavailable') }
  const start = t.api.start({ sessionId: 'capture', iceServers: [], systemAudio: true, microphone: true })
  const rejected = assert.rejects(start, /background unavailable/)
  t.capture.resolve(t.stream); await rejected
  assert.equal(t.track.stops, 1); assert.equal(t.systemTrack.stops, 1); assert.equal(t.microphones[0].stops, 1)
  assert.equal(t.contexts[0].closed, 1); assert.equal(t.contexts[0].destination.stream.getTracks()[0].stops, 1)
  assert.equal(t.timeouts.size, 0); assert.equal(t.intervals.size, 0)
})

test('stopping again retries failed native background cleanup after media tracks are already released', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [] })
  t.capture.resolve(t.stream); await start
  let attempts = 0
  t.bridge.cancelScreenShareCapture = async () => { if (++attempts === 1) throw new Error('native stop failed') }
  await assert.rejects(t.api.stop({ sessionId: 'capture' }), /native stop failed/)
  assert.equal(t.track.stops, 1)
  await t.api.stop({ sessionId: 'capture' })
  assert.equal(attempts, 2)
  assert.equal(t.track.stops, 1, 'retry only releases native ownership; disposed media is not stopped twice')
})

test('cancelling during microphone permission releases a late recorder and leaves a replacement screen session intact', async () => {
  const t = harness(), microphone = deferred(), requested = deferred(), raw = new Track('audio', .2)
  t.media.microphone = () => { requested.resolve(); return microphone.promise }
  const first = t.api.start({ sessionId: 'old', iceServers: [], microphone: true })
  const rejected = assert.rejects(first, error => error.name === 'AbortError' || error.code === 'cancelled')
  t.capture.resolve(t.stream); await requested.promise; await t.api.stop({ sessionId: 'old' }); await rejected
  const next = t.nextCapture(), replacementTrack = new Track('video')
  const replacement = t.api.start({ sessionId: 'new', iceServers: [] })
  next.resolve(new Stream([replacementTrack])); await replacement
  microphone.resolve(new Stream([raw])); await flush()
  assert.equal(raw.stops, 1); assert.equal(replacementTrack.stops, 0)
  await t.api.stop({ sessionId: 'old' }); assert.equal(replacementTrack.stops, 0)
  await t.api.stop({ sessionId: 'new' }); assert.equal(replacementTrack.stops, 1)
})

test('system capture ending during microphone permission cancels startup and releases the late microphone', async () => {
  const t = harness(), microphone = deferred(), requested = deferred(), raw = new Track('audio', .2)
  t.media.microphone = () => { requested.resolve(); return microphone.promise }
  const start = t.api.start({ sessionId: 'capture', iceServers: [], systemAudio: true, microphone: true })
  const rejected = assert.rejects(start, error => error.name === 'AbortError' || error.code === 'cancelled')
  t.capture.resolve(t.stream); await requested.promise
  t.track.readyState = 'ended'; t.track.dispatchEvent(new Event('ended'))
  microphone.resolve(new Stream([raw])); await rejected; await flush()
  assert.equal(raw.stops, 1); assert.equal(t.systemTrack.stops, 1)
  assert.equal(t.calls.some(([kind]) => kind === 'started'), false)
  assert.equal(t.contexts[0].closed, 1); assert.equal(t.intervals.size, 0)
  assert.equal(t.events.some(event => event.type === 'capture-ended'), true)
})

test('old capture ended and replaced PeerConnection callbacks cannot terminate or signal the current session', async () => {
  const t = harness(), first = t.api.start({ sessionId: 'old', iceServers: [] })
  t.capture.resolve(t.stream); await first; await t.api.stop({ sessionId: 'old' })
  const next = t.nextCapture(), currentTrack = new Track('video'), second = t.api.start({ sessionId: 'new', iceServers: [] })
  next.resolve(new Stream([currentTrack])); await second
  await t.api.createOffer({ sessionId: 'new', peerId: 'viewer' })
  const oldPeer = t.peers[0], oldIce = oldPeer.onicecandidate, oldState = oldPeer.onconnectionstatechange
  await t.api.createOffer({ sessionId: 'new', peerId: 'viewer' })
  assert.equal(oldPeer.closed, true)
  const before = t.events.length
  oldIce({ candidate: { toJSON: () => ({ candidate: 'stale' }) } }); oldState()
  t.track.dispatchEvent(new Event('ended')); await flush()
  assert.equal(t.events.length, before); assert.equal(currentTrack.stops, 0)
  await t.api.stop({ sessionId: 'new' })
})

test('early ICE is bounded and retained in order, while an offer cancelled by stop never completes', async () => {
  const t = harness(), start = t.api.start({ sessionId: 'capture', iceServers: [] })
  t.capture.resolve(t.stream); await start
  await t.api.createOffer({ sessionId: 'capture', peerId: 'viewer' })
  for (let n = 0; n < 140; n++) await t.api.addIceCandidate({ sessionId: 'capture', peerId: 'viewer', candidate: { candidate: `candidate-${n}` } })
  assert.equal(t.peers[0].candidates.length, 0)
  await t.api.setAnswer({ sessionId: 'capture', peerId: 'viewer', description: { type: 'answer', sdp: 'answer' } })
  assert.equal(t.peers[0].candidates.length, 128)
  assert.equal(t.peers[0].candidates[0].candidate, 'candidate-0'); assert.equal(t.peers[0].candidates.at(-1).candidate, 'candidate-127')
  const offer = t.api.createOffer({ sessionId: 'capture', peerId: 'late-viewer' })
  const rejected = assert.rejects(offer, error => error.code === 'cancelled')
  await t.api.stop({ sessionId: 'capture' }); await rejected
  assert.equal(t.peers.every(peer => peer.closed), true)
})
