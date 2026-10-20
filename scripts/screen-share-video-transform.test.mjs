import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const flush = async () => { for (let n = 0; n < 30; n++) await Promise.resolve() }
function setup({ write, generatorFailure = false } = {}) {
  let input
  const frames = [], written = [], clones = [], outputs = [], notifications = []
  class Frame {
    constructor(source, options) {
      Object.assign(this, { visibleRect: { x: 0, y: 0, width: 1260, height: 2720 }, displayWidth: 1260, displayHeight: 2720, timestamp: 1, closed: 0 }, options ? { ...source, ...options, closed: 0 } : source)
      frames.push(this)
    }
    close() { this.closed++ }
  }
  const source = { stops: 0, stop() { this.stops++ }, clone() { const clone = { stops: 0, stop() { this.stops++ } }; clones.push(clone); return clone } }
  class Generator {
    constructor() {
      if (generatorFailure) throw new Error('generator unavailable')
      this.stops = 0
      this.writable = new WritableStream({ write: async frame => { written.push(frame); await write?.() } })
      outputs.push(this)
    }
    stop() { this.stops++ }
  }
  const api = loadTs('src/platform/screenShareVideoTransform.ts', {}, {
    VideoFrame: Frame, MediaStreamTrackProcessor: class { readable = new ReadableStream({ start(value) { input = value } }) }, MediaStreamTrackGenerator: Generator,
  })
  const options = { quality: { resolution: '720p', frameRate: 30 }, width: 1260, height: 2720, current: () => true, applied: () => notifications.push('applied'), failed: () => notifications.push('failed') }
  return { api, source, options, frames, written, clones, outputs, notifications, enqueue: value => input.enqueue(new Frame(value)), end: () => input.close() }
}

test('native fixed-canvas frames become one correctly oriented sending track and every frame is released', async () => {
  const t = setup(), stream = t.api.createScreenShareVideoTransform(t.source, t.options), originalTrack = stream.track
  t.enqueue({ timestamp: 100 }); await flush()
  assert.equal(t.written.at(-1).displayWidth, 592); assert.equal(t.written.at(-1).displayHeight, 1280)
  stream.resize(2720, 1260); t.enqueue({ timestamp: 200 }); await flush()
  const landscape = t.written.at(-1)
  assert.equal(landscape.displayWidth, 1260); assert.equal(landscape.displayHeight, 582); assert.equal(landscape.visibleRect.y, 1068); assert.equal(landscape.timestamp, 200)
  stream.resize(NaN, 0); t.enqueue({ timestamp: 300 }); await flush(); assert.equal(t.written.at(-1).displayWidth, 1260)
  stream.resize(1260, 2720); t.enqueue({ timestamp: 400 }); await flush()
  assert.equal(t.written.at(-1).displayHeight, 1280); assert.equal(stream.track, originalTrack)
  stream.stop(); stream.stop(); await flush()
  assert.equal(t.clones[0].stops, 1); assert.equal(t.outputs[0].stops, 1); assert.equal(t.source.stops, 0)
  assert.ok(t.frames.every(frame => frame.closed === 1)); assert.equal(t.notifications.includes('failed'), false)
})

test('stopping during a queued native write cannot publish late dimensions or retain its input frame', async () => {
  let complete
  const pending = new Promise(resolve => { complete = resolve }), t = setup({ write: () => pending })
  const stream = t.api.createScreenShareVideoTransform(t.source, t.options)
  t.enqueue({}); await flush(); assert.equal(t.written.length, 1)
  stream.resize(2720, 1260); stream.stop(); complete(); await flush()
  assert.equal(t.notifications.length, 0); assert.ok(t.frames.every(frame => frame.closed === 1))
  assert.equal(t.clones[0].stops, 1); assert.equal(t.outputs[0].stops, 1)
})

test('failed frame setup and ended native input clean their private resources', async () => {
  const invalid = setup({ generatorFailure: true })
  assert.throws(() => invalid.api.createScreenShareVideoTransform(invalid.source, invalid.options), /generator unavailable/)
  assert.equal(invalid.clones[0].stops, 1); assert.equal(invalid.source.stops, 0)
  const t = setup(), stream = t.api.createScreenShareVideoTransform(t.source, t.options)
  t.end(); await flush(); assert.deepEqual(t.notifications, ['failed']); assert.equal(t.outputs[0].stops, 1)
  stream.stop(); assert.equal(t.outputs[0].stops, 1)
})
