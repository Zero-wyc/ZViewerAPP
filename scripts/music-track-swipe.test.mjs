import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'

async function harness(enabled = true) {
  const context = createContext({})
  const code = stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/music/hooks/useMusicTrackSwipe.ts', import.meta.url), 'utf8'))
  const module = new SourceTextModule(code, { context })
  await module.link(() => new SyntheticModule(['useRef'], function () { this.setExport('useRef', current => ({ current })) }, { context }))
  await module.evaluate()
  const calls = [], hook = module.namespace.useMusicTrackSwipe(() => calls.push('prev'), () => calls.push('next'), enabled)
  const event = (x, y, time = 0, id = 1) => ({ pointerId: id, clientX: x, clientY: y, timeStamp: time, button: 0, isPrimary: true, currentTarget: { setPointerCapture() {} } })
  return { calls, hook, event }
}

test('horizontal swipes switch once, left to next and right to previous', async () => {
  const { calls, hook, event } = await harness()
  hook.onPointerDown(event(100, 30)); hook.onPointerUp(event(40, 32, 200)); hook.onPointerUp(event(20, 32, 250))
  hook.onPointerDown(event(40, 30, 300)); hook.onPointerUp(event(100, 32, 500))
  assert.deepEqual(calls, ['next', 'prev'])
})
test('taps, vertical scrolling, ambiguous diagonals and long selection drags do not switch songs', async () => {
  const { calls, hook, event } = await harness()
  for (const [x,y,t] of [[85,31,200],[95,110,200],[140,70,200],[40,30,1200]]) {
    hook.onPointerDown(event(100,30)); hook.onPointerUp(event(x,y,t))
  }
  assert.deepEqual(calls, [])
})
test('cancelled gestures and a different pointer cannot trigger a track change', async () => {
  const { calls, hook, event } = await harness()
  hook.onPointerDown(event(100,30)); hook.onPointerUp(event(20,30,200,2))
  hook.onPointerCancel(); hook.onPointerUp(event(20,30,200))
  assert.deepEqual(calls, [])
})
test('the desktop or empty-player binding never consumes track gestures or arrow keys', async () => {
  const { calls, hook, event } = await harness(false)
  hook.onPointerDown(event(100,30)); hook.onPointerUp(event(20,30,200))
  hook.onKeyDown({ key: 'ArrowRight', preventDefault() { throw new Error('unexpected interception') } })
  assert.deepEqual(calls, [])
})
test('keyboard equivalents switch tracks while modified and repeated keys remain ignored', async () => {
  const { calls, hook } = await harness()
  let prevented = 0
  for (const extra of [{ key:'ArrowLeft' },{ key:'ArrowRight' },{ key:'ArrowLeft',ctrlKey:true },{ key:'ArrowRight',repeat:true }]) {
    hook.onKeyDown({ preventDefault() { prevented++ }, ...extra })
  }
  assert.deepEqual(calls, ['prev','next']); assert.equal(prevented,2)
})
