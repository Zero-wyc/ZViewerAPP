import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { attachWatchVideoGestures } from '../src/mobile/watchVideoGestures.ts'

async function player(t, canControl = true) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let now = 0
  t.mock.method(performance, 'now', () => now)
  class Surface extends EventTarget {
    style = { touchAction: 'manipulation' }
    ownerDocument = Object.assign(new EventTarget(), { defaultView: new EventTarget(), hidden: false })
    captured = new Set()
    getBoundingClientRect() { return { left: 0, width: 600, height: 300 } }
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
    contains(target) { return target === this }
  }
  const element = new Surface(), video = Object.assign(element, {
    duration: 600, currentTime: 100, volume: .5, muted: false, paused: false,
    play() { this.paused = false; return Promise.resolve() }, pause() { this.paused = true },
  })
  const calls = [], effects = [], notice = { show: '' }
  const context = createContext({ Node: Surface, console })
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/room/watch-together/useWatchGestures.ts', import.meta.url), 'utf8')), { context })
  const imports = {
    react: { useEffect: fn => effects.push(fn), useLayoutEffect: fn => fn(), useRef: current => ({ current }) },
    '@/lib/utils': { formatDuration: value => String(Math.round(value)) },
    '@/modules/player/services/pause-intent': { clearUserPaused: () => calls.push('resume-intent'), markUserPaused: () => calls.push('pause-intent') },
    '../../../../platform/runtime': { isGlobalAppearanceRuntime: () => true },
    '../../../../mobile/watchVideoGestures': { attachWatchVideoGestures },
  }
  await module.link(name => new SyntheticModule(Object.keys(imports[name]), function () {
    for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
  }, { context }))
  await module.evaluate()
  module.namespace.useWatchGestures({ art: { notice, template: { $player: element, $state: new Surface() } }, video,
    stage: { current: element }, mediaKey: 'room:movie', canControl,
    toggleControls: () => calls.push('toggle'), requestPlay: () => calls.push('play-request'),
    requestPause: () => calls.push('pause-request'), requestSeek: position => calls.push(['seek-request', position]),
  })
  const cleanup = effects[0]()
  const event = (type, x = 300, y = 100, extra = {}) => {
    now += 50
    const ev = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, detail: 1, ...extra,
    })
    ;(type === 'pointerdown' || type === 'click' || type === 'dblclick' ? element : element.ownerDocument.defaultView).dispatchEvent(ev)
    return ev
  }
  const tap = x => { event('pointerdown', x); event('pointerup', x); event('click', x) }
  const tick = ms => { now += ms; t.mock.timers.tick(ms) }
  t.after(cleanup)
  return { element, video, calls, notice, event, tap, tick, cleanup }
}

test('single taps toggle once after the double-tap window, including synthesized click', async t => {
  const p = await player(t)
  p.tap(300); assert.deepEqual(p.calls, [])
  p.tick(320); assert.deepEqual(p.calls, ['toggle'])
  p.tap(300); p.tick(320); assert.deepEqual(p.calls, ['toggle', 'toggle'])
  assert.equal(p.video.paused, false)
})

test('double taps pause/resume centrally and seek in either side without toggling controls', async t => {
  const p = await player(t)
  p.tap(300); p.tap(300); p.event('dblclick'); p.tick(400)
  assert.equal(p.video.paused, true)
  assert.deepEqual(p.calls, ['pause-intent'])
  p.tap(300); p.tap(300); p.tick(400)
  assert.equal(p.video.paused, false)
  p.tap(50); p.tap(50); p.tick(400); assert.equal(p.video.currentTime, 85)
  p.tap(550); p.tap(550); p.tick(400); assert.equal(p.video.currentTime, 100)
  assert.deepEqual(p.calls, ['pause-intent', 'resume-intent'])
})

test('horizontal drag previews without seeking and commits once on release', async t => {
  const p = await player(t)
  p.event('pointerdown', 100)
  p.event('pointermove', 300)
  assert.equal(p.video.currentTime, 100)
  assert.match(p.notice.show, /160/)
  p.event('pointerup', 300); p.event('click', 300); p.tick(400)
  assert.equal(p.video.currentTime, 160)
  assert.deepEqual(p.calls, [])
  assert.equal(p.notice.show, '')
})

