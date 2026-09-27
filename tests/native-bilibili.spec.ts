import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function installNativeFixture(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let proxy = { supported:true,ready:true,loggedIn:true,proxyUrl:'http://127.0.0.1:19333/test-session',sessionVersion:1,user:{name:'fixture',vipStatus:1} }
    Object.assign(window, {
      __setNativeProxy: (changes: object) => { proxy={...proxy,...changes} },
      androidBridge: {},
      Capacitor: {
        PluginHeaders: [{name:'BilibiliProxy',methods:['start','status','logout'].map(name=>({name,rtype:'promise'}))}, {name:'App',methods:['addListener','removeListener'].map(name=>({name,rtype:'promise'}))}],
        nativePromise: async (plugin: string, method: string) => {
          if(plugin!=='BilibiliProxy') return {}
          if(method==='logout') proxy={...proxy,loggedIn:false,sessionVersion:proxy.sessionVersion+1}
          return proxy
        },
      },
    })
  })
  await page.goto('/')
  await expect(page.getByRole('button',{name:'B 站账号 · 已登录',exact:true})).toBeVisible()
}

test('native login enables local DASH defaults; manual quality and session cache remain local',async({page})=> {
  await installNativeFixture(page)
  const results=await page.evaluate(async()=> {
    const prefs=await import('/src/upstream/modules/bilibili/parseOptions.ts')
    const policy=await import('/src/upstream/modules/bilibili/nativeQualityPolicy.ts')
    const resolver=await import('/src/upstream/modules/room/watch-together/movie-source-resolver.ts')
    const initial=prefs.getBilibiliParseOptions(7)
    policy.selectNativeQuality(7,64)
    const manual=policy.getNativeQualityPolicy(7)
    const other=policy.getNativeQualityPolicy(8)
    const local=resolver.getActiveCliProxyUrl()
    policy.selectNativeQuality(7)
    policy.fallbackNativeQuality(7)
    const fallback=policy.getNativeQualityPolicy(7)
    const before=policy.nativeQualityCacheKey(7)
    const native=await import('/src/platform/bilibiliProxy.ts')
    await native.embeddedBilibiliProxy.logout()
    return {initial,manual,other,local,fallback,before,after:policy.nativeQualityCacheKey(7),reset:policy.getNativeQualityPolicy(7),afterLogout:resolver.getActiveCliProxyUrl()}
  })
  expect(results.initial).toMatchObject({cliEnabled:true,preferMp4:false,bufferMode:false})
  expect(results.manual).toEqual({mode:'manual',qn:64})
  expect(results.other).toEqual({mode:'autoMax'})
  expect(results.local).toContain('19333/test-session')
  expect(results.fallback).toEqual({mode:'autoMax',fallbackQn:64})
  expect(results.after).not.toEqual(results.before)
  expect(results.reset).toEqual({mode:'autoMax'})
  expect(results.afterLogout).toBeNull()
})

for (const fail720 of [false,true]) {
test(`real DASH attachment recovers highest once then falls back to ${fail720?'480p when 720p fails':'720p'} with local state`,async({page})=> {
  await installNativeFixture(page)
  const requests: string[]=[]
  await page.route('http://127.0.0.1:19333/**',async route=> {
    const url=new URL(route.request().url())
    if(url.pathname.endsWith('/resolve')) {
      const qn=Number(url.searchParams.get('fallbackQn')??80)
      requests.push(url.searchParams.get('fallbackQn')??'highest')
      await route.fulfill({json:{success:true,videoUrl:`https://test.bilivideo.com/video-${qn}.mp4`,audioUrl:'https://test.bilivideo.com/audio.mp4',format:'dash',videoCodec:'avc1.640028',audioCodec:'mp4a.40.2',duration:8,cid:123,currentQn:qn,acceptQuality:[{id:80,label:'1080P'},{id:64,label:'720P'},{id:32,label:'480P'}]}})
      return
    }
    const target=url.searchParams.get('url')??''
    if(target.includes('video-80') || fail720 && target.includes('video-64')) {await route.fulfill({status:503,body:'fixture track unavailable'});return}
    const name=target.includes('audio')?'audio.mp4':target.includes('video-32')?'video-480.mp4':'video-720.mp4'
    const bytes=readFileSync(new URL(`./fixtures/bilibili/${name}`,import.meta.url))
    const range=route.request().headers()['range']?.match(/bytes=(\d+)-(\d*)/)
    const start=range?Number(range[1]):0
    const end=Math.min(range?.[2]?Number(range[2]):bytes.length-1,bytes.length-1)
    await route.fulfill({status:range?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})},body:bytes.subarray(start,end+1)})
  })
  const result=await page.evaluate(async()=> {
    const {mountNativeHarness}=await import('/tests/native-bilibili-harness.ts')
    const {useRoomStore}=await import('/src/upstream/store/roomStore.ts')
    const policy=await import('/src/upstream/modules/bilibili/nativeQualityPolicy.ts')
    const video=document.createElement('video');video.muted=true;video.playsInline=true;document.body.append(video)
    const state={sourceType:'bilibili',sourceUrl:'https://test.bilivideo.com/video-80.mp4',audioUrl:'https://test.bilivideo.com/audio.mp4',format:'dash',videoCodec:'avc1.640028',audioCodec:'mp4a.40.2',currentQn:80,duration:8,isPlaying:false,currentTime:0,playbackRate:1}
    const harness=await mountNativeHarness(video,state)
    await harness.api.applySourceToVideo(video,state,3)
    const restoredTime=video.currentTime, restoredPaused=video.paused
    await video.play()
    await new Promise(resolve=>setTimeout(resolve,400))
    video.pause()
    const before=video.currentTime
    // Short buffering and normal pause must not request another quality.
    video.dispatchEvent(new Event('stalled'))
    await new Promise(resolve=>setTimeout(resolve,100))
    const result={height:video.videoHeight,qn:useRoomStore.getState().watchTogether.currentQn,policy:policy.getNativeQualityPolicy(7),before,paused:video.paused,restoredTime,restoredPaused}
    harness.remove();video.remove()
    return result
  })
  expect(result.height).toBe(fail720?480:720)
  expect(result.qn).toBe(fail720?32:64)
  expect(result.policy).toEqual({mode:'autoMax',fallbackQn:fail720?32:64})
  expect(result.before).toBeGreaterThan(0)
  expect(result.paused).toBe(true)
  expect(result.restoredTime).toBeCloseTo(3,1)
  expect(result.restoredPaused).toBe(true)
  expect(requests).toEqual(fail720?['highest','64','32']:['highest','64'])
})
}

