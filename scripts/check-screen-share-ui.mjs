import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(resolve('../ZViewer-source code/package.json'))
const { chromium } = require('playwright')
const output = resolve('.ui-validation/screen-share-20261015')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const checks = [], errors = []
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
const luminance = color => rgb(color).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 }).reduce((v, n, i) => v + n * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
try {
  for (const platform of ['harmony', 'android']) for (const [width, height] of [[320, 640], [393, 852], [852, 393]]) {
    const context = await browser.newContext({ viewport: { width, height } })
    await context.addInitScript(({ platform }) => {
      window.__pipCalls = []
      window.__pipDenied = false
      const status = { ready: true, loggedIn: true, supported: true, proxyUrl: '', sessionVersion: 1 }
      window.zviewerNative = platform === 'harmony' ? { platform, setSystemBarStyle: async () => {}, bilibiliStart: async () => status, bilibiliStatus: async () => status, bilibiliCreateQr: async () => ({}), bilibiliPollQr: async () => ({}), bilibiliCancelQr: async () => {}, bilibiliLogout: async () => status, toggleOrientation: async () => {}, setImmersive: async () => {}, unlockOrientation: async () => {} } : undefined
      window.fixturePlatform = platform
      window.fixturePlugins = {
        PlayerDisplay: { getPictureInPictureSupport: async () => ({ supported: true }), enterPictureInPicture: async options => { if (window.__pipDenied) throw Error('denied'); window.__pipCalls.push(options) }, exitPictureInPicture: async () => {}, setSystemBarStyle: async () => {}, setImmersive: async () => {}, toggleOrientation: async () => {}, unlockOrientation: async () => {} },
        BilibiliProxy: { start: async () => status, status: async () => status },
      }
    }, { platform })
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE:', error.message) })
    await page.route('**/src/mobile/useMobileRoom.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export function useMobileRoom(){ return {phase:"ready", isHost:false} }' }))
    await page.route('**/src/upstream/hooks/useSocket.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export function useSocket(){return {socket:null,connected:true}}; export function resetSocket(){}; export function reconnectSocket(){}' }))
    await page.route('**/@capacitor_core.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'export class WebPlugin{}; export const Capacitor={getPlatform:()=>window.fixturePlatform,isNativePlatform:()=>true}; export function registerPlugin(name){return window.fixturePlugins[name] || {}}' }))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{}' }))
    await page.goto('http://127.0.0.1:4180/scripts/fixtures/screen-share-ui.html')
    await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.videoWidth === 640 && v.readyState >= 2 })
    await page.waitForFunction(() => !document.querySelector('button[aria-label="画中画"],button[aria-label="应用内小窗"]')?.disabled)
    if (width > height) {
      await page.locator('.zart-web-fullscreen').first().waitFor()
      await page.getByRole('button', { name: '退出全屏', exact: true }).click()
    }
    await page.evaluate(() => { window.originalVideo = document.querySelector('video'); window.originalStream = window.originalVideo.srcObject })
    assert.equal(await page.getByRole('button', { name: '批注', exact: true }).count(), 0)
    await page.getByRole('button', { name: '房间设置', exact: true }).click()
    await page.waitForTimeout(350)
    const appearance = await page.getByRole('button', { name: '外观设置', exact: true }).boundingBox()
    const account = await page.getByRole('button', { name: /B 站账号 · 已登录/ }).boundingBox()
    assert(appearance && account && Math.abs(appearance.y - account.y) < 1 && appearance.x + appearance.width < account.x, JSON.stringify({ appearance, account }))
    for (const dark of [false, true]) {
      await page.evaluate(dark => { window.theme(dark); document.querySelector('#message-container')?.remove() }, dark)
      for (const type of ['warning', 'error', 'success', 'info']) {
        await page.evaluate(type => window.toast(type, type === 'warning' ? 'P2P 连接失败，已回退到服务器中转' : '这是一条测试提示，检查文字可读性'), type)
      }
      await page.waitForTimeout(650)
      const colors = await page.locator('.zen-toast').evaluateAll(nodes => nodes.map(node => { const s = getComputedStyle(node), r = node.getBoundingClientRect(); return { foreground: s.color, background: s.backgroundColor, left: r.left, right: r.right } }))
      assert.equal(colors.length, 4)
      for (const c of colors) { assert(contrast(c.foreground, c.background) >= 4.5, JSON.stringify(c)); assert(c.left >= 0 && c.right <= width) }
      await page.screenshot({ path: resolve(output, `${platform}-${width}x${height}-${dark ? 'dark' : 'light'}.png`) })
    }
    await page.evaluate(() => document.querySelector('#message-container')?.remove())
    await page.getByRole('button', { name: '关闭面板', exact: true }).first().click()
    const video = page.locator('video')
    await video.dispatchEvent('pointermove', { pointerType: 'touch' })
    await page.getByRole('button', { name: '全屏', exact: true }).click()
    assert.equal(await page.getByText('分辨率：640 x 360').count(), 0)
    assert.equal(await page.locator('.vc-container').getByText('已加入', { exact: true }).count(), 0)
    const tapVideo = async () => {
      await video.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: 30, clientY: 30 })
      await video.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true, clientX: 30, clientY: 30 })
    }
    await tapVideo()
    await page.waitForTimeout(400)
    assert(await page.locator('.vc-container').evaluate(node => node.classList.contains('pointer-events-none')), 'single tap hides fullscreen controls')
    await tapVideo()
    await page.waitForTimeout(400)
    assert(await page.locator('.vc-container').evaluate(node => !node.classList.contains('pointer-events-none')), 'single tap restores fullscreen controls')
    await tapVideo(); await tapVideo()
    await page.waitForTimeout(400)
    assert(await video.evaluate(node => node.paused), 'double tap pauses playback')
    assert(await page.locator('.vc-container').evaluate(node => !node.classList.contains('pointer-events-none')), 'double tap must not also toggle controls')
    await tapVideo(); await tapVideo()
    await page.waitForTimeout(400)
    assert(await video.evaluate(node => !node.paused), 'second double tap resumes playback')
    await video.dispatchEvent('pointermove', { pointerType: 'touch' })
    await page.getByRole('button', { name: platform === 'harmony' ? '应用内小窗' : '画中画', exact: true }).click()
    if (platform === 'android') {
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-webrtc-native-pip'))
      await page.waitForFunction(() => window.__pipCalls.length === 1 && !!document.querySelector('button[aria-label="退出画中画"]'))
      const bounds = await video.boundingBox()
      assert(bounds && bounds.width >= width - 1 && bounds.height >= height - 1, JSON.stringify(bounds))
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('zviewer:native-pip', { detail: { active: false } })))
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-webrtc-native-pip'))
      await video.dispatchEvent('pointermove', { pointerType: 'touch' })
      await page.evaluate(() => { window.__pipDenied = true })
      await page.getByRole('button', { name: '画中画', exact: true }).click()
    }
    await page.locator('.webrtc-inline-pip').waitFor()
    const before = await page.evaluate(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames)
    await page.waitForTimeout(500)
    const after = await page.evaluate(() => document.querySelector('video').getVideoPlaybackQuality().totalVideoFrames)
    assert(after > before, 'WebRTC frames must continue in the small window')
    assert(await page.evaluate(() => document.querySelector('video') === window.originalVideo && document.querySelector('video').srcObject === window.originalStream))
    await page.screenshot({ path: resolve(output, `${platform}-${width}x${height}-pip.png`) })
    await page.getByRole('button', { name: '恢复播放画面' }).click()
    assert.equal(await page.locator('.webrtc-inline-pip').count(), 0)
    await video.dispatchEvent('pointermove', { pointerType: 'touch' })
    await page.getByRole('button', { name: platform === 'harmony' ? '应用内小窗' : '画中画', exact: true }).click()
    await page.evaluate(() => window.teardown())
    await page.locator('.webrtc-inline-pip').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.webrtc-inline-pip').count(), 0)
    assert(await page.evaluate(() => !document.documentElement.hasAttribute('data-webrtc-native-pip')))
    await page.evaluate(() => window.unmount())
    await page.goto('http://127.0.0.1:4180/scripts/fixtures/screen-share-ui.html?menu')
    const more = page.getByRole('button', { name: '更多', exact: true })
    await more.click()
    const menu = page.getByRole('dialog', { name: '更多选项', exact: true })
    await menu.waitFor()
    await page.evaluate(() => window.hideControls())
    await page.waitForTimeout(400)
    const triggerRect = await more.boundingBox(), menuRect = await menu.boundingBox()
    assert(triggerRect && menuRect)
    if (height - triggerRect.y - triggerRect.height - 16 >= 96) assert(menuRect.y >= triggerRect.y + triggerRect.height + 7, JSON.stringify({ triggerRect, menuRect }))
    else assert(menuRect.y + menuRect.height <= triggerRect.y - 7 || menuRect.y >= triggerRect.y + triggerRect.height + 7, JSON.stringify({ triggerRect, menuRect }))
    assert(menuRect.x >= 0 && menuRect.x + menuRect.width <= width && menuRect.y + menuRect.height <= height)
    assert(await more.evaluate(button => { const r = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }), 'menu must not cover its trigger')
    await page.screenshot({ path: resolve(output, `${platform}-${width}x${height}-more.png`) })
    await more.click()
    await menu.waitFor({ state: 'detached' })
    await page.evaluate(() => window.showControls())
    await page.getByRole('button', { name: '全屏', exact: true }).click()
    await more.click()
    await menu.waitFor()
    await page.waitForTimeout(400)
    const fullTrigger = await more.boundingBox(), fullMenu = await menu.boundingBox()
    assert(fullMenu.y + fullMenu.height <= height && fullMenu.y >= 0)
    assert(fullMenu.y >= fullTrigger.y + fullTrigger.height + 7 || fullMenu.y + fullMenu.height <= fullTrigger.y - 7, JSON.stringify({ message: 'fullscreen menu must never overlap its trigger', platform, width, height, fullMenu, fullTrigger }))
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    checks.push({ platform, width, height, themes: 2, contrast: '>=4.5', webRtcFramesAdvance: true, originalVideoPreserved: true, nativeBridge: platform === 'android' ? 'mock' : 'none' })
    await context.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(resolve(output, 'results.json'), JSON.stringify({ checks, errors, physicalDeviceAcceptance: false }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors, output }))
} finally { await browser.close() }
