import { expect, test, type Page } from '@playwright/test'

async function openClient(page: Page, native: boolean, stored?: object) {
  await page.addInitScript(({ native, stored }) => {
    if (stored) localStorage.setItem('danmaku-storage', JSON.stringify(stored))
    if (native) {
      Object.assign(window, {
        androidBridge: {},
        Capacitor: {
          PluginHeaders: [{ name: 'BilibiliProxy', methods: ['start', 'status'].map(name => ({ name, rtype: 'promise' })) }, { name: 'App', methods: ['addListener', 'removeListener'].map(name => ({ name, rtype: 'promise' })) }],
          nativePromise: async (plugin: string) => plugin === 'BilibiliProxy'
            ? { supported: true, ready: true, loggedIn: false, proxyUrl: '', sessionVersion: 1 }
            : {},
        },
      })
    }
  }, { native, stored })
  await page.goto('/')
}

async function styleState(page: Page) {
  return page.evaluate(async () => {
    const { useDanmakuStore } = await import('/src/upstream/store/danmakuStore.ts')
    const { getRuntimePlatform } = await import('/src/platform/runtime.ts')
    return { platform: getRuntimePlatform(), style: useDanmakuStore.getState().style }
  })
}

test('native client enables screen scaling by default and reset restores it', async ({ page }) => {
  await openClient(page, true)
  const initial = await styleState(page)
  expect(initial.platform).toBe('android')
  expect(initial.style.scaleWithScreen).toBe(true)
  const changed = await page.evaluate(async () => {
    const { useDanmakuStore } = await import('/src/upstream/store/danmakuStore.ts')
    useDanmakuStore.getState().setStyle({ scaleWithScreen: false })
    return useDanmakuStore.getState().style.scaleWithScreen
  })
  expect(changed).toBe(false)
  await page.reload()
  expect((await styleState(page)).style.scaleWithScreen).toBe(false)
  const reset = await page.evaluate(async () => {
    const { useDanmakuStore } = await import('/src/upstream/store/danmakuStore.ts')
    useDanmakuStore.getState().resetStyle()
    return useDanmakuStore.getState().style.scaleWithScreen
  })
  expect(reset).toBe(true)
})

test('old mobile setting migrates once and preserves other style fields', async ({ page }) => {
  await openClient(page, true, { version: 1, state: { style: { scaleWithScreen: false, fontSize: 31 } } })
  const state = await styleState(page)
  expect(state.platform).toBe('android')
  expect(state.style.scaleWithScreen).toBe(true)
  expect(state.style.fontSize).toBe(31)
  expect(state.style.filters.scroll).toBe(true)
})

test('desktop default and old desktop preference remain unchanged', async ({ page }) => {
  await openClient(page, false, { version: 1, state: { style: { scaleWithScreen: false, fontSize: 31 } } })
  const state = await styleState(page)
  expect(state.platform).toBe('web')
  expect(state.style.scaleWithScreen).toBe(false)
  expect(state.style.fontSize).toBe(31)
  await page.evaluate(() => localStorage.removeItem('danmaku-storage'))
  await page.reload()
  expect((await styleState(page)).style.scaleWithScreen).toBe(false)
})
