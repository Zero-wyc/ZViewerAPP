import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const { chromium } = createRequire(resolve('../ZViewer-source code/package.json'))('playwright')
const session = JSON.parse(fs.readFileSync(process.env.ALIGNMENT_SESSION || '.ui-validation/alignment-session.json'))
const output = '.ui-validation/alignment-459'
fs.mkdirSync(output, {recursive: true})
const browser = await chromium.launch({channel: 'chrome', headless: true})
const results = []
try {
  for (const [width, height] of [[320,640],[393,852],[852,393],[768,1024],[1280,800]]) {
    for (const dark of [false,true]) {
      const context = await browser.newContext({viewport: {width,height}, hasTouch: true})
      await context.addInitScript(s => { window.__alignmentSession = {...s, server: 'http://127.0.0.1:14333'} }, session)
      const page = await context.newPage()
      page.setDefaultTimeout(10000)
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('http://127.0.0.1:4189/scripts/fixtures/alignment-459.html')
      await page.waitForFunction(() => !!window.__alignment)
      await page.evaluate(dark => window.__alignment.theme(dark), dark)
      await page.getByRole('button',{name:'哔哩哔哩',exact:true}).click()
      await page.getByText('TVBox 采集源',{exact:true}).click()
      if (dark) await page.getByRole('checkbox',{name:'服务器中转',exact:true}).check()
      await page.getByRole('button',{name:'搜索影片',exact:true}).click()
      await page.getByRole('button',{name:'全部站点（聚合搜索）',exact:true}).waitFor()
      await page.getByPlaceholder('输入影片名称搜索').fill('本地')
      await page.getByPlaceholder('输入影片名称搜索').press('Enter')
      await page.getByRole('button',{name:/本地采集源集成验证影片/}).click()
      try { await page.getByText('[线路二] 备用第一集',{exact:true}).click() } catch (error) { console.log('Failed case',width,height,dark,await page.locator('body').innerText(),errors); await page.screenshot({path:output+'/failure.png'}); throw error }
      const add = page.getByRole('button',{name:/添加当前条目|添加所选/})
      const box = await add.boundingBox()
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),false)
      await page.screenshot({path:`${output}/${width}x${height}-${dark?'dark':'light'}.png`})
      const post = page.waitForResponse(r => /\/api\/rooms\/[^/]+\/movies$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
      await add.click()
      const response = await post
      assert.equal(response.ok(),true)
      const payload = response.request().postDataJSON()
      assert.equal(payload.source,'cms')
      assert.equal(payload.sourceMeta.sourceId,session.source)
      assert.equal(payload.sourceMeta.playFromIndex,1)
      assert.equal(payload.sourceMeta.episodeIndex,0)
      assert.equal(payload.serverProxy,dark)
      const movie = (await response.json()).movie
      const resolved = await page.evaluate(async movie => {
        const {resolveMovieSource} = await import('/src/upstream/modules/room/watch-together/movie-source-resolver.ts')
        return resolveMovieSource({movie:{...movie,sourceType:movie.source},sourceType:movie.source})
      },movie)
      assert.equal(resolved.noProxyFallback,!dark)
      if (dark) assert.ok(resolved.sourceUrl.includes('/api/stream/cms/proxy?'))
      else assert.equal(resolved.sourceUrl,'http://127.0.0.1:14336/fixture.mp4')
      assert.deepEqual(errors,[])
      results.push({width,height,dark,cmsGroup:1,episode:0,serverProxy:dark,errors})
      await context.close()
    }
  }
} finally { await browser.close() }
fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2))
console.log(`${results.length} CMS layout/API/resolver cases passed`)
