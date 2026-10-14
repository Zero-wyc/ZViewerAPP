import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function recognizer() {
  let now = 0, id = 0, singles = 0, doubles = 0
  const timers = new Map()
  const api = loadTs('src/mobile/useScreenShareDisplay.ts', {
    react: {}, '@/hooks/useControlBarAutoHide': {}, '../platform/runtime': {},
  }, {
    setTimeout: (callback, delay) => { timers.set(++id, { callback, due: now + delay }); return id },
    clearTimeout: id => timers.delete(id),
  })
  const taps = api.createScreenShareTapHandler(() => singles++, () => doubles++)
  return { ...taps, tick(ms) { now += ms; for (const [key, timer] of timers) if (timer.due <= now) { timers.delete(key); timer.callback() } }, counts: () => ({ singles, doubles }) }
}
test('single tap waits for the double-tap window before toggling controls', () => {
  const taps = recognizer()
  taps.tap(); taps.tick(279)
  assert.deepEqual(taps.counts(), { singles: 0, doubles: 0 })
  taps.tick(1)
  assert.deepEqual(taps.counts(), { singles: 1, doubles: 0 })
})
test('double tap toggles playback once and never also toggles controls', () => {
  const taps = recognizer()
  taps.tap(); taps.tick(140); taps.tap(); taps.tick(1000)
  assert.deepEqual(taps.counts(), { singles: 0, doubles: 1 })
})
test('separate taps each toggle controls and repeated double taps each toggle playback', () => {
  const taps = recognizer()
  taps.tap(); taps.tick(300); taps.tap(); taps.tick(300)
  taps.tap(); taps.tap(); taps.tap(); taps.tap(); taps.tick(300)
  assert.deepEqual(taps.counts(), { singles: 2, doubles: 2 })
})
test('leaving fullscreen, cancellation and interactive controls cancel the pending tap', () => {
  const taps = recognizer()
  taps.tap(); taps.cancel(); taps.tick(1000)
  assert.deepEqual(taps.counts(), { singles: 0, doubles: 0 })
  taps.tap(); taps.tick(300)
  assert.deepEqual(taps.counts(), { singles: 1, doubles: 0 })
})
