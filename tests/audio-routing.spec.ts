import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    audioRoutingTest: { policies: boolean[]; captures: number; releasePermission?: () => void }
  }
}

async function policy(page: Page, expected: boolean) {
  await expect.poll(() => page.evaluate(() => window.audioRoutingTest.policies.at(-1))).toBe(expected)
}

test('music restores media mode without capturing a microphone and yields during voice', async ({ page, context }) => {
  await context.grantPermissions(['microphone'])
  await page.addInitScript(() => {
    window.audioRoutingTest = { policies: [], captures: 0 }
    Object.assign(window, {
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{
          name: 'AudioRouting', methods: [{ name: 'setMediaOnly', rtype: 'promise' }],
        }, {
          name: 'PlayerDisplay',
          methods: ['setImmersive', 'unlockOrientation'].map(name => ({ name, rtype: 'promise' })),
        }, {
          name: 'App',
          methods: ['addListener', 'removeListener'].map(name => ({ name, rtype: 'promise' })),
        }],
        nativePromise: async (plugin: string, _method: string, options: { enabled: boolean }) => {
          if (plugin === 'AudioRouting') window.audioRoutingTest.policies.push(options.enabled)
        },
      },
    })
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.audioRoutingTest.captures++
      await new Promise<void>(resolve => { window.audioRoutingTest.releasePermission = resolve })
      return getUserMedia(constraints)
    }
  })
  await page.goto('/')
  await page.getByLabel('服务端地址', { exact: true }).fill('http://127.0.0.1:3347')
  await page.getByLabel('用户名', { exact: true }).fill('audio-routing')
  await page.getByLabel('密码', { exact: true }).fill('test')
  await page.getByRole('button', { name: '登录并选择房间' }).click()
  await page.getByRole('button', { name: /一起听音乐/ }).click()
  await expect(page.getByRole('button', { name: '语音聊天', exact: true })).toBeVisible({ timeout: 20000 })
  await policy(page, true)
  await page.getByRole('button', { name: '语音聊天', exact: true }).click()
  const panel = page.getByRole('region', { name: '语音面板' })
  await expect(panel.getByRole('button', { name: '加入语音', exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.audioRoutingTest.captures)).toBe(0)
  await policy(page, true)
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await policy(page, false)
  // Do not force media mode while the permission dialog is pending.
  await page.evaluate(() => document.dispatchEvent(new Event('playing')))
  await policy(page, false)
  await page.evaluate(() => window.audioRoutingTest.releasePermission?.())
  await expect(panel.getByText('1 人在线', { exact: true })).toBeVisible()
  await policy(page, false)
  await panel.getByRole('button', { name: '收起语音面板' }).click()
  await policy(page, false)
  await page.getByRole('button', { name: '语音聊天', exact: true }).click()
  await panel.getByRole('button', { name: '断开', exact: true }).click()
  await policy(page, true)
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'))
  })
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(page.getByText(/麦克风权限被拒绝/)).toBeVisible()
  await policy(page, true)
  await page.getByRole('button', { name: '离开房间', exact: true }).first().click()
  await page.getByRole('button', { name: '离开', exact: true }).click()
  await expect(page.getByRole('heading', { name: '选择房间' })).toBeVisible()
  await policy(page, false)
})
