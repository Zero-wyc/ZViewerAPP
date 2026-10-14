import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function setup(options = {}) {
  const node = parentElement => ({ parentElement, isConnected: true, attrs: new Set(), setAttribute(name) { this.attrs.add(name) }, removeAttribute(name) { this.attrs.delete(name) } })
  const root = node(null), body = node(root), stage = node(body)
  class Stream { getVideoTracks() { return this.tracks } tracks = [{ readyState: 'live', enabled: true, muted: false }] }
  const video = { readyState: 2, videoWidth: 1920, videoHeight: 1080, srcObject: new Stream() }
  const calls = [], window = new EventTarget()
  const native = {
    getPictureInPictureSupport: async () => ({ supported: true }),
    enterPictureInPicture: async value => { calls.push(['enter', value]); await options.enter?.() },
    exitPictureInPicture: async () => { calls.push(['exit']) },
    ...options.native,
  }
  const api = loadTs('src/platform/webrtcPictureInPicture.ts', {
    '@capacitor/core': { registerPlugin: () => native },
    './runtime': { getRuntimePlatform: () => options.platform || 'android' },
  }, { window, document: { documentElement: root }, MediaStream: Stream, requestAnimationFrame: callback => queueMicrotask(callback) })
  return { ...api, stage, root, body, video, calls, window }
}

test('PiP requires decoded video frames and a live, enabled, unmuted video track', () => {
  const api = setup(), { video } = api
  assert.equal(api.hasPictureInPictureFrame(null), false)
  assert.equal(api.hasPictureInPictureFrame(video), true)
  for (const property of ['readyState', 'videoWidth', 'videoHeight']) {
    const old = video[property]; video[property] = 0
    assert.equal(api.hasPictureInPictureFrame(video), false)
    video[property] = old
  }
  const track = video.srcObject.tracks[0]
  track.muted = true; assert.equal(api.hasPictureInPictureFrame(video), false)
  track.muted = false; track.enabled = false; assert.equal(api.hasPictureInPictureFrame(video), false)
  track.enabled = true; track.readyState = 'ended'; assert.equal(api.hasPictureInPictureFrame(video), false)
})

test('native PiP preserves the video stream and restores layout once on system exit', async () => {
  const api = setup(), stream = api.video.srcObject
  let left = 0
  const dispose = await api.enterNativePictureInPicture(api.stage, api.video, () => left++)
  assert(api.root.attrs.has('data-webrtc-native-pip'))
  assert.strictEqual(api.video.srcObject, stream)
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [['enter', { width: 1920, height: 1080 }]])
  api.window.dispatchEvent(new CustomEvent('zviewer:native-pip', { detail: { active: false } }))
  assert.equal(left, 1)
  assert.equal(api.root.attrs.size + api.body.attrs.size + api.stage.attrs.size, 0)
  dispose()
  assert.equal(api.calls.length, 1)
})

test('system permission/entry failures restore all layout attributes and preserve playback', async () => {
  const api = setup({ enter: async () => { throw Error('denied') } }), stream = api.video.srcObject
  await assert.rejects(api.enterNativePictureInPicture(api.stage, api.video, () => {}), /denied/)
  assert.equal(api.root.attrs.size + api.body.attrs.size + api.stage.attrs.size, 0)
  assert.strictEqual(api.video.srcObject, stream)
})

test('room teardown while native entry is pending closes the late window and cannot reactivate PiP', async () => {
  let complete
  const api = setup({ enter: () => new Promise(resolve => { complete = resolve }) }), abort = new AbortController()
  const entering = api.enterNativePictureInPicture(api.stage, api.video, () => {}, abort.signal)
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.equal(typeof complete, 'function')
  abort.abort()
  assert.equal(api.root.attrs.size + api.body.attrs.size + api.stage.attrs.size, 0)
  complete()
  assert.equal(await entering, null)
  assert.equal(api.calls.at(-1)[0], 'exit')
})

test('unmount before transition painting never opens a native window', async () => {
  const api = setup()
  const entering = api.enterNativePictureInPicture(api.stage, api.video, () => {})
  api.stage.isConnected = false
  await assert.rejects(entering, /画面尚未就绪/)
  assert.equal(api.calls.length, 0)
  assert.equal(api.root.attrs.size + api.body.attrs.size + api.stage.attrs.size, 0)
})

test('old Android hosts fail capability detection safely; Harmony never calls the Android plugin', async () => {
  const old = setup({ native: { getPictureInPictureSupport: async () => { throw Error('unimplemented') } } })
  assert.equal(await old.supportsNativePictureInPicture(), false)
  const harmony = setup({ platform: 'harmony', native: { getPictureInPictureSupport: async () => { throw Error('must not call') } } })
  assert.equal(await harmony.supportsNativePictureInPicture(), false)
})