test('native caches separate page IDs; Android recovery resolves with local manual policy',async({page})=> {
  await installNativeFixture(page)
  const requests: string[]=[]
  await page.route('http://127.0.0.1:19333/**',route=> {
    const params=new URL(route.request().url()).searchParams
    requests.push(`${params.get('cid')}:${params.get('qualityMode')}:${params.get('qn')}`)
    return route.fulfill({json:{success:true,videoUrl:'https://test.bilivideo.com/video',audioUrl:'https://test.bilivideo.com/audio',format:'dash',currentQn:64,cid:Number(params.get('cid')),acceptQuality:[{id:64,label:'720P'}]}})
  })
  const result=await page.evaluate(async()=> {
    const resolver=await import('/src/upstream/modules/room/watch-together/movie-source-resolver.ts')
    const policy=await import('/src/upstream/modules/bilibili/nativeQualityPolicy.ts')
    policy.selectNativeQuality(7,64)
    const movie={id:7,url:'https://www.bilibili.com/video/BV1234567890',cid:123,sourceType:'bilibili',title:'fixture',currentQn:120}
    const options={movie,sourceType:'bilibili',recovery:{sourceUrl:'http://127.0.0.1:19999/stale-session/proxy?url=old',currentQn:120}}
    const first=await resolver.resolveMovieSource(options)
    await resolver.resolveMovieSource(options)
    const second=await resolver.resolveMovieSource({...options,movie:{...movie,cid:456}})
    return {first,second}
  })
  expect(result.first.sourceUrl).toBe('https://test.bilivideo.com/video')
  expect(result.first.currentQn).toBe(64)
  expect(result.second.cid).toBe(456)
  expect(requests).toEqual(['123:manual:64','456:manual:64'])
})

