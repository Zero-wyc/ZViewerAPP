import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = createRequire(resolve('../ZViewer-source code/package.json'))('playwright')
const output = resolve('.ui-validation/music-queue')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const [width, height] of [[393, 852], [852, 393], [1280, 800], [800, 1280]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ json: { data: {} } }))
    await page.goto('http://127.0.0.1:4181/scripts/fixtures/music-queue.html')
    await page.waitForFunction(() => !!window.__queueFixture)
    const click = async selector => {
      // Toolbar opacity is touch/hover controlled; trigger its real handler without hover races.
      await page.locator(selector).first().evaluate(button => button.click())
      await page.waitForTimeout(100)
    }
    await click('[aria-label="播放队列"]')
    assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 1)
    await page.evaluate(() => { window.__queueFixture.store.getState().setPlayerOverlayOpen(true); return window.__queueFixture.start() })
    await page.waitForTimeout(850)
    assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 0)
    const start = await page.evaluate(() => window.__queueFixture.audio.currentTime)
    for (let i = 0; i < 8; i++) {
      await click('.music-player-overlay [aria-label="切换播放队列"]:visible')
      assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 1, 'exactly one queue, including hidden DOM')
      assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').evaluate(button => !!button.closest('.music-player-overlay')), true)
      await click('[aria-label="关闭队列弹窗"]')
      assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 0)
    }
    await click('.music-player-overlay [aria-label="切换播放队列"]:visible')
    await page.screenshot({ path: resolve(output, `browser-${width}x${height}.png`) })
    const media = await page.evaluate(() => ({ time: window.__queueFixture.audio.currentTime, paused: window.__queueFixture.audio.paused, muted: window.__queueFixture.audio.muted }))
    assert(media.time > start + 1 && !media.paused && media.muted, JSON.stringify(media))
    await page.evaluate(() => window.__queueFixture.store.getState().closePlayerOverlay())
    assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 0)
    await page.waitForTimeout(550)
    await click('[aria-label="播放队列"]')
    assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 1)
    assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').evaluate(button => !!button.closest('.music-player-overlay')), false)
    assert.deepEqual(errors, [])
    results.push({ width, height, cycles: 8, media, passed: true })
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:4181/scripts/fixtures/music-queue.html')
  await page.waitForFunction(() => !!window.__queueMode)
  await page.evaluate(() => window.__queueMode('toolbar'))
  await page.locator('#queue-toggle').click()
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.__queueToolbar.scrollable), false)
  assert.equal(await page.locator('[aria-label="关闭队列弹窗"]').count(), 1)
  await page.evaluate(() => window.__queueToolbar.setCount(16))
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__queueToolbar.scrollable), true, 'real button overflow must scroll')
  await page.evaluate(() => window.__queueToolbar.setCount(5))
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__queueToolbar.scrollable), false, 'popup overflow must not scroll')
  assert.deepEqual(errors, [])
  results.push({ toolbarOverflowTransitions: 'side -> sheet -> side', passed: true })
  writeFileSync(resolve(output, 'browser-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
