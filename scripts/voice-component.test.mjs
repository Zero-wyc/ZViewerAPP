import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import { create } from 'zustand'

const source = stripTypeScriptTypes(await readFile(
  new URL('../src/upstream/modules/voice-chat/hooks/useVoiceComponent.ts', import.meta.url), 'utf8'))
const status = (state, extra = {}) => ({
  available: state === 'ready' || state === 'external', state, progress: 0,
  received: 0, total: 0, message: '', external: state === 'external', ...extra,
})
const response = value => Response.json({ success: true, status: value })
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function harness(handler, initial = {}) {
  const slots = [], effects = [], timers = new Map(), requests = []
  const state = { user: { id: 'fixture' }, server: 'https://fixture.invalid', enabled: true, scope: 'one', ...initial }
  let cursor = 0, dirty = false, output
  const equal = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(value) {
      const index = cursor++
      slots[index] ??= { value }
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true }
      }]
    },
    useRef(current) {
      const index = cursor++
      slots[index] ??= { current }
      return slots[index]
    },
    useCallback(fn, deps) {
      const index = cursor++
      if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { fn, deps }
      return slots[index].fn
    },
    useEffect(fn, deps) {
      const index = cursor++
      if (!slots[index] || !equal(slots[index].deps, deps)) {
        const previous = slots[index]
        const slot = { deps, cleanup: null }
        slots[index] = slot
        effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn() })
      }
    },
  }
  const auth = Object.assign(selector => selector(state), { getState: () => state })
  const context = createContext({
    AbortController, AbortSignal,
    setInterval(fn) { const id = Symbol(); timers.set(id, fn); return id },
    clearInterval(id) { timers.delete(id) },
  })
  const imports = {
    react,
    '@/store/authStore': { useAuthStore: auth },
    '@/lib/api': {
      getApiUrl: () => state.server,
      apiFetch: (url, options) => { requests.push({ url, ...options }); return handler(url, options, state) },
      safeJson: async (res, fallback) => res.json().catch(() => fallback),
    },
  }
  const module = new SourceTextModule(source, { context })
  await module.link(name => {
    assert.ok(imports[name], `Unexpected dependency ${name}`)
    return new SyntheticModule(Object.keys(imports[name]), function () {
      for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  function render() {
    cursor = 0
    dirty = false
    output = module.namespace.useVoiceComponent(state.enabled, state.scope)
    effects.splice(0).forEach(fn => fn())
  }
  async function flush() {
    for (let i = 0; i < 50; i++) {
      await Promise.resolve()
      if (dirty) render()
    }
  }
  render()
  await flush()
  return {
    state, requests, timers, flush, render,
    get value() { return output },
    async poll() { for (const fn of [...timers.values()]) fn(); await flush() },
    dispose() { slots.forEach(slot => slot?.cleanup?.()) },
  }
}

test('missing server component installs once, polls through unpacking, and stops at ready', async () => {
  let current = status('idle')
  const posted = deferred()
  const h = await harness(async url => url.endsWith('/install') ? posted.promise : response(current))
  assert.equal(h.value.status.state, 'idle')
  assert.equal(h.timers.size, 0)
  const one = h.value.install()
  const two = h.value.install()
  await h.flush()
  assert.equal(h.requests.filter(r => r.method === 'POST').length, 1)
  assert.equal(h.value.requesting, true)
  posted.resolve(response(current = status('downloading', { progress: 42, total: 100 })))
  await Promise.all([one, two]); await h.flush()
  assert.equal(h.value.requesting, false)
  assert.equal(h.value.busy, true)
  assert.equal(h.timers.size, 1)
  current = status('installing')
  await h.poll()
  assert.equal(h.value.status.state, 'installing')
  current = status('ready')
  await h.poll()
  assert.equal(h.value.status.available, true)
  assert.equal(h.timers.size, 0)
  h.dispose()
})

test('failed installation reports the server error and permits an explicit retry', async () => {
  let attempts = 0
  const h = await harness(async url => url.endsWith('/status') ? response(status('idle')) :
    ++attempts === 1 ? Response.json({ success: false, message: 'fixture unavailable' }, { status: 503 }) : response(status('ready')))
  await h.value.install(); await h.flush()
  assert.equal(h.value.status.state, 'error')
  assert.equal(h.value.status.message, 'fixture unavailable')
  assert.equal(h.value.requesting, false)
  assert.equal(h.timers.size, 0)
  await h.value.install(); await h.flush()
  assert.equal(attempts, 2)
  assert.equal(h.value.status.available, true)
  h.dispose()
})

test('legacy status 404 and external LiveKit preserve the existing join flow', async () => {
  const legacy = await harness(async () => Response.json({ success: false }, { status: 404 }))
  assert.equal(legacy.value.status.available, true)
  assert.equal(legacy.requests.length, 1)
  assert.equal(legacy.timers.size, 0)
  legacy.dispose()
  const external = await harness(async () => response(status('external')))
  assert.equal(external.value.status.external, true)
  assert.equal(external.value.status.available, true)
  external.dispose()
})

for (const change of ['server', 'user', 'scope', 'enabled']) {
  test(`changing ${change} aborts a pending installation and ignores its late result`, async () => {
    const pending = deferred()
    const h = await harness(async url => url.endsWith('/status') ? response(status('idle')) : pending.promise)
    const installing = h.value.install()
    await h.flush()
    const signal = h.requests.find(r => r.method === 'POST').signal
    h.state[change] = change === 'user' ? { id: 'next' } : change === 'enabled' ? false : 'next'
    h.render(); await h.flush()
    assert.equal(signal.aborted, true)
    pending.resolve(response(status('ready')))
    await installing; await h.flush()
    assert.equal(h.value.requesting, false)
    assert.equal(h.value.status.state, change === 'enabled' ? 'ready' : 'idle')
    h.dispose()
  })
}

test('polls never overlap and an older status cannot overwrite a completed installation', async () => {
  const old = deferred()
  let block = false
  const h = await harness(async url => url.endsWith('/install')
    ? response(status('ready')) : block ? old.promise : response(status('downloading')))
  block = true
  await h.poll(); await h.poll()
  assert.equal(h.requests.filter(r => r.method === 'GET').length, 2)
  await h.value.install(); await h.flush()
  old.resolve(response(status('idle')))
  await h.flush()
  assert.equal(h.value.status.state, 'ready')
  assert.equal(h.timers.size, 0)
  h.dispose()
})

test('unmount cancels pending queries, clears timers, and ignores late network failures', async () => {
  const pending = deferred()
  const h = await harness(async () => pending.promise)
  h.dispose()
  assert.equal(h.requests[0].signal.aborted, true)
  pending.resolve(response(status('downloading')))
  await h.flush()
  assert.equal(h.timers.size, 0)
})

test('progress is bounded and an unknown total remains indeterminate', async () => {
  const h = await harness(async () => response(status('downloading', { progress: 250 })))
  assert.equal(h.value.status.progress, 100)
  assert.equal(h.value.status.total, 0)
  h.dispose()
})

test('public settings preserve explicit false, default older servers to visible, and reset across sessions', async () => {
  let settings = { showVoiceChatButton: false, showTrafficPanel: false }
  const context = createContext({ console })
  const source = stripTypeScriptTypes(await readFile(
    new URL('../src/upstream/store/systemSettingsStore.ts', import.meta.url), 'utf8'))
  const module = new SourceTextModule(source, { context })
  await module.link(name => {
    const exports = name === 'zustand' ? { create } : {
      apiFetch: async () => Response.json({ success: true, settings }),
      safeJson: async res => res.json(),
    }
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  const store = module.namespace.useSystemSettingsStore
  await store.getState().fetchSettings()
  assert.equal(store.getState().showVoiceChatButton, false)
  assert.equal(store.getState().showTrafficPanel, false)
  store.getState().invalidate()
  settings = {}
  await store.getState().fetchSettings()
  assert.equal(store.getState().showVoiceChatButton, true)
  assert.equal(store.getState().showTrafficPanel, true)
})