test('failed manual quality restores the previous playable source and its actual label',async({page})=> {
  await installNativeFixture(page)
  await page.route('http://127.0.0.1:19333/**',async route=> {
    const target=new URL(route.request().url()).searchParams.get('url')??''
    if(target.includes('bad-720')) {await route.fulfill({status:503,body:'fixture manual unavailable'});return}
    const name=target.includes('audio')?'audio.mp4':'video-1080.mp4'
    const bytes=readFileSync(new URL(`./fixtures/bilibili/${name}`,import.meta.url))
    const range=route.request().headers()['range']?.match(/bytes=(\d+)-(\d*)/)
    const start=range?Number(range[1]):0, end=Math.min(range?.[2]?Number(range[2]):bytes.length-1,bytes.length-1)
    await route.fulfill({status:range?206:200,headers:{'Content-Type':'video/mp4','Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})},body:bytes.subarray(start,end+1)})
  })
  const result=await page.evaluate(async()=> {
    const {mountNativeHarness}=await import('/tests/native-bilibili-harness.ts')
    const policy=await import('/src/upstream/modules/bilibili/nativeQualityPolicy.ts')
    const {useRoomStore}=await import('/src/upstream/store/roomStore.ts')
    const video=document.createElement('video');video.muted=true;document.body.append(video)
    const qualities=[{id:80,label:'1080P'},{id:64,label:'720P'}]
    const state={sourceType:'bilibili',sourceUrl:'https://test.bilivideo.com/video-80.mp4',audioUrl:'https://test.bilivideo.com/audio.mp4',format:'dash',videoCodec:'avc1.640028',audioCodec:'mp4a.40.2',currentQn:80,acceptQuality:qualities,duration:8,isPlaying:false,currentTime:0,playbackRate:1}
    const harness=await mountNativeHarness(video,state)
    await harness.api.applySourceToVideo(video,state)
    policy.selectNativeQuality(7,64);policy.recordNativeQuality(7,64,qualities)
    let rejected=false
    try { await harness.api.applySourceToVideo(video,{...state,sourceUrl:'https://test.bilivideo.com/bad-720.mp4',currentQn:64},2) } catch { rejected=true }
    const result={rejected,height:video.videoHeight,time:video.currentTime,paused:video.paused,policy:policy.getNativeQualityPolicy(7),actual:policy.getActualNativeQuality(7)?.qn,roomQn:useRoomStore.getState().watchTogether.currentQn}
    harness.remove();video.remove();return result
  })
  expect(result).toMatchObject({rejected:true,height:1080,paused:true,policy:{mode:'autoMax'},actual:80,roomQn:80})
  expect(result.time).toBeCloseTo(2,1)
})

test('login reloads an automatic movie once and preserves a pre-login manual movie',async({page})=> {
  await installNativeFixture(page)
  const result=await page.evaluate(async()=> {
    const native=await import('/src/platform/bilibiliProxy.ts')
    const policy=await import('/src/upstream/modules/bilibili/nativeQualityPolicy.ts')
    const {mountNativeHarness}=await import('/tests/native-bilibili-harness.ts')
    const {useRoomStore}=await import('/src/upstream/store/roomStore.ts')
    const setProxy=(changes: object)=> (window as unknown as {__setNativeProxy:(c: object)=>void}).__setNativeProxy(changes)
    await native.embeddedBilibiliProxy.logout()
    policy.selectNativeQuality(8,64)
    const video=document.createElement('video');document.body.append(video)
    const state={sourceType:'bilibili',sourceUrl:'https://test.bilivideo.com/video',format:'dash',isPlaying:false,currentTime:3,playbackRate:1}
    const harness=await mountNativeHarness(video,state)
    const before=useRoomStore.getState().pendingReloadBilibili
    setProxy({loggedIn:true,sessionVersion:3})
    await native.embeddedBilibiliProxy.refresh()
    await native.embeddedBilibiliProxy.refresh()
    const after=useRoomStore.getState().pendingReloadBilibili
    const manual=policy.getNativeQualityPolicy(8)
    harness.remove();video.remove()
    return {before,after,manual}
  })
  expect(result.after-result.before).toBe(1)
  expect(result.manual).toEqual({mode:'manual',qn:64})
})

test('DASH attachment timeout cancels a hanging network preload',async({page})=> {
  await page.goto('/')
  let preloads=0
  await page.route('**/api/stream/proxy?**',async route=> { preloads++;await new Promise(r=>setTimeout(r,1500));await route.abort().catch(()=>{}) })
  const result=await page.evaluate(async()=> {
    const {DashPlayer}=await import('/src/upstream/modules/player/engines/dash/player.ts')
    const video=document.createElement('video');document.body.append(video)
    const player=new DashPlayer({video,videoUrl:'https://test.bilivideo.com/video',audioUrl:'https://test.bilivideo.com/audio',duration:8,attachTimeoutMs:150})
    const start=performance.now(); let message=''
    try { await player.attach() } catch(error) { message=(error as Error).message }
    const elapsed=performance.now()-start;player.cleanup();video.remove()
    return {message,elapsed}
  })
  expect(result.message).toContain('超时')
  expect(result.elapsed).toBeLessThan(1000)
  expect(preloads).toBeGreaterThan(0)
})

test('native resolve sends capability and policy; retains upstream URLs without local credentials',async({page})=> {
  await installNativeFixture(page)
  let parameters: URLSearchParams | undefined
  await page.route('http://127.0.0.1:19333/**',route=> {
    parameters=new URL(route.request().url()).searchParams
    return route.fulfill({json:{success:true,videoUrl:'https://test.bilivideo.com/video',audioUrl:'https://test.bilivideo.com/audio',format:'dash',currentQn:80,acceptQuality:[{id:80,label:'1080P'}]}})
  })
  const result=await page.evaluate(async()=> {
    const api=await import('/src/upstream/modules/bilibili/cliApi.ts')
    return api.resolveBilibiliViaCli('http://127.0.0.1:19333/test-session','BV1234567890',123,120,false,true)
  })
  expect(parameters?.get('qualityMode')).toBe('autoMax')
  expect(JSON.parse(parameters?.get('capabilities')??'[]').length).toBeGreaterThan(0)
  expect(result.currentQn).toBe(80)
  expect(result.videoUrl).toBe('https://test.bilivideo.com/video')
  expect(result.audioUrl).not.toContain('test-session')
})
