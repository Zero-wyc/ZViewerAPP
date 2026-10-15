import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let n = 0; n < 16; n++) await Promise.resolve() }
function harness(options = {}) {
  const streams = [], calls = [], policies = []
  class Track extends EventTarget {
    kind = 'audio'; readyState = 'live'; enabled = true; stops = 0
    clone() { return new Track() }
    stop() { this.stops++; this.readyState = 'ended' }
    end() { this.readyState = 'ended'; this.dispatchEvent(new Event('ended')) }
  }
  class MediaStream {
    constructor(tracks = [new Track()]) { this.tracks = tracks; streams.push(this) }
    getTracks() { return this.tracks }
    getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio') }
  }
  const { createMicrophoneCapture } = loadTs('src/platform/microphoneCapture.ts', {
    './permissions': { permissions: {} }, './roomMicrophoneCoordination': { coordinateRoomMicrophone: async () => {}, coordinateMicrophonePolicy: async () => {} },
  }, { MediaStream })
  const api = createMicrophoneCapture(async () => { calls.push('capture'); return options.capture ? options.capture() : new MediaStream() },
    async active => { calls.push(active ? 'native-pause' : 'native-resume'); await options.coordinate?.(active) },
    async policy => { policies.push(policy) })
  return { api, calls, policies, streams, MediaStream, Track }
}

test('concurrent consumers share one physical capture, mute independently, and close only after the last release', async () => {
  const t = harness()
  const [voice, share] = await Promise.all([t.api.acquire({ consumer: 'voice' }), t.api.acquire({ consumer: 'screen-share' })])
  assert.deepEqual(t.calls, ['native-pause', 'capture'])
  assert.notEqual(voice.stream.getAudioTracks()[0], share.stream.getAudioTracks()[0])
  voice.setEnabled(false)
  assert.equal(voice.stream.getAudioTracks()[0].enabled, false)
  assert.equal(share.stream.getAudioTracks()[0].enabled, true)
  voice.release(); voice.release()
  assert.equal(t.streams[0].getAudioTracks()[0].stops, 0)
  assert.equal(share.stream.getAudioTracks()[0].stops, 0)
  share.release(); await flush()
  assert.ok(t.streams.every(stream => stream.getTracks().every(track => track.stops === 1)))
  assert.deepEqual(t.calls, ['native-pause', 'capture', 'native-resume'])
})

test('cancelling one pending acquire neither cancels another consumer nor opens another physical recorder', async () => {
  const capture = defer(), t = harness({ capture: () => capture.promise }), cancel = new AbortController()
  const voice = t.api.acquire({ consumer: 'voice', signal: cancel.signal })
  const rejected = assert.rejects(voice, error => error.name === 'AbortError')
  const share = t.api.acquire({ consumer: 'screen-share' })
  await flush(); cancel.abort(); await rejected
  capture.resolve(new t.MediaStream())
  const lease = await share
  assert.deepEqual(t.calls, ['native-pause', 'capture'])
  assert.equal(lease.stream.getAudioTracks()[0].stops, 0)
  lease.release()
})

test('cancelled authorization releases late tracks and Android priority only after the late physical capture stops', async () => {
  const capture = defer(), t = harness({ capture: () => capture.promise }), cancel = new AbortController()
  const pending = t.api.acquire({ consumer: 'voice', signal: cancel.signal })
  const rejected = assert.rejects(pending, error => error.name === 'AbortError')
  await flush(); cancel.abort(); await rejected
  assert.deepEqual(t.calls, ['native-pause', 'capture'])
  const raw = new t.MediaStream(); capture.resolve(raw); await flush()
  assert.equal(raw.getAudioTracks()[0].stops, 1)
  assert.equal(t.calls.at(-1), 'native-resume')
  assert.equal(t.streams.length, 1, 'cancelled consumers receive no clone')
})

test('all waiters see permission failure and the next request can retry with a fresh recorder', async () => {
  const capture = defer(); let attempt = 0
  const t = harness({ capture: () => ++attempt === 1 ? capture.promise : new t.MediaStream() })
  const a = t.api.acquire({ consumer: 'voice' }), b = t.api.acquire({ consumer: 'screen-share' })
  const denied = Promise.all([assert.rejects(a, error => error.name === 'NotAllowedError'), assert.rejects(b, error => error.name === 'NotAllowedError')])
  await flush(); capture.reject(new DOMException('denied', 'NotAllowedError')); await denied
  const lease = await t.api.acquire({ consumer: 'voice' })
  assert.equal(t.calls.filter(call => call === 'capture').length, 2)
  lease.release()
})

test('cancel while Android releases its native mic never opens WebView capture, and a new waiter can retry', async () => {
  const priority = defer(), cancel = new AbortController()
  const t = harness({ coordinate: active => active ? priority.promise : undefined })
  const pending = t.api.acquire({ consumer: 'voice', signal: cancel.signal })
  const rejected = assert.rejects(pending, error => error.name === 'AbortError')
  cancel.abort(); await rejected; priority.resolve(); await flush()
  assert.deepEqual(t.calls, ['native-pause', 'native-resume'])
  const lease = await t.api.acquire({ consumer: 'voice' }); lease.release()
  assert.equal(t.calls.filter(call => call === 'capture').length, 1)
})

