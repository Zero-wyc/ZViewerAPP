import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'

async function loadSource(relativePath, imports, globals = {}) {
  const context = createContext({ ...globals })
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context })
  await module.link(name => {
    const exports = imports[name]
    assert.ok(exports, `Unexpected dependency: ${name}`)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

async function displayHarness(platform = 'android', onImmersive = async () => {}) {
  const calls = []
  const setImmersive = async enabled => { calls.push(['immersive', enabled]); await onImmersive(enabled) }
  const rotate = async landscape => { calls.push(['orientation', landscape]) }
  const unlock = async () => { calls.push(['unlock']) }
  const api = await loadSource('../src/platform/playerDisplay.ts', {
    '@capacitor/core': { registerPlugin: () => ({
      setImmersive: ({ enabled }) => setImmersive(enabled),
      toggleOrientation: ({ isLandscape }) => rotate(isLandscape),
      unlockOrientation: unlock,
    }) },
    './runtime': {
      getRuntimePlatform: () => platform,
      getHarmonyBridge: () => ({ setImmersive, toggleOrientation: rotate, unlockOrientation: unlock }),
    },
  }, { window: new EventTarget(), Event })
  return { api, calls }
}

for (const platform of ['android', 'harmony']) {
  test(`${platform}: expanding and collapsing preserves the user's orientation lock`, async () => {
    const { api, calls } = await displayHarness(platform)
    await api.playerDisplay.toggleOrientation(false)
    calls.length = 0
    const display = api.acquirePlayerImmersive()
    await display.ready
    await display.release()
    await display.release()
    assert.deepEqual(calls, [['immersive', true], ['immersive', false]])
    assert.equal(api.getOrientationLocked(), true)
  })
}

test('rapid open/close/open serializes a pending native call and keeps the final open state', async () => {
  let finishFirst
  let started
  const firstStarted = new Promise(resolve => { started = resolve })
  let first = true
  const { api, calls } = await displayHarness('harmony', () => {
    if (!first) return Promise.resolve()
    first = false
    started()
    return new Promise(resolve => { finishFirst = resolve })
  })
  const old = api.acquirePlayerImmersive()
  await firstStarted
  const closing = old.release()
  const current = api.acquirePlayerImmersive()
  assert.deepEqual(calls, [['immersive', true]], 'native calls must not overlap')
  finishFirst()
  await Promise.all([old.ready, closing, current.ready])
  assert.deepEqual(calls, [['immersive', true], ['immersive', true]])
  await current.release()
  assert.deepEqual(calls.at(-1), ['immersive', false])
})

test('an old music cleanup cannot undo a newer video fullscreen request', async () => {
  const { api, calls } = await displayHarness()
  const old = api.acquirePlayerImmersive()
  await old.ready
  const video = api.setPlayerFullscreen(true, false)
  await old.release()
  await video
  assert.deepEqual(calls, [['immersive', true], ['immersive', true], ['orientation', false]])
  await api.setPlayerFullscreen(false)
  assert.deepEqual(calls.slice(-2), [['immersive', false], ['unlock']])
})

test('an old music cleanup cannot undo a newer music overlay', async () => {
  const { api, calls } = await displayHarness()
  const old = api.acquirePlayerImmersive()
  await old.ready
  const current = api.acquirePlayerImmersive()
  await current.ready
  await old.release()
  assert.deepEqual(calls, [['immersive', true], ['immersive', true]])
  await current.release()
  assert.deepEqual(calls.at(-1), ['immersive', false])
})

test('a failed native entry still permits cleanup and a later entry', async () => {
  let fail = true
  const { api, calls } = await displayHarness('harmony', async () => {
    if (fail) { fail = false; throw new Error('native rejected') }
  })
  const old = api.acquirePlayerImmersive()
  await assert.rejects(old.ready, /native rejected/)
  await old.release()
  const current = api.acquirePlayerImmersive()
  await current.ready
  await current.release()
  assert.deepEqual(calls, [['immersive', true], ['immersive', false], ['immersive', true], ['immersive', false]])
})

for (const native of [false, true]) {
  test(`the music hook acquires only an actually expanded supported native overlay (${native})`, async () => {
    let effect
    let acquired = 0
    let released = 0
    const api = await loadSource('../src/mobile/useMusicOverlayImmersive.ts', {
      react: { useEffect: callback => { effect = callback } },
      '../platform/runtime': { isGlobalAppearanceRuntime: () => native },
      '../platform/playerDisplay': { acquirePlayerImmersive: () => {
        acquired++
        return { ready: Promise.resolve(), release: async () => { released++ } }
      } },
    })
    api.useMusicOverlayImmersive(false)
    assert.equal(effect(), undefined)
    assert.equal(acquired, 0)
    api.useMusicOverlayImmersive(true)
    const cleanup = effect()
    assert.equal(acquired, native ? 1 : 0)
    cleanup?.()
    assert.equal(released, native ? 1 : 0)
  })
}
