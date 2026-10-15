// Browser layout acceptance; native bridge behavior is separately checked on emulators.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const require = createRequire(resolve('../ZViewer-source code/package.json'))
const { chromium } = require('playwright')
const output = resolve('.ui-validation/overlay-readability-20261015')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const checks = [], errors = []
const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4 }).reduce((v, n, i) => v + n * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
try {
  for (const platform of ['harmony', 'android']) for (const [width, height] of [[320, 640], [393, 852], [852, 393]]) {
    const context = await browser.newContext({ viewport: { width, height } })
    await context.addInitScript(({ platform }) => {
      window.fixturePlatform = platform
      window.fixtureStatus = { supported: true, ready: true, loggedIn: false, proxyUrl: '', sessionVersion: 1 }
      const status = async () => window.fixtureStatus
      window.zviewerNative = platform === 'harmony' ? {
        platform, setSystemBarStyle: async () => {}, getAppInfo: async () => ({ version: '1.9.0', build: '190' }),
        bilibiliStart: status, bilibiliStatus: status, bilibiliCreateQr: async () => ({}), bilibiliPollQr: async () => ({}), bilibiliCancelQr: async () => {}, bilibiliLogout: status,
      } : undefined
      window.fixturePlugins = {
        App: { getInfo: async () => ({ version: '1.9.0', build: '190' }), addListener: async () => ({ remove: async () => {} }) },
        PlayerDisplay: { setSystemBarStyle: async () => {} }, BilibiliProxy: { start: status, status, cancelQr: async () => {} },
      }
    }, { platform })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/upstream/hooks/useSocket.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export function useSocket(){return {socket:null,connected:true}}; export function resetSocket(){}' }))
    await page.route('**/@capacitor_core.js*', route => route.fulfill({ contentType: 'text/javascript', body: 'export class WebPlugin{}; export const Capacitor={getPlatform:()=>window.fixturePlatform,isNativePlatform:()=>true}; export function registerPlugin(name){return window.fixturePlugins[name] || {}}' }))
    await page.route('https://api.github.com/**', route => route.fulfill({ contentType: 'application/json', body: '[]' }))
    await page.goto('http://127.0.0.1:4180/')
    await page.getByLabel('连接模式', { exact: true }).waitFor()
    for (const dark of [false, true]) for (const loggedIn of [false, true]) {
      await page.evaluate(async ({ dark, loggedIn }) => {
        const { useThemeStore } = await import('/src/upstream/store/themeStore.ts')
        useThemeStore.setState({ mode: dark ? 'dark' : 'light', isDark: dark })
        window.fixtureStatus = { ...window.fixtureStatus, loggedIn }
        await (await import('/src/platform/bilibiliProxy.ts')).embeddedBilibiliProxy.refresh()
      }, { dark, loggedIn })
      const account = page.getByRole('button', { name: `B 站账号 · ${loggedIn ? '已登录' : '未登录'}`, exact: true })
      await account.waitFor()
      await page.waitForFunction(expected => getComputedStyle(document.querySelector('.bilibili-status-icon')).backgroundColor === expected, loggedIn ? 'rgb(251, 114, 153)' : 'rgb(0, 0, 0)')
      assert.equal(await account.textContent(), '')
      assert.equal(await account.evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(255, 255, 255)')
      assert.equal(await account.locator('span').evaluate(n => getComputedStyle(n).backgroundColor), loggedIn ? 'rgb(251, 114, 153)' : 'rgb(0, 0, 0)')
      assert(await page.locator('.brand-bar .app-icon').evaluate(n => n.complete && n.naturalWidth > 0))
      assert.equal(await page.locator('.connection-pill').textContent(), '')
      const about = page.getByRole('button', { name: '关于应用', exact: true })
      const appearance = page.locator('button.appearance-trigger:not(.about-trigger)')
      const a = await about.boundingBox(), b = await appearance.boundingBox()
      assert(a && b && a.width === b.width && a.height === b.height && a.x === b.x && Math.abs(b.y - a.y - a.height - 12) < 1, JSON.stringify({ a, b }))
      assert(await about.evaluate(n => getComputedStyle(n).position === 'fixed' && n.contains(document.elementFromPoint(n.getBoundingClientRect().x + 26, n.getBoundingClientRect().y + 26))))
      assert(await page.locator('.brand-bar').evaluate(n => n.scrollWidth <= n.clientWidth), 'header must fit the narrow screen')
      await page.screenshot({ path: resolve(output, `${platform}-${width}x${height}-${dark ? 'dark' : 'light'}-${loggedIn ? 'in' : 'out'}.png`) })
    }
    await page.getByRole('button', { name: '关于应用', exact: true }).click()
    await page.getByRole('dialog', { name: '关于应用', exact: true }).waitFor()
    assert(await page.locator('.about-dialog .app-icon').evaluate(n => n.complete && n.naturalWidth > 0))
    await page.getByRole('button', { name: '关闭关于应用', exact: true }).click()
    await page.getByRole('button', { name: 'B 站账号 · 已登录', exact: true }).click()
    await page.locator('.secondary-panel .bili-account-title').getByText('B站账号', { exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭面板', exact: true }).click()
    const mode = page.getByLabel('连接模式', { exact: true })
    await mode.selectOption('custom'); assert.equal(await mode.inputValue(), 'custom')
    await mode.selectOption('auto'); assert.equal(await mode.inputValue(), 'auto')
    await page.getByLabel('允许此服务器使用不受信任的证书', { exact: true }).check()
    assert(await page.getByText('仅为当前服务器启用证书例外；独立语音服务器仍验证证书。', { exact: true }).isVisible())
    for (const dark of [false, true]) {
      await page.evaluate(async dark => (await import('/src/upstream/store/themeStore.ts')).useThemeStore.setState({ mode: dark ? 'dark' : 'light', isDark: dark }), dark)
      await page.waitForTimeout(450)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const note = await page.locator('.security-note').evaluate(n => { const s = getComputedStyle(n), r = n.getBoundingClientRect(); return { color: s.color, background: s.backgroundColor, bottom: r.bottom } })
      assert(contrast(note.color, note.background) >= 4.5, JSON.stringify(note))
      assert(note.bottom + 8 <= (await page.locator('.about-trigger').boundingBox()).y, 'last hint must scroll clear of fixed buttons')
      await page.screenshot({ path: resolve(output, `${platform}-${width}-${dark ? 'dark' : 'light'}-hint.png`) })
      await page.getByRole('button', { name: '关于应用', exact: true }).click()
      assert.equal(await page.locator('.about-heading').evaluate(n => getComputedStyle(n).backgroundColor), 'rgba(0, 0, 0, 0)')
      await page.screenshot({ path: resolve(output, `${platform}-${width}-${dark ? 'dark' : 'light'}-about.png`) })
      await page.getByRole('button', { name: '关闭关于应用', exact: true }).click()
      await page.evaluate(() => window.scrollTo(0, 0))
      for (const loggedIn of [false, true]) {
        await page.evaluate(async loggedIn => { window.fixtureStatus = { ...window.fixtureStatus, loggedIn }; await (await import('/src/platform/bilibiliProxy.ts')).embeddedBilibiliProxy.refresh() }, loggedIn)
        await page.locator('.brand-bar .bilibili-account-trigger').click()
        const title = page.locator('.bili-account-title')
        await title.waitFor()
        await page.waitForTimeout(300) // capture the settled modal, after its enter animation
        assert.equal(await title.textContent(), loggedIn ? 'B站账号·已登录' : 'B站账号')
        if (loggedIn) {
          const colors = await title.evaluate(n => ({ status: getComputedStyle(n.querySelector('.bili-account-login-state')).color, label: getComputedStyle(n.firstElementChild).color, background: getComputedStyle(n.closest('.glass-strong')).backgroundColor }))
          assert.notEqual(colors.status, colors.label)
          assert(contrast(colors.status, colors.background) >= 4.5, JSON.stringify(colors))
        }
        await page.screenshot({ path: resolve(output, `${platform}-${width}-${dark ? 'dark' : 'light'}-account-${loggedIn}.png`) })
        await page.getByRole('button', { name: '关闭面板', exact: true }).click()
        await page.locator('.bili-account-title').waitFor({ state: 'detached' })
      }
    }
    const user = { id: 999, username: 'ui-test', role: 'root' }
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, user, rooms: [], settings: { roomCreationMode: 'all-users' } }) }))
    await page.evaluate(user => localStorage.setItem('zviewer-mobile-session', JSON.stringify({ serverUrl: 'http://127.0.0.1:4190', accessToken: 'local-ui-fixture', refreshToken: '', user })), user)
    await page.reload()
    for (const dark of [false, true]) {
      await page.evaluate(async dark => (await import('/src/upstream/store/themeStore.ts')).useThemeStore.setState({ mode: dark ? 'dark' : 'light', isDark: dark }), dark)
      await page.getByRole('button', { name: '创建', exact: true }).click()
      await page.getByRole('dialog', { name: '创建房间', exact: true }).waitFor()
      assert.equal(await page.locator('.rooms-view .sheet-backdrop').count(), 0, 'sheet must escape the lobby stacking context')
      for (const shortcut of ['.about-trigger', 'button.appearance-trigger:not(.about-trigger)']) {
        assert(await page.locator(shortcut).evaluate(n => { const r = n.getBoundingClientRect(); return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.sheet-backdrop') }), 'create sheet must cover floating shortcut')
      }
      const approval = page.locator('.approval-row input')
      const before = await approval.isChecked()
      await page.locator('.switch-track').click()
      assert.notEqual(await approval.isChecked(), before, 'approval switch must receive the tap')
      assert.equal(await page.locator('.appearance-backdrop, .about-dialog[open]').count(), 0)
      await page.screenshot({ path: resolve(output, `${platform}-${width}-${dark ? 'dark' : 'light'}-create.png`) })
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      assert(await page.locator('.about-trigger').evaluate(n => { const r = n.getBoundingClientRect(); return n.contains(document.elementFromPoint(r.x + 26, r.y + 26)) }), 'shortcuts work again after sheet closes')
    }
    checks.push({ platform, width, height, themes: 2, accountStates: 2, floatingGap: 12, selectFunctional: true, hintContrast: '>=4.5', createSheetCoversShortcuts: true, aboutHeading: 'transparent' })
    await context.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(resolve(output, 'identity-results.json'), JSON.stringify({ checks, errors, nativeBridges: 'mock' }, null, 2))
  console.log(JSON.stringify({ checks: checks.length, states: checks.length * 4, errors, output }))
} finally { await browser.close() }