test('moderation and voice priority affect current and future share leases without changing user microphone intent', async () => {
  const t = harness(); t.api.setRoomScope('room-a')
  const share = await t.api.acquire({ consumer: 'screen-share' })
  const track = share.stream.getAudioTracks()[0]
  t.api.setVoiceState({ joined: true, publishing: true }); assert.equal(track.enabled, false)
  t.api.setVoiceState({ joined: true, publishing: false }); assert.equal(track.enabled, true)
  t.api.setVoiceState({ joined: true, publishing: false, adminMuted: true }); assert.equal(track.enabled, false)
  t.api.setVoiceState({ joined: false, publishing: false })
  assert.equal(t.policies.at(-1).adminMuted, true)
  share.setEnabled(true); assert.equal(track.enabled, false)
  const later = await t.api.acquire({ consumer: 'screen-share' }); assert.equal(later.stream.getAudioTracks()[0].enabled, false)
  share.setEnabled(false)
  t.api.setVoiceState({ joined: true, publishing: false, adminMuted: false })
  assert.equal(track.enabled, false, 'administrator unmute must retain the consumer mute')
  assert.equal(later.stream.getAudioTracks()[0].enabled, true)
  share.release(); later.release()
})

test('native microphone handoff serializes a new acquire after the preceding release, including a failed transition', async () => {
  const calls = [], release = defer()
  const { coordinateRoomMicrophone } = loadTs('src/platform/roomMicrophoneCoordination.ts', {
    '@capacitor/core': { registerPlugin: () => ({ async setRoomMicrophoneActive({ active }) { calls.push(active); if (!active) await release.promise } }) },
    './runtime': { getRuntimePlatform: () => 'android' },
  })
  await coordinateRoomMicrophone(true)
  const releasing = coordinateRoomMicrophone(false), acquiring = coordinateRoomMicrophone(true)
  const rejected = assert.rejects(releasing, /test release failure/)
  await flush(); assert.deepEqual(calls, [true, false])
  release.reject(new Error('test release failure')); await rejected; await acquiring
  assert.deepEqual(calls, [true, false, true])
})

test('Android receives administrator policy before WebView releases microphone ownership, so leaving cannot briefly resume shared mic', async () => {
  const calls = [], policyApplied = defer()
  const api = loadTs('src/platform/roomMicrophoneCoordination.ts', {
    '@capacitor/core': { registerPlugin: () => ({
      async setRoomMicrophoneActive({ active }) { calls.push(['physical', active]) },
      async setMicrophonePolicy({ adminMuted }) { calls.push(['muted', adminMuted]); if (adminMuted) await policyApplied.promise },
    }) },
    './runtime': { getRuntimePlatform: () => 'android' },
  })
  await api.coordinateRoomMicrophone(true)
  const muting = api.coordinateMicrophonePolicy({ adminMuted: true, voicePublishing: false })
  const leaving = api.coordinateRoomMicrophone(false)
  await flush(); assert.deepEqual(calls, [['physical', true], ['muted', true]])
  policyApplied.resolve(); await muting; await leaving
  assert.deepEqual(calls, [['physical', true], ['muted', true], ['physical', false]])
})

test('a system-ended recorder invalidates all old leases, notifies once, and requires explicit acquire for a fresh capture', async () => {
  const t = harness(), ended = []
  const voice = await t.api.acquire({ consumer: 'voice', onEnded: () => ended.push('voice') })
  const share = await t.api.acquire({ consumer: 'screen-share', onEnded: () => ended.push('share') })
  t.streams[0].getAudioTracks()[0].end()
  assert.deepEqual(ended, ['voice', 'share'])
  assert.equal(voice.stream.getAudioTracks()[0].readyState, 'ended')
  assert.equal(share.stream.getAudioTracks()[0].readyState, 'ended')
  assert.equal(t.calls.filter(call => call === 'capture').length, 1)
  const fresh = await t.api.acquire({ consumer: 'screen-share' })
  assert.equal(t.calls.filter(call => call === 'capture').length, 2)
  assert.equal(fresh.stream.getAudioTracks()[0].readyState, 'live')
  voice.release(); share.release()
  assert.equal(fresh.stream.getAudioTracks()[0].readyState, 'live', 'stale release cannot stop the new physical source')
  fresh.release()
})

test('explicit acquire detects an ended source even when the platform omitted its ended event', async () => {
  const t = harness(); let ended = 0
  const old = await t.api.acquire({ consumer: 'voice', onEnded: () => ended++ })
  t.streams[0].getAudioTracks()[0].readyState = 'ended'
  const fresh = await t.api.acquire({ consumer: 'screen-share' })
  assert.equal(ended, 1)
  assert.equal(fresh.stream.getAudioTracks()[0].readyState, 'live')
  assert.equal(t.calls.filter(call => call === 'capture').length, 2)
  old.release(); fresh.release()
})
