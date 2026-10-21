import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function display(platform = 'android', overrides = {}) {
  const calls = [], events = new EventTarget()
  const native = {
    async toggleOrientation(options) { calls.push(['orientation', options.isLandscape]) },
    async setImmersive(options) { calls.push(['immersive', options.enabled]) },
    async unlockOrientation() { calls.push(['unlock']) },
    ...overrides,
  }
  const harmony = {
    async toggleOrientation(value) { assert.equal(this, harmony); calls.push(['orientation', value]) },
    async setImmersive(value) { calls.push(['immersive', value]) },
    async unlockOrientation() { calls.push(['unlock']) },
  }
  const api = loadTs('src/platform/playerDisplay.ts', {
    '@capacitor/core': { registerPlugin: () => native },
    './runtime': { getRuntimePlatform: () => platform, getHarmonyBridge: () => harmony },
  }, { window: events, Event, screen: { orientation: { lock: async value => calls.push(['web-lock', value]), unlock: () => calls.push(['unlock']) } } })
  return { ...api, calls }
}

test('Android receives an explicit landscape target on every fullscreen entry, including re-entry', async () => {
  const api = display()
  await api.setPlayerFullscreen(true)
  assert.equal(api.getOrientationLocked(), true)
  await api.setPlayerFullscreen(false)
  assert.equal(api.getOrientationLocked(), false)
  await api.setPlayerFullscreen(true)
  assert.deepEqual(api.calls.filter(c => c[0] === 'orientation'), [['orientation', true], ['orientation', true]])
  await api.playerDisplay.toggleOrientation(false)
  assert.deepEqual(api.calls.at(-1), ['orientation', false])
})

test('Harmony fullscreen locks landscape and exit restores automatic rotation', async () => {
  const api = display('harmony')
  await api.setPlayerFullscreen(true)
  await api.restorePlayerDisplay()
  assert.deepEqual(api.calls, [['immersive', true], ['orientation', true], ['immersive', false], ['unlock']])
  assert.equal(api.getOrientationLocked(), false)
})

test('late native lock completion cannot leave orientation locked after fullscreen exit', async () => {
  let complete
  const api = display('android', { toggleOrientation: () => new Promise(resolve => { complete = resolve }) })
  const entering = api.setPlayerFullscreen(true)
  await Promise.resolve()
  const exiting = api.restorePlayerDisplay()
  complete()
  await Promise.all([entering, exiting])
  assert.equal(api.getOrientationLocked(), false)
  assert.deepEqual(api.calls.at(-1), ['unlock'])
})

test('superseded queued fullscreen requests do not briefly lock the wrong state', async () => {
  const api = display()
  await Promise.all([api.setPlayerFullscreen(true), api.setPlayerFullscreen(false)])
  assert.deepEqual(api.calls, [['immersive', false], ['unlock']])
})

test('system bar failure still attempts orientation restoration and does not block later transitions', async () => {
  let fail = true
  const api = display('android', { async setImmersive() { if (fail) throw new Error('bar failure') } })
  await api.playerDisplay.toggleOrientation(true)
  await assert.rejects(api.restorePlayerDisplay(), /bar failure/)
  assert.equal(api.getOrientationLocked(), false)
  fail = false
  await api.setPlayerFullscreen(true)
  assert.equal(api.getOrientationLocked(), true)
})

test('orientation failure leaves the unlocked state and fullscreen can still be exited', async () => {
  const api = display('android', { async toggleOrientation() { throw new Error('lock denied') } })
  await assert.rejects(api.setPlayerFullscreen(true), /lock denied/)
  assert.equal(api.getOrientationLocked(), false)
  await api.setPlayerFullscreen(false)
  assert.deepEqual(api.calls.at(-1), ['unlock'])
})

test('ordinary browser fullscreen does not require a mobile orientation lock', async () => {
  const api = display('web')
  await api.setPlayerFullscreen(true)
  assert.deepEqual(api.calls, [])
  assert.equal(api.getOrientationLocked(), false)
})

for (const platform of ['android', 'harmony']) {
  test(`${platform} locks portrait video to portrait, landscape video to landscape, and restores on exit`, async () => {
    const api = display(platform)
    for (const [width, height, landscape] of [[1080,1920,false],[720,1280,false],[1920,1080,true],[0,0,true],[1080,1080,true]]) {
      assert.equal(api.getVideoFullscreenLandscape({videoWidth:width,videoHeight:height}), landscape)
      await api.setPlayerFullscreen(true, landscape)
      assert.deepEqual(api.calls.at(-1), ['orientation', landscape])
      await api.restorePlayerDisplay()
      assert.equal(api.getOrientationLocked(), false)
    }
  })
}
