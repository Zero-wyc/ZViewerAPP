import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = createRequire(resolve('../ZViewer-source code/package.json'))('playwright')
const output = resolve('.ui-validation/playlist-controls')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
try {
  for (const [width, height] of [[320, 640], [411, 914], [914, 411], [800, 1280], [1280, 800], [1440, 960]]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true })
      const page = await context.newPage(); page.setDefaultTimeout(8000)
      const errors = []; page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4183/scripts/fixtures/playlist-controls.html')
      await page.waitForFunction(() => !!window.__playlistFixture)
      await page.evaluate(dark => window.__playlistFixture.theme(dark), dark)
      const button = page.getByRole('button', { name: '下一个影片', exact: true })
      await button.waitFor()
      const bounds = async () => {
        await page.waitForTimeout(350)
        return page.locator('.player-controls-row .player-tool:visible').evaluateAll(nodes => nodes.map(e => {
          const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)
          return { name: e.ariaLabel, x: r.x, y: r.y, right: r.right, bottom: r.bottom,
            hit: e === hit || e.contains(hit), width: innerWidth }
        }))
      }
      for (const full of [false, true]) {
        if (full) await page.getByRole('button', { name: '全屏', exact: true }).tap()
        const controls = await bounds()
        for (const c of controls) assert(c.x >= -1 && c.right <= width + 1 && c.hit, JSON.stringify(c))
        const play = controls.find(c => c.name === '播放'), next = controls.find(c => c.name === '下一个影片')
        assert(play && next && Math.abs(play.y-next.y)<1 && next.x >= play.right - 1, JSON.stringify({play,next}))
        await page.screenshot({ path: resolve(output, `${width}x${height}-${dark ? 'dark' : 'light'}-${full ? 'full' : 'normal'}.png`) })
        if (full) await page.getByRole('button', { name: '退出全屏', exact: true }).tap()
      }
      await button.tap()
      assert.equal(await button.isDisabled(), true)
      assert.equal(await page.evaluate(() => window.__playlistFixture.store.getState().currentMovieId), 1, 'No optimistic selection')
      await page.evaluate(() => document.querySelector('[aria-label="下一个影片"]').click())
      assert.equal(await page.evaluate(() => window.__playlistFixture.calls.length), 1)
      await page.evaluate(() => window.__playlistFixture.reply(false))
      await page.waitForFunction(() => !document.querySelector('[aria-label="下一个影片"]').disabled)
      assert.equal(await page.evaluate(() => window.__playlistFixture.store.getState().currentMovieId), 1)
      await button.tap(); await page.evaluate(() => window.__playlistFixture.reply(true))
      await page.waitForFunction(() => window.__playlistFixture.store.getState().currentMovieId === 3)
      await button.tap(); await page.evaluate(() => window.__playlistFixture.reply(true))
      await page.waitForFunction(() => document.querySelector('[aria-label="下一个影片"]').disabled)
      assert.equal(await page.evaluate(() => window.__playlistFixture.store.getState().currentMovieId), 7)
      await page.evaluate(() => { window.__playlistFixture.role('viewer'); window.__playlistFixture.store.setState({ currentMovieId: 1 }) })
      await page.waitForFunction(() => !document.querySelector('[aria-label="下一个影片"]'))
      await page.evaluate(() => window.__playlistFixture.role('manager'))
      await button.waitFor(); assert.equal(await button.isDisabled(), false)
      await page.evaluate(() => window.__playlistFixture.store.setState(state => ({watchTogether:{...state.watchTogether,isPreview:true}})))
      await page.waitForFunction(() => document.querySelector('[aria-label="下一个影片"]').disabled)
      assert.deepEqual(errors, [])
      results.push({width,height,dark,layouts:2,pendingAndFailure:true,nextOrder:[1,3,7],permissions:true,previewGuard:true,passed:true})
      await context.close()
    }
  }
  writeFileSync(resolve(output,'browser-results.json'),JSON.stringify(results,null,2))
  console.log(JSON.stringify(results))
} finally { await browser.close() }
