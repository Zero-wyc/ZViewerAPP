import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { attachWatchVideoGestures } from '../src/mobile/watchVideoGestures.ts'

async function load(path, imports, globals = {}) {
  const context = createContext({ console, ...globals })
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8')), { context })
  await module.link(name => new SyntheticModule(Object.keys(imports[name]), function () {
    for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
  }, { context }))
  await module.evaluate()
  return module.namespace
}

test('brightness leases clamp values, coalesce writes and restore the prior window override', async () => {
  const writes = []
  const port = { get: async () => ({ brightness: .4, override: -1 }), set: async value => { writes.push(value) } }
  const api = await load('../src/mobile/playerBrightness.ts', { '../platform/playerDisplay': { windowBrightness: port } })
  const manager = api.createBrightnessManager(port), lease = manager.acquire()
  assert.equal(await lease.get(), .4)
  await Promise.all([lease.set(.6), lease.set(.7), lease.set(2)])
  assert.deepEqual(writes, [1])
  await lease.set(-2); assert.equal(writes.at(-1), .05)
  await lease.release(); assert.equal(writes.at(-1), -1)
  const count = writes.length
  await lease.set(.8); await lease.release(); assert.equal(writes.length, count)
})

test('overlapping players cannot restore over a newer owner and the last exit restores baseline', async () => {
  const writes = [], port = { get: async () => ({ brightness: .8, override: .8 }), set: async v => { writes.push(v) } }
  const api = await load('../src/mobile/playerBrightness.ts', { '../platform/playerDisplay': { windowBrightness: port } })
  const manager = api.createBrightnessManager(port), a = manager.acquire(), b = manager.acquire()
  await a.set(.3); await b.set(.6); await a.release()
  assert.equal(writes.at(-1), .6)
  await b.release(); assert.equal(writes.at(-1), .8)
})

test('leaving during a delayed native read prevents a late brightness override', async () => {
  let resolve
  const writes = [], port = { get: () => new Promise(done => { resolve = done }), set: async v => { writes.push(v) } }
  const api = await load('../src/mobile/playerBrightness.ts', { '../platform/playerDisplay': { windowBrightness: port } })
  const lease = api.createBrightnessManager(port).acquire()
  const pending = lease.set(.9)
  await Promise.resolve(); const released = lease.release()
  resolve({ brightness: .4, override: -1 })
  await pending; await released
  assert.deepEqual(writes, [-1])
})

test('a cancelled or disposed brightness gesture cannot apply a delayed read', async () => {
  let resolve
  const writes = [], port = { get: () => new Promise(done => { resolve = done }), set: async v => { writes.push(v) } }
  const api = await load('../src/mobile/playerBrightness.ts', { '../platform/playerDisplay': { windowBrightness: port } })
  const gesture = api.createBrightnessGesture(() => assert.fail('late notice'))
  gesture.begin(); gesture.move(.3); await Promise.resolve()
  gesture.end(true); gesture.dispose()
  resolve({ brightness: .4, override: -1 })
  await new Promise(done => setImmediate(done))
  assert.deepEqual(writes, [-1])
})

test('native brightness failures remain retryable and are reported without unhandled rejections', async () => {
  let fail = true
  const notices = [], port = { get: async () => { if (fail) throw Error('read'); return { brightness: .4, override: -1 } }, set: async () => {} }
  const api = await load('../src/mobile/playerBrightness.ts', { '../platform/playerDisplay': { windowBrightness: port } })
  const gesture = api.createBrightnessGesture(text => notices.push(text))
  gesture.begin(); gesture.move(.2)
  await new Promise(done => setImmediate(done)); assert.match(notices[0], /无法读取/)
  fail = false; gesture.begin(); gesture.move(.2)
  await new Promise(done => setImmediate(done)); assert.equal(notices.at(-1), '亮度 60%')
  gesture.dispose()
})

async function screenPlayer(t, fullscreen = true) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let now = 0
  t.mock.method(performance, 'now', () => now)
  class Surface extends EventTarget {
    style = {}; classList = { contains: () => false }
    captured = new Set()
    ownerDocument = Object.assign(new EventTarget(), { defaultView: new EventTarget(), hidden: false })
    getBoundingClientRect() { return { left: 0, width: 600, height: 300 } }
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
    querySelector(selector) { return selector === 'video' ? this : null }
  }
  const element = Object.assign(new Surface(), { volume: .5, muted: false, paused: false, currentTime: 15,
    play() { this.paused = false; return Promise.resolve() }, pause() { this.paused = true } })
  const effects = [], states = [], level = { value: .5, base: .5, released: false }
  const api = await load('../src/mobile/useScreenShareLevelGestures.ts', {
    react: { useState: initial => [initial, next => states.push(next)], useEffect: fn => effects.push(fn), useRef: current => ({ current }) },
    './watchVideoGestures': { attachWatchVideoGestures },
    './playerBrightness': { createBrightnessGesture: notice => ({ begin() { level.base = level.value },
      move(f) { level.value = Math.max(.05, Math.min(1, level.base + f)); notice('亮度') }, end() {}, dispose() { level.released = true } }) },
    '../platform/runtime': { isGlobalAppearanceRuntime: () => true },
  }, { Element: Surface, MutationObserver: class { observe() {} disconnect() {} }, setTimeout, clearTimeout })
  api.useScreenShareLevelGestures({ stage: { current: element }, video: { current: element }, fullscreen, enabled: true, autoHideDisabled: false })
  const cleanup = effects.map(fn => fn()).filter(Boolean)
  const event = (type, x, y, extra = {}) => {
    now += 40
    const e = Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true, ...extra })
    ;(type === 'pointerdown' ? element : element.ownerDocument.defaultView).dispatchEvent(e)
  }
  t.after(() => cleanup.forEach(fn => fn()))
  return { element, event, level, states, cleanup }
}

for (const fullscreen of [false, true]) {
  test(`screen sharing adjusts left brightness and right local volume without seeking (${fullscreen ? 'fullscreen' : 'inline'})`, async t => {
    const p = await screenPlayer(t, fullscreen)
    p.event('pointerdown', 80, 200); p.event('pointermove', 80, 50); p.event('pointerup', 80, 50)
    assert.equal(p.level.value, 1); assert.equal(p.element.volume, .5)
    p.event('pointerdown', 550, 80); p.event('pointerup', 550, 230)
    assert.equal(p.element.volume, 0); assert.equal(p.element.muted, true)
    p.event('pointerdown', 550, 230); p.event('pointerup', 550, 80)
    assert.equal(p.element.volume, .5); assert.equal(p.element.muted, false)
    p.event('pointerdown', 50, 100); p.event('pointerup', 550, 100)
    assert.equal(p.element.currentTime, 15); assert.equal(p.element.paused, false)
    p.cleanup.forEach(fn => fn()); assert.equal(p.level.released, true)
  })
}

test('screen-sharing double tap keeps fullscreen pause while drags never turn into taps', async t => {
  const p = await screenPlayer(t)
  for (let i = 0; i < 2; i++) { p.event('pointerdown', 300, 100); p.event('pointerup', 300, 100) }
  assert.equal(p.element.paused, true)
  p.event('pointerdown', 550, 80); p.event('pointerup', 550, 230)
  t.mock.timers.tick(400)
  assert.equal(p.element.paused, true)
})
