import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { loadTs } from './test-ts-module.mjs'

const defer = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve } }
test('voice badge uses the selected candidate pair and tolerates SDK/stat failures', async () => {
  const { detectVoiceTransport, voicePeerConnections } = loadTs('src/upstream/modules/voice-chat/transport.ts')
  const stats = new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'chosen' }],
    ['old', { id: 'old', type: 'candidate-pair', nominated: true, state: 'succeeded', localCandidateId: 'udp' }],
    ['chosen', { id: 'chosen', type: 'candidate-pair', state: 'succeeded', localCandidateId: 'tcp' }],
    ['udp', { type: 'local-candidate', protocol: 'udp' }],
    ['tcp', { type: 'local-candidate', protocol: 'tcp' }],
  ])
  assert.equal(await detectVoiceTransport({ connectionState: 'connected', getStats: async () => stats }), 'tcp')
  assert.equal(await detectVoiceTransport({ connectionState: 'disconnected' }), null)
  assert.equal(await detectVoiceTransport({ connectionState: 'connected', getStats: async () => { throw Error('unavailable') } }), null)
  assert.equal(voicePeerConnections({}).length, 0)
})
function harness(options = {}) {
  let cursor = 0, output
  const slots = [], effects = [], rooms = [], streams = [], contexts = [], messages = [], requests = []
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v }] },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value } },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, k) => v !== slots[i].deps[k])) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, k) => v !== slots[i].deps[k])) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  class MediaStream {
    constructor(tracks = [{ enabled: true, stopped: false, stop() { this.stopped = true } }]) { this.tracks = tracks; streams.push(this) }
    getTracks() { return this.tracks }
    getAudioTracks() { return this.tracks }
  }
  class AudioContext {
    constructor() { this.closed = false; contexts.push(this); this.destination = {} }
    createGain() { return { gain: { value: 1 }, connect() {} } }
    createMediaStreamSource() { return { connect() {}, disconnect() {} } }
    createMediaStreamDestination() { return { stream: new MediaStream() } }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 8, connect() {}, disconnect() {} } }
    async resume() {}
    async close() { this.closed = true }
  }
  const RoomEvent = Object.fromEntries(['TrackSubscribed', 'TrackUnsubscribed', 'ParticipantConnected', 'ParticipantDisconnected', 'ParticipantMetadataChanged', 'ConnectionStateChanged', 'AudioPlaybackStatusChanged', 'Disconnected'].map(s => [s, s]))
  class Room extends EventEmitter {
    constructor() { super(); rooms.push(this); this.state = 'connected'; this.remoteParticipants = new Map(); this.localParticipant = { identity: 'user:1', name: 'test', metadata: '{}', publishTrack: async track => { this.track = track; await options.publish?.() } }; this.canPlaybackAudio = true }
    async connect(url) { this.url = url; await options.connect?.() }
    async disconnect() { this.disconnected = true; this.emit(RoomEvent.Disconnected) }
    async startAudio() {}
  }
  const window = new EventTarget(), document = new EventTarget()
  document.hidden = false
  document.body = { appendChild() {} }
  document.createElement = () => ({ play: async () => {}, pause() {}, remove() {} })
  let server = 'https://server.example'
  const { useVoiceChat } = loadTs('src/upstream/modules/voice-chat/hooks/useVoiceChat.ts', {
    '../../../../platform/connectionTransport': loadTs('src/platform/connectionTransport.ts', {}, { URL }),
    '../transport': loadTs('src/upstream/modules/voice-chat/transport.ts'),
    react, 'livekit-client': { Room, RoomEvent, Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } }, AudioPresets: { music: {} }, ConnectionState: { Connected: 'connected' }, DisconnectReason: { DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 3 } },
    '@/lib/api': { getApiUrl: () => server, apiFetch: async (url, init) => { requests.push({ url, init }); return options.token ? options.token() : { ok: true, status: 200, json: async () => ({ success: true, token: 'test-only', url: 'wss://rtc.example' }) } } },
    '@/components/ui/message': { message: { warning: m => messages.push(m), error: m => messages.push(m) } },
    '@/lib/mediaTeardown': { ROOM_MEDIA_TEARDOWN_EVENT: 'teardown' },
    '../../../../platform/permissions': { permissions: { requestMicrophoneStream: async () => options.permission ? options.permission() : new MediaStream() } },
  }, { window, document, navigator: { userAgent: 'Android' }, MediaStream, AudioContext, setInterval: () => 1, clearInterval() {} })
  const render = (roomId = 'room-a') => { cursor = 0; output = useVoiceChat({ roomId, username: 'test' }); while (effects.length) effects.shift()(); return output }
  render()
  return { render, rooms, streams, contexts, messages, requests, RoomEvent, window, MediaStream, switchServer: () => { server = 'https://new.example' } }
}

