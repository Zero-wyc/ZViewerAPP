import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const adb = process.env.ADB || 'adb'
const serial = process.env.ANDROID_SERIAL || 'emulator-5554'
const appId = process.env.ANDROID_APP_ID || 'com.zviewer.mobile.debug'
const run = (...args) => execFileSync(adb, ['-s',serial,...args], { encoding:'utf8' }).trim()
const pid = run('shell','pidof',appId).split(' ')[0]
assert.ok(pid, 'Debug app must be running with WebView debugging enabled')
run('forward','tcp:9227',`localabstract:webview_devtools_remote_${pid}`)
run('reverse','tcp:3349','tcp:3349')
const server = createServer((req,res) => {
  const name = req.url?.split('/').at(-1)
  if (!['video-1080.mp4','video-720.mp4','audio.mp4'].includes(name)) { res.writeHead(404); res.end(); return }
  const data=readFileSync(new URL(`../tests/fixtures/bilibili/${name}`,import.meta.url))
  res.setHeader('Access-Control-Allow-Origin','https://localhost')
  res.setHeader('Content-Type','video/mp4')
  res.end(data)
})
await new Promise(resolve => server.listen(3349,'127.0.0.1',resolve))
const browser=await chromium.connectOverCDP('http://127.0.0.1:9227')
try {
  const page=browser.contexts()[0].pages().find(p=>p.url().startsWith('https://localhost'))
  assert.ok(page,'Capacitor app page missing')
  await page.getByRole('button',{name:/B 站账号/}).waitFor()
  const status = await page.evaluate(async()=> {
    const s=await window.Capacitor.Plugins.BilibiliProxy.status()
    const response=await fetch(`${s.proxyUrl}/health`)
    return { ready:s.ready,loggedIn:s.loggedIn,health:response.status,cookieExposed:'cookie' in s }
  })
  assert.equal(status.ready,true);assert.equal(status.health,200);assert.equal(status.cookieExposed,false)
  const beforeBackground=await page.evaluate(async()=> (await window.Capacitor.Plugins.BilibiliProxy.status()).proxyUrl)
  run('shell','input','keyevent','KEYCODE_HOME')
  await new Promise(resolve=>setTimeout(resolve,500))
  run('shell','am','start','-n',`${appId}/com.zviewer.mobile.MainActivity`)
  const backgroundResume=await page.evaluate(async previous=> {
    const state=await window.Capacitor.Plugins.BilibiliProxy.status()
    return state.ready && state.proxyUrl===previous && (await fetch(state.proxyUrl+'/health')).status===200
  },beforeBackground)
  assert.equal(backgroundResume,true)
  const results=[]
  for(const qn of [1080,720]) {
    const result=await page.evaluate(async quality=> {
      const video=document.createElement('video');video.muted=true;video.playsInline=true
      video.style.cssText='position:fixed;left:0;bottom:0;width:160px;height:90px;z-index:99999'
      document.body.append(video)
      const source=new MediaSource();const object=URL.createObjectURL(source);video.src=object
      await new Promise(resolve=>source.addEventListener('sourceopen',resolve,{once:true}))
      const videoBuffer=source.addSourceBuffer('video/mp4; codecs="avc1.640028"')
      const audioBuffer=source.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"')
      const append=async(buffer,url)=> {
        const bytes=await(await fetch(url)).arrayBuffer()
        await new Promise((resolve,reject)=> { buffer.addEventListener('updateend',resolve,{once:true});buffer.addEventListener('error',reject,{once:true});buffer.appendBuffer(bytes) })
      }
      await append(videoBuffer,`http://127.0.0.1:3349/video-${quality}.mp4`)
      await append(audioBuffer,'http://127.0.0.1:3349/audio.mp4')
      source.endOfStream()
      await video.play()
      await new Promise(resolve=>setTimeout(resolve,700))
      const before=video.currentTime
      video.currentTime=4
      await new Promise(resolve=>setTimeout(resolve,700))
      const result={ quality,width:video.videoWidth,height:video.videoHeight,before,afterSeek:video.currentTime,error:video.error?.code??null }
      video.pause();video.remove();URL.revokeObjectURL(object)
      return result
    },qn)
    assert.equal(result.height,qn);assert.ok(result.before>0);assert.ok(result.afterSeek>=4);assert.equal(result.error,null)
    results.push(result)
  }
  await page.getByRole('button',{name:/B 站账号/}).click()
  await page.getByRole('button',{name:'获取登录二维码',exact:true}).waitFor()
  const qrFlow = await page.evaluate(async()=> {
    const plugin=window.Capacitor.Plugins.BilibiliProxy
    const qr=await plugin.createQr()
    const validImage=qr.qrDataUrl.startsWith('data:image/png;base64,') && qr.qrcodeKey.length>0
    const poll=await plugin.pollQr({key:qr.qrcodeKey})
    await plugin.saveQr()
    await plugin.cancelQr()
    let cancelled=false
    try { await plugin.pollQr({key:qr.qrcodeKey}) } catch { cancelled=true }
    return {validImage,waitingStatus:poll.status,cookieExposed:'cookie' in poll,saved:true,cancelled}
  })
  assert.equal(qrFlow.validImage,true);assert.equal(qrFlow.cookieExposed,false);assert.equal(qrFlow.cancelled,true)
  mkdirSync('release',{recursive:true})
  await page.screenshot({path:'release/android-bilibili-account.png'})
  const report={appId,pageSize:Number(run('shell','getconf','PAGE_SIZE')),nativeBridge:status,backgroundResume,qrFlow,webViewPlayback:results,realAccountLogin:'not tested: no account credentials supplied',date:new Date().toISOString()}
  writeFileSync('release/android-bilibili-smoke.json',JSON.stringify(report,null,2)+'\n')
  console.log(JSON.stringify(report,null,2))
} finally { await browser.close();await new Promise(resolve=>server.close(resolve));run('reverse','--remove','tcp:3349');run('forward','--remove','tcp:9227') }
