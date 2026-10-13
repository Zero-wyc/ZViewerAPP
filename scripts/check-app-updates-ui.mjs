import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(resolve('../ZViewer-source code/package.json'))
const { chromium } = require('playwright')
const output = resolve('../.ui-validation/updates-186')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const checks = [], errors = []
const fixture = [{ tag_name: 'client-v1.8.7', name: 'ZViewer-Client V1.8.7', body: '## 🚀 新特性 / Features\n改进更新提示\n\n## 🐛 错误修复 / Bug Fixes\n修复同步播放', html_url: 'https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v1.8.7', assets: ['apk', 'hap'].map(extension => ({ name: `ZViewer-1.8.7-release.${extension}`, size: 52 * 1024 * 1024, browser_download_url: `https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v1.8.7/ZViewer.${extension}` })) }]
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1366, 1024]]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' })
    await context.addInitScript(() => {
      window.__openedReleases = []
      window.zviewerNative = { platform: 'harmony', getAppInfo: async () => ({ version: '1.8.6', build: '186' }), openExternalUrl: async url => { window.__openedReleases.push(url) }, setSystemBarStyle: async () => {}, bilibiliStart: async () => ({ ready: false, loggedIn: false, supported: false }), bilibiliStatus: async () => ({ ready: false, loggedIn: false, supported: false }) }
      Object.assign(window.zviewerNative, { bilibiliCreateQr: async () => ({}), bilibiliPollQr: async () => ({}), bilibiliCancelQr: async () => {}, bilibiliLogout: async () => ({ ready: false, loggedIn: false, supported: false }) })
    })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message))
    let mode = 'new'
    await page.route('https://api.github.com/repos/Zero-wyc/ZViewerAPP/releases?per_page=30', route => mode === 'offline' ? route.abort() : route.fulfill({ contentType: 'application/json', body: JSON.stringify(mode === 'new' ? fixture : []) }))
    await page.goto('http://127.0.0.1:4178')
    const dialog = page.getByRole('dialog', { name: '关于应用' }); await dialog.waitFor()
    assert(await dialog.getByText('V1.8.6', { exact: true }).isVisible())
    assert(await dialog.getByText('新版本 V1.8.7').isVisible())
    await page.getByRole('button', { name: '关闭关于应用' }).click()
    await page.getByRole('button', { name: '外观设置', exact: true }).click()
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await page.getByRole('button', { name: '关闭外观设置' }).click()
    await page.getByRole('button', { name: '关于应用', exact: true }).click()
    assert.equal(await page.locator('.app-shell').getAttribute('data-appearance'), 'dark')
    const metrics = await page.evaluate(() => ({ root: document.documentElement.scrollWidth, width: innerWidth, dialog: document.querySelector('.about-dialog').getBoundingClientRect().toJSON(), dialogScroll: document.querySelector('.about-dialog').scrollWidth, dialogClient: document.querySelector('.about-dialog').clientWidth }))
    assert(metrics.root <= width + 1, `home overflow ${width}`); assert(metrics.dialog.x >= 0 && metrics.dialog.right <= width + 1 && metrics.dialog.bottom <= height + 1)
    assert(metrics.dialogScroll <= metrics.dialogClient + 1)
    await page.screenshot({ path: resolve(output, `about-dark-${width}x${height}.png`) })
    await page.getByRole('button', { name: '下载鸿蒙安装包' }).click()
    assert.equal(await page.evaluate(() => window.__openedReleases[0]), fixture[0].assets[1].browser_download_url)
    await page.getByRole('button', { name: '关闭关于应用' }).click()
    await page.getByRole('button', { name: '外观设置', exact: true }).click()
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await page.getByRole('button', { name: '关闭外观设置' }).click()
    await page.getByRole('button', { name: '关于应用', exact: true }).click()
    assert.equal(await page.locator('.app-shell').getAttribute('data-appearance'), 'light')
    await page.screenshot({ path: resolve(output, `about-light-${width}x${height}.png`) })
    mode = 'current'; await page.getByRole('button', { name: '检查更新', exact: true }).click()
    await page.getByText('当前已是最新版本', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '下载鸿蒙安装包' }).count(), 0)
    mode = 'offline'; await page.getByRole('button', { name: '检查更新', exact: true }).click()
    await page.getByRole('status').getByText(/Failed to fetch|检查失败|暂时无法/).waitFor()
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), false)
    checks.push({ width, height, automatic: true, manual: true, download: true, themes: ['light', 'dark'], overflow: false, offline: true })
    await context.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(resolve(output, 'results.json'), JSON.stringify({ checks, errors, nativeAcceptance: false }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, errors, output }))
} finally { await browser.close() }
