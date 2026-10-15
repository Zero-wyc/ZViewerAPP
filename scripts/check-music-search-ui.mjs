import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = createRequire(resolve('../ZViewer-source code/package.json'))('playwright')
const output = resolve('.ui-validation/music-search')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const [width, height] of [[360, 800], [411, 914], [767, 1024], [768, 1024], [914, 411], [1280, 800], [800, 1280], [1440, 960]]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
      const page = await context.newPage()
      page.setDefaultTimeout(8000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4182/scripts/fixtures/music-search.html')
      await page.waitForFunction(() => !!window.__searchFixture)
      await page.evaluate(dark => {
        const style = document.documentElement.style
        style.setProperty('--md-sys-color-surface', dark ? '#181c20' : '#f5f7fa')
        style.setProperty('--md-sys-color-on-surface', dark ? '#e5e7eb' : '#191c20')
        style.setProperty('--md-sys-color-on-surface-variant', dark ? '#bdc4cf' : '#444c57')
      }, dark)
      const input = page.locator('input[aria-label="搜索音乐"]')
      const searchButton = page.getByRole('button', { name: '搜索音乐', exact: true })
      const narrow = width < 768
      assert.equal(await searchButton.count(), narrow ? 1 : 0)
      if (narrow) {
        assert.equal(await input.count(), 0)
        await searchButton.tap()
      } else {
        // No hover or mouse action occurs before visibility and hit testing.
        await input.waitFor({ state: 'visible' })
        const style = await input.evaluate(e => {
          const s = getComputedStyle(e.parentElement), r = e.getBoundingClientRect()
          return { opacity: s.opacity, pointerEvents: s.pointerEvents, background: s.backgroundColor,
            hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e }
        })
        assert.equal(style.opacity, '1'); assert.notEqual(style.pointerEvents, 'none'); assert(style.hit)
        assert.match(style.background, /0\.88/)
      }
      await input.fill('网易云验收'); await input.press('Enter')
      await page.getByText('隔离验收歌曲', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.__searchFixture.store.getState().page), 'search')
      if (narrow) assert.equal(await input.count(), 0)
      await page.getByRole('button', { name: '哔哩哔哩', exact: true }).tap()
      if (narrow) await searchButton.tap()
      await input.fill('B站验收'); await input.press('Enter')
      await page.getByText('隔离验收视频', { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.__searchFixture.store.getState().page), 'bilibili')
      const requests = await page.evaluate(() => window.__searchFixture.requests)
      assert(requests.some(url => url.includes('/ncm/cloudsearch?keywords=')))
      assert(requests.some(url => url.includes('/bilibili/search?keyword=')))
      if (narrow) {
        await searchButton.tap(); await input.fill('')
        await page.waitForTimeout(300)
        assert.equal(await page.getByText('隔离热搜', { exact: true }).count(), 0, 'No NCM suggestions on Bilibili')
        await page.getByRole('button', { name: '关闭搜索', exact: true }).tap()
      }
      assert.deepEqual(errors, [])
      await page.screenshot({ path: resolve(output, `touch-${width}x${height}-${dark ? 'dark' : 'light'}.png`) })
      results.push({ width, height, dark, narrow, passed: true })
      await context.close()
    }
  }
  writeFileSync(resolve(output, 'browser-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
