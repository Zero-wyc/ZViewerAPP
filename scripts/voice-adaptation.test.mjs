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
  const onlyOldNomination = new Map([...stats].filter(([key]) => !['transport', 'chosen'].includes(key)))
  assert.equal(await detectVoiceTransport({ connectionState: 'connected', getStats: async () => onlyOldNomination }), null, 'an old nominated pair cannot identify the current route')
  assert.equal(voicePeerConnections({}).length, 0)
})

test('media monitor requires both active directions and replaces PC listeners without stale callbacks', () => {
  const { createVoiceMediaMonitor, voiceMediaConnectionState } = loadTs('src/upstream/modules/voice-chat/transport.ts')
  class Peer extends EventTarget {
    connectionState = 'connected'; iceConnectionState = 'connected'; listeners = 0
    addEventListener(...args) { this.listeners++; super.addEventListener(...args) }
    removeEventListener(...args) { this.listeners--; super.removeEventListener(...args) }
  }
  const subscriber = new Peer(), publisher = new Peer()
  const manager = { subscriber: { _pc: subscriber }, publisher: { _pc: publisher }, needsSubscriber: true, needsPublisher: true }
  const room = { engine: { pcManager: manager } }
  publisher.connectionState = 'connecting'; publisher.iceConnectionState = 'checking'
  assert.equal(voiceMediaConnectionState(room), false, 'receiving alone does not prove the microphone channel connected')
  let now = 0, ticks, cancelled = false, active = true, status, warnings = 0
  const monitor = createVoiceMediaMonitor({ room, active: () => active, signalingConnected: () => true, onChange: next => { status = next }, onTimeout: () => warnings++, now: () => now, schedule: callback => { ticks = callback; return 1 }, cancel: () => { cancelled = true } })
  assert.equal(status, 'connecting')
  publisher.connectionState = 'connected'; publisher.iceConnectionState = 'completed'; publisher.dispatchEvent(new Event('iceconnectionstatechange'))
  assert.equal(status, 'connected')
  const replacement = new Peer(); replacement.connectionState = 'disconnected'
  manager.publisher._pc = replacement; ticks()
  assert.equal(status, 'recovering')
  assert.equal(publisher.listeners, 0)
  assert.equal(replacement.listeners, 2)
  now = 10000; ticks(); ticks()
  assert.equal(status, 'timeout'); assert.equal(warnings, 1)
  replacement.connectionState = 'connected'; replacement.dispatchEvent(new Event('connectionstatechange'))
  assert.equal(status, 'connected')
  active = false; ticks()
  assert.equal(cancelled, true)
  assert.equal(replacement.listeners, 0)
  assert.equal(subscriber.listeners, 0)
  monitor.restart(); publisher.dispatchEvent(new Event('iceconnectionstatechange'))
  assert.equal(warnings, 1)
})
function harness(options = {}) {
  let cursor = 0, output
  const slots = [], effects = [], rooms = [], streams = [], contexts = [], messages = [], requests = []
  const timers = new Map(); let nextTimer = 0, now = 0
  const react = {
    useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, v => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v }] },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value } },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, k) => v !== slots[i].deps[k])) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, k) => v !== slots[i].deps[k])) { const old = slots[i]; slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  class Track extends EventTarget {
    kind = 'audio'; readyState = 'live'; enabled = true; stopped = false
    stop() { this.stopped = true; this.readyState = 'ended' }
    clone() { return new Track() }
    end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')) }
  }
  class MediaStream {
    constructor(tracks = [new Track()]) { this.tracks = tracks; streams.push(this) }
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
    constructor() { super(); rooms.push(this); this.state = 'connected'; this.engine = { pcManager: { subscriber: { _pc: { connectionState: 'connected', iceConnectionState: 'connected', getStats: async () => new Map() } }, needsSubscriber: true, needsPublisher: false } }; this.remoteParticipants = new Map(); this.localParticipant = { identity: 'user:1', name: 'test', metadata: '{}', publishTrack: async track => { this.track = track; await options.publish?.() } }; this.canPlaybackAudio = true }
    emit(event, ...args) { if (event === RoomEvent.ConnectionStateChanged) this.state = args[0]; return super.emit(event, ...args) }
    async connect(url, _token, config) { this.url = url; this.connectOptions = config; await options.connect?.() }
    async disconnect() { this.disconnected = true; this.emit(RoomEvent.Disconnected) }
    async startAudio() {}
  }
  const window = new EventTarget(), document = new EventTarget()
  document.hidden = false
  document.body = { appendChild() {} }
  document.createElement = () => ({ dataset: {}, style: {}, play: async () => {}, pause() {}, remove() {} })
  let server = 'https://server.example'
  const { microphoneCapture } = loadTs('src/platform/microphoneCapture.ts', {
    './permissions': { permissions: { requestMicrophoneStream: async () => options.permission ? options.permission() : new MediaStream() } },
    './roomMicrophoneCoordination': { coordinateRoomMicrophone: async () => {}, coordinateMicrophonePolicy: async () => {} },
  }, { MediaStream })
  const { useVoiceChat } = loadTs('src/upstream/modules/voice-chat/hooks/useVoiceChat.ts', {
    '../../../../platform/connectionTransport': loadTs('src/platform/connectionTransport.ts', {}, { URL }),
    '../transport': loadTs('src/upstream/modules/voice-chat/transport.ts'),
    react, 'livekit-client': { Room, RoomEvent, Track: { Kind: { Audio: 'audio' }, Source: { Microphone: 'microphone' } }, AudioPresets: { music: {} }, ConnectionState: { Connected: 'connected', Reconnecting: 'reconnecting', SignalReconnecting: 'signalReconnecting' }, DisconnectReason: { DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 3 } },
    '@/lib/api': { getApiUrl: () => server, apiFetch: async (url, init) => { requests.push({ url, init }); return options.token ? options.token() : { ok: true, status: 200, json: async () => ({ success: true, token: 'test-only', url: 'wss://rtc.example' }) } } },
    '@/components/ui/message': { message: { warning: m => messages.push(m), error: m => messages.push(m) } },
    '@/lib/mediaTeardown': { ROOM_MEDIA_TEARDOWN_EVENT: 'teardown' },
    '../../../../platform/microphoneCapture': { microphoneCapture },
  }, { window, document, navigator: { userAgent: 'Android' }, MediaStream, AudioContext, Date: { now: () => now }, setInterval: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer }, clearInterval: timer => timers.delete(timer) })
  const render = (roomId = 'room-a') => { cursor = 0; output = useVoiceChat({ roomId, username: 'test' }); while (effects.length) effects.shift()(); return output }
  render()
  return { render, rooms, streams, contexts, messages, requests, RoomEvent, window, MediaStream, microphoneCapture, timers, tick: ms => { now += ms; for (const timer of [...timers.values()]) if (timer.ms === 500) timer.fn() }, switchServer: () => { server = 'https://new.example' } }
}

