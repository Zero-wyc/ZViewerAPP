import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import * as math from '../src/upstream/modules/music/audio/loudness.ts'
import { applyMusicOutputVolume } from '../src/upstream/modules/music/utils/volume.ts'

async function fixture(options = {}) {
  let now = 1000, level = 0.5, stopped = 0, captures = 0, contexts = 0, closed = 0, disconnected = 0
  const timers = new Set(), storage = new Map(Object.entries(options.storage || {}))
  class Node {
    gain = { value: 0 }
    connect() { return this }
    disconnect() { disconnected++ }
    getFloatTimeDomainData(buffer) { buffer.fill(level) }
  }
  let context
  class AudioContext {
    state = options.suspended ? 'suspended' : 'running'
    sampleRate = 48000
    destination = new Node()
    constructor() { contexts++; context = this }
    resume() { return Promise.resolve() }
    close() { this.state = 'closed'; closed++; return Promise.resolve() }
    createMediaStreamSource() { return new Node() }
    createIIRFilter() { if (options.graphFailure) throw Error('unsupported filter'); return new Node() }
    createAnalyser() { return new Node() }
    createGain() { return new Node() }
  }
  const globals = { console, Map, Set, Float32Array, ArrayBuffer, performance: { now: () => now },
    window: { AudioContext: options.noContext ? undefined : AudioContext },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn) }
  const vm = createContext(globals)
  const source = await readFile(new URL('../src/upstream/modules/music/audio/loudnessNormalizer.ts', import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context: vm })
  await module.link(() => new SyntheticModule(Object.keys(math), function () {
    for (const [key, value] of Object.entries(math)) this.setExport(key, value)
  }, { context: vm }))
  await module.evaluate()
  const normalizer = new module.namespace.LoudnessNormalizer()
  const audio = { paused: false, ended: false, readyState: 4, muted: false, volume: 0.8,
    captureStream: options.noCapture ? undefined : () => {
      captures++
      const track = { stop() { stopped++ } }
      return { getAudioTracks: () => options.noTracks ? [] : [track], getTracks: () => [track] }
    } }
  return { normalizer, audio, storage, timers,
    tick(count = 1) { for (let i = 0; i < count; i++) { now += 100; for (const fn of [...timers]) fn() } },
    stats: () => ({ stopped, captures, contexts, closed, disconnected }),
    context: () => context, level: value => { level = value } }
}

test('disabled normalization neither allocates analysis resources nor applies cached attenuation', async () => {
  const f = await fixture({ storage: { 'zc-music-loudness-v1': JSON.stringify({ 'ncm:1': { gain: 0.5, lufs: -8, ts: 1 } }) } })
  f.normalizer.attach(f.audio)
  f.normalizer.beginTrack('ncm:1')
  f.tick(100)
  assert.equal(f.normalizer.getGain(), 1)
  assert.equal(f.timers.size, 0)
  assert.equal(f.stats().contexts, 0)
  assert.equal(f.stats().captures, 0)
  f.normalizer.setEnabled(true)
  assert.equal(f.normalizer.getGain(), 0.5)
  f.normalizer.setEnabled(false)
  assert.equal(f.normalizer.getGain(), 1)
  assert.equal(f.timers.size, 0)
})

test('loud tracks attenuate without changing the user preference; disable restores both audio elements', async () => {
  const f = await fixture(), preload = { volume: 0, muted: false }, preference = 0.8
  f.normalizer.setGainListener(gain => applyMusicOutputVolume(preference, gain, [f.audio, preload]))
  f.normalizer.attach(f.audio)
  f.normalizer.setEnabled(true)
  f.normalizer.beginTrack('ncm:1')
  f.tick(120)
  assert.ok(f.normalizer.getGain() >= math.dbToGain(-12) && f.normalizer.getGain() < 0.6)
  assert.ok(f.audio.volume < preference)
  assert.equal(f.audio.volume, preload.volume)
  assert.equal(preference, 0.8)
  assert.ok(f.storage.has('zc-music-loudness-v1'))
  f.normalizer.setEnabled(false)
  assert.equal(f.audio.volume, preference)
  assert.equal(preload.volume, preference)
})

test('quiet audio is never boosted and explicit mute remains independent from attenuation', async () => {
  const f = await fixture()
  f.level(0.02)
  f.normalizer.attach(f.audio); f.normalizer.setEnabled(true); f.normalizer.beginTrack('bili:fixture:1'); f.tick(100)
  assert.equal(f.normalizer.getGain(), 1)
  applyMusicOutputVolume(0, 0.3, [f.audio])
  assert.equal(f.audio.muted, true)
  assert.equal(f.audio.volume, 0)
  applyMusicOutputVolume(0.4, 0.3, [f.audio])
  assert.equal(f.audio.muted, false)
  assert.equal(f.audio.volume, 0.12)
  f.normalizer.setEnabled(false)
})

for (const unsupported of ['noContext', 'noCapture', 'graphFailure']) {
  test(`${unsupported} preserves direct audio output and releases partial analysis resources`, async () => {
    const f = await fixture({ [unsupported]: true })
    f.normalizer.attach(f.audio); f.normalizer.setEnabled(true); f.normalizer.beginTrack('ncm:1'); f.tick(50)
    assert.equal(f.normalizer.getGain(), 1)
    assert.equal(f.audio.paused, false)
    assert.equal(f.audio.volume, 0.8)
    assert.equal(f.timers.size, 0)
    if (unsupported === 'graphFailure') { assert.equal(f.stats().stopped, 1); assert.ok(f.stats().disconnected > 0) }
  })
}

test('suspended analysis contexts never pause or mute background playback', async () => {
  const f = await fixture({ suspended: true })
  f.normalizer.attach(f.audio); f.normalizer.setEnabled(true); f.normalizer.beginTrack('ncm:1'); f.tick(100)
  assert.equal(f.stats().captures, 0)
  assert.equal(f.audio.paused, false)
  assert.equal(f.audio.muted, false)
  f.context().state = 'running'; f.tick(50)
  assert.ok(f.normalizer.getGain() < 1)
  f.normalizer.setEnabled(false)
})

test('track changes rebuild capture taps and last-element retirement releases timers and context', async () => {
  const f = await fixture()
  f.normalizer.attach(f.audio); f.normalizer.setEnabled(true); f.normalizer.beginTrack('ncm:1'); f.tick(10)
  assert.equal(f.stats().captures, 1)
  f.normalizer.beginTrack('ncm:2'); f.tick(10)
  assert.equal(f.stats().stopped, 1)
  assert.equal(f.stats().captures, 2)
  f.normalizer.detach(f.audio)
  assert.equal(f.stats().stopped, 2)
  assert.equal(f.timers.size, 0)
  assert.equal(f.stats().closed, 1)
})

test('missing audio tracks retry finitely, release failed streams and reset at the next track', async () => {
  const f = await fixture({ noTracks: true })
  f.normalizer.attach(f.audio); f.normalizer.setEnabled(true); f.normalizer.beginTrack('ncm:1'); f.tick(200)
  assert.equal(f.stats().captures, 20)
  assert.equal(f.stats().stopped, 20)
  f.normalizer.beginTrack('ncm:2'); f.tick(5)
  assert.ok(f.stats().captures > 20)
  f.normalizer.setEnabled(false)
})