test('guest double taps and drag submit requests without changing local room playback', async t => {
  const p = await player(t, false)
  p.tap(300); p.tap(300); p.tick(400)
  p.tap(550); p.tap(550); p.tick(400)
  p.event('pointerdown', 100); p.event('pointermove', 300); p.event('pointerup', 300)
  assert.deepEqual(p.calls, ['pause-request', ['seek-request', 115], ['seek-request', 160]])
  assert.equal(p.video.currentTime, 100); assert.equal(p.video.paused, false)
})

test('right vertical swipe changes local volume, unmutes and clamps without a playback request', async t => {
  const p = await player(t, false)
  p.video.muted = true
  p.event('pointerdown', 550, 200); p.event('pointermove', 550, 50); p.event('pointerup', 550, 50)
  assert.equal(p.video.volume, .5); assert.equal(p.video.muted, false)
  p.event('pointerdown', 550, 100); p.event('pointerup', 550, 900)
  assert.equal(p.video.volume, 0); assert.equal(p.video.muted, true)
  p.event('pointerdown', 550, 200); p.event('pointerup', 550, -900)
  assert.equal(p.video.volume, 1)
  assert.deepEqual(p.calls, []); assert.equal(p.video.currentTime, 100)
})

for (const reason of ['pointercancel', 'blur', 'second-finger', 'source-change', 'dispose']) {
  test(`pending drag and tap cannot commit after ${reason}`, async t => {
    const p = await player(t)
    p.event('pointerdown', 100); p.event('pointermove', 300)
    if (reason === 'second-finger') p.event('pointerdown', 400, 100, { pointerId: 2, isPrimary: false })
    else if (reason === 'source-change') p.video.dispatchEvent(new Event('emptied'))
    else if (reason === 'dispose') p.cleanup()
    else p.event(reason)
    p.event('pointerup', 300); p.event('click', 300); p.tick(400)
    assert.equal(p.video.currentTime, 100); assert.deepEqual(p.calls, [])
    if (reason !== 'dispose') { p.tap(300); p.tick(320); assert.deepEqual(p.calls, ['toggle']) }
    else assert.equal(p.element.style.touchAction, 'manipulation')
  })
}

test('long presses, left vertical swipes, invalid durations and unrelated pointer releases do not seek', async t => {
  const p = await player(t)
  p.event('pointerdown', 100); p.tick(500); p.event('pointerup', 100); p.tick(400)
  p.event('pointerdown', 100, 200); p.event('pointerup', 100, 20); p.tick(400)
  p.video.duration = Infinity
  p.tap(550); p.tap(550); p.tick(400)
  p.event('pointerdown', 100); p.event('pointerup', 300, 100, { pointerId: 2 })
  p.event('pointercancel')
  assert.equal(p.video.currentTime, 100); assert.deepEqual(p.calls, [])
})

test('dragging clips to media bounds and ignores a synthetic double-click after release', async t => {
  const p = await player(t)
  p.video.currentTime = 5
  p.event('pointerdown', 300); p.event('pointerup', -600)
  assert.equal(p.video.currentTime, 0)
  p.video.currentTime = 595
  p.event('pointerdown', 300); p.event('pointerup', 1200); p.event('dblclick', 550)
  assert.equal(p.video.currentTime, 600); assert.deepEqual(p.calls, [])
})

test('toolbar input is not intercepted by the video recognizer', t => {
  const surface = Object.assign(new EventTarget(), { style: {}, ownerDocument: { defaultView: new EventTarget(), addEventListener() {}, removeEventListener() {} } })
  const remove = attachWatchVideoGestures(surface, { surface: () => false, onSingleTap() { assert.fail() } })
  t.after(remove)
  const down = Object.assign(new Event('pointerdown', { cancelable: true }), { isPrimary: true, button: 0 })
  surface.dispatchEvent(down)
  assert.equal(down.defaultPrevented, false)
})