test('LiveKit joins the returned URL, reconnects visibly, and releases raw and processed capture on teardown', async () => {
  const h = harness(); await h.render().join()
  assert.equal(h.render().joined, true)
  assert.equal(h.rooms[0].url, 'wss://rtc.example')
  assert.equal(h.rooms[0].connectOptions.peerConnectionTimeout, 10000)
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

test('microphone permission waiting does not consume the media timeout window', async () => {
  const permission = defer(), h = harness({ permission: () => permission.promise })
  const joining = h.render().join(); await new Promise(resolve => setImmediate(resolve))
  h.tick(30000)
  assert.equal(h.timers.size, 0)
  assert.equal(h.render().mediaStatus, 'idle')
  assert.equal(h.messages.length, 0)
  permission.resolve(new h.MediaStream()); await joining
  assert.equal(h.render().mediaStatus, 'connected')
  h.render().leave()
})

test('media loss warns once, recovers from PC state, and cannot write or warn after leave', async () => {
  const h = harness(); await h.render().join()
  const pc = h.rooms[0].engine.pcManager.subscriber._pc
  pc.connectionState = 'disconnected'; pc.iceConnectionState = 'disconnected'
  h.tick(500)
  assert.equal(h.render().mediaStatus, 'recovering')
  assert.equal(h.render().mediaConnected, false)
  h.tick(9999)
  assert.equal(h.messages.length, 0)
  h.tick(1); h.tick(5000)
  assert.equal(h.render().mediaStatus, 'timeout')
  assert.equal(h.messages.filter(message => message.includes('媒体连接超时')).length, 1)
  pc.connectionState = 'connected'; pc.iceConnectionState = 'completed'; h.tick(500)
  assert.equal(h.render().mediaStatus, 'connected')
  h.render().leave(); h.tick(20000)
  assert.equal(h.render().mediaStatus, 'idle')
  assert.equal(h.timers.size, 0)
  assert.equal(h.messages.length, 1)
})

test('unavailable private SDK diagnostics leave audio usable without false media timeout', async () => {
  const h = harness(); await h.render().join()
  h.rooms[0].engine = {}; h.tick(500); h.tick(30000)
  assert.equal(h.render().joined, true)
  assert.equal(h.render().mediaStatus, 'unavailable')
  assert.equal(h.render().mediaConnected, false)
  assert.equal(h.messages.length, 0)
  h.render().leave()
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

test('voice and screen share reuse capture without duplicate microphone audio or administrator-mute bypass', async () => {
  const h = harness()
  const share = await h.microphoneCapture.acquire({ consumer: 'screen-share' })
  await h.render().join()
  const sharedTrack = share.stream.getAudioTracks()[0]
  assert.equal(sharedTrack.enabled, false, 'voice publishing owns microphone delivery')
  h.render().toggleMic()
  assert.equal(sharedTrack.enabled, true, 'an independent share microphone remains available when room voice is muted')
  const room = h.rooms[0]
  room.localParticipant.metadata = '{"adminMuted":true}'
  room.emit(h.RoomEvent.ParticipantMetadataChanged)
  assert.equal(sharedTrack.enabled, false)
  h.render().leave()
  share.setEnabled(false); share.setEnabled(true)
  assert.equal(sharedTrack.enabled, false, 'leaving voice cannot evade a room administrator mute')
  assert.equal(sharedTrack.stopped, false, 'leaving voice retains the share lease')
  h.render('room-b')
  assert.equal(sharedTrack.enabled, true, 'another room does not inherit moderation from the previous room')
  share.release()
  assert.ok(h.streams.every(stream => stream.getTracks().every(track => track.stopped)))
})

test('system audio sharing switches off microphone monitoring and rejects enabling a feedback loop', async () => {
  const h = harness(); await h.render().join()
  h.render().toggleMonitor()
  assert.equal(h.render().monitorEnabled, true)
  h.microphoneCapture.setScreenShareState({ active: true, systemAudio: true })
  assert.equal(h.render().monitorEnabled, false)
  h.render().toggleMonitor()
  assert.equal(h.render().monitorEnabled, false)
  assert.ok(h.messages.some(message => message.includes('重复录入')))
  h.microphoneCapture.setScreenShareState({ active: false, systemAudio: false })
  h.render().toggleMonitor()
  assert.equal(h.render().monitorEnabled, true)
  h.render().leave()
})

test('share microphone is silenced before LiveKit publication completes and restored when a pending join is cancelled', async () => {
  const publish = defer(), h = harness({ publish: () => publish.promise })
  const share = await h.microphoneCapture.acquire({ consumer: 'screen-share' })
  const joining = h.render().join(); await new Promise(resolve => setImmediate(resolve))
  assert.equal(share.stream.getAudioTracks()[0].enabled, false)
  h.render().leave(); publish.resolve(); await joining
  assert.equal(share.stream.getAudioTracks()[0].enabled, true)
  share.release()
})

test('system microphone revocation leaves voice visibly and a user-initiated retry opens a new physical stream', async () => {
  const h = harness(); await h.render().join()
  h.streams[0].getAudioTracks()[0].end()
  assert.equal(h.render().joined, false)
  assert.ok(h.rooms[0].disconnected)
  assert.ok(h.messages.some(message => message.includes('麦克风采集已被系统停止')))
  assert.equal(h.rooms.length, 1, 'capture is never resumed without another user join')
  await h.render().join()
  assert.equal(h.render().joined, true)
  assert.equal(h.rooms.length, 2)
  h.render().leave()
})