test('LiveKit joins the returned URL, reconnects visibly, and releases raw and processed capture on teardown', async () => {
  const h = harness(); await h.render().join()
  assert.equal(h.render().joined, true)
  assert.equal(h.rooms[0].url, 'wss://rtc.example')
  h.rooms[0].emit(h.RoomEvent.ConnectionStateChanged, 'reconnecting')
  assert.equal(h.render().mediaConnected, false)
  h.rooms[0].emit(h.RoomEvent.ConnectionStateChanged, 'connected')
  assert.equal(h.render().mediaConnected, true)
  h.window.dispatchEvent(new Event('teardown'))
  assert.equal(h.render().joined, false)
  assert.ok(h.streams.every(s => s.getTracks().every(t => t.stopped)))
  assert.ok(h.contexts.every(c => c.closed))
  assert.ok(h.rooms[0].disconnected)
  h.render().leave() // Idempotent cleanup.
})

test('leave during permission acquisition stops the late raw stream and never publishes it', async () => {
  const permission = defer(); const h = harness({ permission: () => permission.promise })
  const joining = h.render().join(); await new Promise(r => setImmediate(r))
  h.render().leave()
  const stream = new h.MediaStream(); permission.resolve(stream); await joining
  assert.ok(stream.getTracks()[0].stopped)
  assert.equal(h.rooms.length, 0)
  assert.equal(h.render().joining, false)
})

test('room switch while LiveKit connect is pending disconnects the stale room and never publishes', async () => {
  const connect = defer(); const h = harness({ connect: () => connect.promise })
  const joining = h.render().join(); await new Promise(r => setImmediate(r))
  h.render('room-b'); connect.resolve(); await joining
  assert.equal(h.rooms[0].track, undefined)
  assert.ok(h.rooms[0].disconnected)
  assert.ok(h.streams.every(s => s.getTracks().every(t => t.stopped)))
  assert.equal(h.render('room-b').joined, false)
})

test('administrator unmute respects the latest user microphone intent', async () => {
  const h = harness(); await h.render().join(); h.render().toggleMic()
  const room = h.rooms[0]
  room.localParticipant.metadata = '{"adminMuted":true}'; room.emit(h.RoomEvent.ParticipantMetadataChanged)
  room.localParticipant.metadata = '{}'; room.emit(h.RoomEvent.ParticipantMetadataChanged)
  assert.equal(h.render().micEnabled, false)
  h.render().toggleMic()
  assert.equal(h.render().micEnabled, true)
})

test('kick and duplicate identity disconnect clean up microphone and audio route state', async () => {
  for (const reason of [2, 3]) {
    const h = harness(); await h.render().join(); h.rooms[0].emit(h.RoomEvent.Disconnected, reason)
    assert.equal(h.render().joining || h.render().joined, false)
    assert.ok(h.streams.every(s => s.getTracks().every(t => t.stopped)))
    assert.ok(h.messages.some(m => m.includes(reason === 2 ? '另一设备' : '移出')))
  }
})

test('503 and denied permission leave a retryable state without an old-protocol fallback', async () => {
  for (const options of [{ token: async () => ({ ok: false, status: 503, json: async () => ({}) }) }, { permission: async () => { throw new DOMException('denied', 'NotAllowedError') } }]) {
    const h = harness(options); await h.render().join()
    assert.equal(h.render().joining || h.render().joined, false)
    assert.equal(h.rooms.length, 0)
    assert.ok(h.messages.length > 0)
    assert.deepEqual(h.requests.map(r => r.url), ['/api/voice/token'])
  }
})

test('server switch during a token request cancels joining without acquiring microphone', async () => {
  const token = defer(); const h = harness({ token: () => token.promise })
  const joining = h.render().join(); h.switchServer()
  token.resolve({ ok: true, status: 200, json: async () => ({ success: true, token: 'test', url: 'wss://old.example' }) }); await joining
  assert.equal(h.streams.length, 0)
  assert.equal(h.render().joining, false)
})
