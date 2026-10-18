import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const {chromium}=createRequire(resolve('../ZViewer-source code/package.json'))('playwright')
const output=resolve('.ui-validation/feedback-211')
fs.mkdirSync(output,{recursive:true})
const options={headless:true}
if(process.env.PLAYWRIGHT_EXECUTABLE_PATH)options.executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH
else options.channel=process.env.PLAYWRIGHT_BROWSER_CHANNEL||'msedge'
const browser=await chromium.launch(options),results=[]
try{
  for(const [width,height]of [[320,640],[393,852],[852,393],[768,1024],[1280,800]])for(const dark of [false,true]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true})
    const page=await context.newPage(),errors=[]
    page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/**',r=>r.fulfill({json:{success:true,mounts:[],movies:[],agents:[],loggedIn:false,settings:{},data:[],room:{ownerId:1}}}))
    await page.goto('http://127.0.0.1:4191/scripts/fixtures/feedback-211.html')
    await page.waitForFunction(()=>!!window.__feedbackFixture?.tone)
    await page.evaluate(dark=>window.__feedbackFixture.theme(dark),dark)
    await page.getByRole('button',{name:'片单',exact:true}).click()
    const toggle=page.getByRole('switch',{name:'自动连播',exact:true}),add=page.getByRole('button',{name:'添加影片',exact:true})
    const a=await toggle.locator('..').boundingBox(),b=await add.boundingBox()
    assert.ok(a&&b&&Math.abs((a.y+a.height/2)-(b.y+b.height/2))<2,{a,b})
    assert.ok(a.x>=0&&a.x+a.width<=b.x&&b.x+b.width<=width)
    await toggle.locator('..').click();assert.equal(await toggle.isChecked(),true)
    assert.equal(await page.evaluate(()=>window.__feedbackFixture.store.getState().autoContinueEnabled),true)
    await page.evaluate(()=>window.__feedbackRole(false))
    await page.waitForFunction(()=>!document.querySelector('input[aria-label="自动连播"]'))
    await page.evaluate(()=>window.__feedbackRole(true));await toggle.waitFor({state:'attached'})
    // Both toolbar tones use the matching inverse, regardless of page theme.
    for(const tone of ['light','dark']){
      await page.evaluate(t=>window.__feedbackFixture.tone(t),tone)
      const badge=page.locator('#comment-toolbar button[aria-label="切换歌词/评论区"] span')
      await page.waitForFunction(t=>{const e=document.querySelector('#comment-toolbar button[aria-label="切换歌词/评论区"] span');return e&&getComputedStyle(e).color===(t==='light'?'rgb(28, 28, 28)':'rgb(255, 255, 255)')},tone)
      const colors=await badge.evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))
      const lum=rgb=>{const cs=rgb.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return cs[0]*.2126+cs[1]*.7152+cs[2]*.0722}
      const l1=lum(colors.color),l2=lum(colors.background),contrast=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)
      assert.ok(contrast>=7,JSON.stringify({tone,contrast,colors}))
      assert.equal(colors.text,'4.2w+');assert.ok(colors.rect.x>=0&&colors.rect.right<=width)
    }
    await page.locator('#comment-toolbar').scrollIntoViewIfNeeded()
    await page.screenshot({path:resolve(output,`${width}x${height}-${dark?'dark':'light'}-comments.png`)})
    await add.click()
    await page.getByRole('button',{name:'哔哩哔哩',exact:true}).click()
    await page.getByRole('button',{name:'视频直链',exact:true}).click()
    const first=page.getByRole('switch',{name:'浏览器转码引擎',exact:true}),second=page.getByRole('switch',{name:'服务器中转',exact:true})
    await first.waitFor({state:'attached'});await second.waitFor({state:'attached'})
    const details=await Promise.all([first,second].map(l=>l.evaluate(e=>{const s=e.parentElement;return{width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height,class:s.parentElement.parentElement.className}})))
    assert.deepEqual(details[0],details[1])
    await first.locator('..').click();await second.locator('..').click()
    assert.equal(await first.isChecked(),true);assert.equal(await second.isChecked(),true)
    await page.waitForTimeout(400) // Finish the shared switch and dropdown animations before visual capture.
    await page.screenshot({path:resolve(output,`${width}x${height}-${dark?'dark':'light'}-options.png`)})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
    assert.deepEqual(errors,[])
    results.push({width,height,dark,hostOnly:true,aligned:true,contrast:true,matchingSliders:true,passed:true})
    await context.close()
  }
  fs.writeFileSync(resolve(output,'ui-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results))
}finally{await browser.close()}
