import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'

async function harness(handler) {
  const state = { server: 'https://fixture.invalid', epoch: 1, scope: 'one', enabled: true }
  const slots = [], effects = [], requests = []
  let cursor = 0, dirty = false, output
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(value) {
      const i = cursor++
      slots[i] ??= { value }
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; dirty = true }]
    },
    useCallback(fn, deps) {
      const i = cursor++
      if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { fn, deps }
      return slots[i].fn
    },
    useEffect(fn, deps) {
      const i = cursor++
      if (!slots[i] || !equal(slots[i].deps, deps)) {
        const previous = slots[i]
        const slot = slots[i] = { deps }
        effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn() })
      }
    },
  }
  const context = createContext({ AbortController, AbortSignal })
  const imports = {
    react,
    '@/lib/api': {
      getApiUrl: () => state.server, getAuthSessionEpoch: () => state.epoch,
      apiFetch: (url, options) => { requests.push({ url, ...options }); return handler(url, options) },
    },
  }
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../src/upstream/modules/voice-chat/hooks/useVoiceComponent.ts', import.meta.url), 'utf8')), { context })
  await module.link(name => new SyntheticModule(Object.keys(imports[name]), function () {
    for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
  }, { context }))
  await module.evaluate()
  const render = () => { cursor = 0; dirty = false; output = module.namespace.useVoiceComponent(state.enabled, state.scope); effects.splice(0).forEach(fn => fn()) }
  const flush = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (dirty) render() } }
  render(); await flush()
  return { state, requests, render, flush, get value() { return output }, parse: module.namespace.parseVoiceStatus, dispose() { slots.forEach(slot => slot?.cleanup?.()) } }
}
test('Piik top-level status enables join without installation', async () => {
  const h = await harness(async () => Response.json({ success: true, available: true, backend: 'piik' }))
  assert.equal(h.value.status.available, true)
  assert.equal(h.value.status.backend, 'piik')
  assert.equal(h.value.install, undefined)
  assert.equal(h.requests.length, 1)
  h.dispose()
})
for (const value of [
  { success: true, available: false, backend: 'piik' },
  { success: true, available: true, backend: 'sfu' },
  { success: true, status: { available: true, state: 'ready' } },
  { success: true, available: true, backend: 'future' },
]) test(`unavailable or unsupported voice contract fails closed: ${JSON.stringify(value)}`, async () => {
  const h = await harness(async () => Response.json(value))
  assert.equal(h.value.status.available, false)
  assert.equal(h.value.status.state, 'error')
  assert.ok(h.value.status.message)
  h.dispose()
})
test('explicit retry can recover a failed status query', async () => {
  let ready = false
  const h = await harness(async () => ready ? Response.json({ success: true, available: true, backend: 'piik' }) : Response.json({}, { status: 503 }))
  assert.equal(h.value.status.available, false)
  ready = true; h.value.refresh(); await h.flush()
  assert.equal(h.value.status.available, true)
  assert.equal(h.requests.length, 2)
  h.dispose()
})
for (const field of ['server', 'epoch', 'scope', 'enabled']) test(`changing ${field} ignores a late status response`, async () => {
  let resolve
  const pending = new Promise(done => { resolve = done })
  const h = await harness(async () => pending)
  const old = h.requests[0].signal
  h.state[field] = field === 'epoch' ? 2 : field === 'enabled' ? false : 'next'
  h.render(); await h.flush()
  assert.equal(old.aborted, true)
  h.dispose()
  resolve(Response.json({ success: true, available: true, backend: 'piik' }))
  await h.flush()
  assert.equal(h.value.status.available, false)
})
