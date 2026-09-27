import { test, expect, type Page } from '@playwright/test'

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('服务端地址', { exact: true }).fill('http://127.0.0.1:3347')
  await page.getByLabel('用户名', { exact: true }).fill('mobile-test')
  await page.getByLabel('密码', { exact: true }).fill('test')
  await page.getByRole('button', { name: '登录并选择房间' }).click()
  await expect(page.getByText('已连接', { exact: true })).toBeVisible()
}
async function open(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name) }).click()
}
async function leave(page: Page) {
  await page.getByRole('button', { name: '离开房间', exact: true }).first().click()
  await page.getByRole('button', { name: '离开', exact: true }).click()
  await expect(page.getByRole('heading', { name: '选择房间' })).toBeVisible()
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

test('local lobby, room, chat, return and re-entry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await page.screenshot({ path: 'test-results/lobby-mobile.png', fullPage: true })
  await open(page, '周末放映室')
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  expect(new URL(page.url()).port).toBe('5187')
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/watch-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '片单', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加影片', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '添加影片', exact: true }).click()
  await expect(page.getByText('添加影片', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: '哔哩哔哩', exact: true }).click()
  const source = page.getByRole('button', { name: '视频直链', exact: true })
  await expect(source).toBeVisible()
  // A visible portal can still be covered by the modal backdrop.
  await source.click()
  await expect(page.getByPlaceholder('MP4/WebM 等视频直链')).toBeVisible()
  await page.keyboard.press('Escape')
  await leave(page)
  await open(page, '周末放映室')
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/watch-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})

for (const width of [320, 360, 390, 430, 600, 768, 1024]) {
  test(`music settings fit ${width}px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    await open(page, '一起听音乐')
    await page.getByRole('button', { name: '账号登录', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const content = page.locator('.music-settings-content')
    await expect(content).toBeVisible()
    await noOverflow(page)
    for (const selector of ['.music-settings-page', '.music-settings-content', '.music-settings-account', '.music-setting-option']) {
      expect(await page.locator(selector).evaluateAll(elements => elements.flatMap(element => {
        const rect = element.getBoundingClientRect()
        return element.scrollWidth <= element.clientWidth + 1 && rect.left >= 0 && rect.right <= window.innerWidth + 1
          ? [] : [{ className: element.className, scrollWidth: element.scrollWidth, width: element.clientWidth, left: rect.left, right: rect.right }]
      })), selector).toEqual([])
    }
    const quality = page.locator('.music-setting-option').filter({ hasText: '音质选择' })
    await quality.getByRole('button').first().click()
    await quality.getByRole('button', { name: '标准', exact: true }).click()
    const direct = page.locator('.music-setting-option').filter({ hasText: '音源直连' }).getByRole('button')
    await direct.click()
    await expect(direct).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: `test-results/music-settings-${width}.png`, fullPage: true })
    const reset = page.getByRole('button', { name: '恢复默认', exact: true })
    await reset.scrollIntoViewIfNeeded()
    await reset.click()
    await expect(direct).toHaveAttribute('aria-pressed', 'false')
  })
}

test('password, approvals, reconnect and closed state', async ({ page, request }) => {
  await login(page)
  await open(page, '密码房间')
  await page.getByLabel('房间密码', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: '进入房间', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('密码错误')
  await page.getByLabel('房间密码', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '进入房间', exact: true }).click()
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  await request.post('http://127.0.0.1:3347/test/event', { data: { roomId: 'locked', event: 'drop-transport' } })
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible({ timeout: 15000 })
  await leave(page)
  await open(page, '审批房间')
  await expect(page.getByRole('heading', { name: '等待房主批准' })).toBeVisible()
  await request.post('http://127.0.0.1:3347/test/event', { data: { roomId: 'approval', event: 'join-approved', data: { roomId: 'approval', mode: 'watch-together' } } })
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  await request.post('http://127.0.0.1:3347/test/event', { data: { roomId: 'approval', event: 'room-closed', data: { roomId: 'approval' } } })
  await expect(page.getByRole('heading', { name: '房间已关闭' })).toBeVisible()
})

test('create room keeps one socket and music is local', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await login(page)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('button', { name: '屏幕共享', exact: true })).toHaveCount(0)
  await page.getByLabel('房间名称').fill('移动端新房间')
  await page.getByRole('button', { name: '创建并进入房间' }).click()
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  const state = await (await request.get('http://127.0.0.1:3347/test/state')).json()
  expect(state.sockets.filter((s: { roomId: string }) => s.roomId?.startsWith('created-'))).toHaveLength(1)
  await page.getByRole('button', { name: '房间', exact: true }).click()
  await page.getByRole('button', { name: '一起听', exact: true }).click()
  await expect(page.locator('.mobile-music-content')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/music-mobile.png', fullPage: true })
  await leave(page)
  expect(errors).toEqual([])
})

test('receives real WebRTC frames without requesting screen capture', async ({ page, context }) => {
  const sender = await context.newPage()
  await sender.goto('http://127.0.0.1:3347/sender')
  await expect(sender).toHaveTitle('Sender ready')
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => { throw new Error('Mobile must never capture its own screen') }
  })
  await login(page)
  await open(page, '桌面共享')
  await expect(page.getByRole('button', { name: '聊天', exact: true })).toBeVisible()
  await expect.poll(() => page.locator('video').first().evaluate((video: HTMLVideoElement) => video.videoWidth), { timeout: 20000 }).toBe(640)
  const firstTime = await page.locator('video').first().evaluate((video: HTMLVideoElement) => video.currentTime)
  await expect.poll(() => page.locator('video').first().evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(firstTime + 0.1)
  const pixel = await page.locator('video').first().evaluate((video: HTMLVideoElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)
    return [...ctx.getImageData(10, 10, 1, 1).data]
  })
  expect(pixel[1]).toBeGreaterThan(100)
  await page.screenshot({ path: 'test-results/screen-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 844, height: 390 })
  await noOverflow(page)
  await page.screenshot({ path: 'test-results/screen-landscape.png', fullPage: true })
  await leave(page)
  await expect(page.locator('video')).toHaveCount(0)
  await sender.close()
})
