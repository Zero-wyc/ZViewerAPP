import { test, expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    voiceTest: { tracks: MediaStreamTrack[]; played: number; captures: number }
  }
}

async function enter(page: Page, room = '周末放映室', authenticated = false) {
  await page.goto('/')
  if (!authenticated) {
    await page.getByLabel('服务端地址', { exact: true }).fill('http://127.0.0.1:3347')
    await page.getByLabel('用户名', { exact: true }).fill('voice-test')
    await page.getByLabel('密码', { exact: true }).fill('test')
    await page.getByRole('button', { name: '登录并选择房间' }).click()
  }
  await page.getByRole('button', { name: new RegExp(room) }).click()
  await page.getByRole('button', { name: '语音聊天', exact: true }).click()
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['microphone'])
  await context.addInitScript(() => {
    window.voiceTest = { tracks: [], played: 0, captures: 0 }
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await getUserMedia(constraints)
      window.voiceTest.tracks.push(...stream.getTracks())
      window.voiceTest.captures++
      return stream
    }
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.voiceTest.played++
      return start.apply(this, args)
    }
  })
})

test('voice sends and plays audio, mutes, reconnects and releases the microphone', async ({ page, context, request }) => {
  const peer = await context.newPage()
  await enter(page)
  const panel = page.getByRole('region', { name: '语音面板' })
  await expect.poll(() => page.evaluate(() => window.voiceTest.captures)).toBe(0)
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(panel.getByText('1 人在线', { exact: true })).toBeVisible()
  await enter(peer, '周末放映室', true)
  const peerPanel = peer.getByRole('region', { name: '语音面板' })
  await peerPanel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(panel.getByText('2 人在线', { exact: true })).toBeVisible()
  await expect(peerPanel.getByText('2 人在线', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.voiceTest.played)).toBeGreaterThan(3)
  await expect.poll(() => peer.evaluate(() => window.voiceTest.played)).toBeGreaterThan(3)
  await panel.getByRole('button', { name: '静音', exact: true }).click()
  await expect(panel.getByRole('button', { name: '取消静音', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '收起语音面板' }).click()
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '片单', exact: true }).click()
  await page.getByRole('button', { name: '语音聊天', exact: true }).click()
  await expect(panel.getByRole('button', { name: '取消静音', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.voiceTest.captures)).toBe(1)
  await panel.getByRole('button', { name: '取消静音', exact: true }).click()
  await request.post('http://127.0.0.1:3347/test/event', { data: { roomId: 'watch', event: 'drop-transport' } })
  await expect.poll(async () => {
    const state = await (await request.get('http://127.0.0.1:3347/test/state')).json()
    return state.sockets.filter((socket: { voice: boolean }) => socket.voice).length
  }).toBe(2)
  await expect.poll(() => page.evaluate(() => window.voiceTest.captures)).toBe(1)
  await page.screenshot({ path: 'test-results/voice-mobile.png', fullPage: true })
  await panel.getByRole('button', { name: '断开', exact: true }).click()
  await expect(panel.getByRole('button', { name: '加入语音', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.voiceTest.tracks.every(track => track.readyState === 'ended'))).toBe(true)
  await peerPanel.getByRole('button', { name: '收起语音面板' }).click()
  await peer.getByRole('button', { name: '离开房间', exact: true }).first().click()
  await peer.getByRole('button', { name: '离开', exact: true }).click()
  await expect.poll(() => peer.evaluate(() => window.voiceTest.tracks.every(track => track.readyState === 'ended'))).toBe(true)
  await peer.close()
})

test('voice stays connected across playback modes without a second instance', async ({ page }) => {
  await enter(page, '一起听音乐')
  const panel = page.getByRole('region', { name: '语音面板' })
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(panel.getByText('1 人在线', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '收起语音面板' }).click()
  await expect(page.getByRole('button', { name: '加入语音', includeHidden: true })).toHaveCount(0)
  await page.evaluate(async () => {
    const response = await fetch('http://127.0.0.1:3347/test/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'music', event: 'room-mode-changed', data: { roomId: 'music', mode: 'watch-together' } }),
    })
    if (!response.ok) throw new Error('mode switch failed')
  })
  await expect(page.getByRole('button', { name: '片单', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '语音聊天', exact: true }).click()
  await expect(panel.getByText('1 人在线', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.voiceTest.captures)).toBe(1)
})

test('permission rejection can be retried and pending permission is cancelled on room exit', async ({ page }) => {
  await enter(page, '桌面共享')
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    let rejected = false
    navigator.mediaDevices.getUserMedia = constraints => {
      if (!rejected) { rejected = true; return Promise.reject(new DOMException('Denied', 'NotAllowedError')) }
      return original(constraints)
    }
  })
  const panel = page.getByRole('region', { name: '语音面板' })
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(page.getByText(/麦克风权限被拒绝/)).toBeVisible()
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await expect(panel.getByText('1 人在线', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '断开', exact: true }).click()
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async constraints => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      return original(constraints)
    }
  })
  await panel.getByRole('button', { name: '加入语音', exact: true }).click()
  await panel.getByRole('button', { name: '收起语音面板' }).click()
  await page.getByRole('button', { name: '离开房间', exact: true }).first().click()
  await page.getByRole('button', { name: '离开', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.voiceTest.captures)).toBe(2)
  await expect.poll(() => page.evaluate(() => window.voiceTest.tracks.every(track => track.readyState === 'ended'))).toBe(true)
})
