import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { loadTs } from './test-ts-module.mjs'

const input = loadTs('src/upstream/modules/bilibili/input.ts', {}, { URL })
test('Bilibili share text normalizes URLs and preserves page parameters', () => {
  assert.equal(input.normalizeBilibiliInput('【分享标题】https://b23.tv/eI0bzE2。'), 'https://b23.tv/eI0bzE2')
  assert.equal(input.normalizeBilibiliInput('【袜你！？】https\\://www\\.bilibili.com/video/BV1N3nw6KEjc?p=2&vd_source=test'), 'https://www.bilibili.com/video/BV1N3nw6KEjc?p=2&vd_source=test')
  assert.equal(input.isBilibiliShortLink('https://b23.tv/eI0bzE2'), true)
  for (const value of ['https://b23.tv.invalid.test/a','https://b23.tv@invalid.test/a','https://user@b23.tv/a']) assert.equal(input.isBilibiliShortLink(value), false)
})

async function capabilities(allowPortrait = true) {
  const requests = []
  const api = loadTs('src/upstream/modules/bilibili/nativeQualityPolicy.ts', {
    react: {useSyncExternalStore(){}},
    '../../../platform/bilibiliProxy': {getEmbeddedProxyStatus:()=>({sessionVersion:1}),subscribeEmbeddedProxy(){}},
  }, { MediaSource:{isTypeSupported:type=>type.includes('avc1')}, navigator:{mediaCapabilities:{async decodingInfo({video}){
    requests.push(video)
    return {supported:video.width <= (video.height>video.width ? 1080:1920) && video.height <= (video.height>video.width ? 1920:1080) && video.framerate<=30 && (allowPortrait || video.width>=video.height), smooth:true}
  }}} })
  return {caps:await api.getWebViewCapabilities(),requests}
}

test('capability probe includes actual portrait dimensions, and respects decoder rejection', async () => {
  const yes = await capabilities()
  assert.ok(yes.caps.some(c=>c.maxWidth===1080 && c.maxHeight===1920))
  assert.ok(yes.caps.some(c=>c.maxWidth===1920 && c.maxHeight===1080))
  assert.ok(yes.requests.some(c=>c.width===1080 && c.height===1920))
  const no = await capabilities(false)
  assert.equal(no.caps.some(c=>c.maxHeight>c.maxWidth), false)
})

function harmony() {
  const requests=[]
  const tracks=[[80,1080,1920],[64,720,1280],[32,480,852]].map(([id,width,height])=>({id,width,height,bandwidth:id*1000,frame_rate:'24',codecs:'avc1.640033',baseUrl:`https://fixture.bilivideo.com/${id}.m4s`}))
  const http={RequestMethod:{GET:'GET'},createHttp:()=>({destroy(){},async request(address,options){
    requests.push({address,options})
    if (address.startsWith('https://b23.tv/')) return {responseCode:302,header:{location:'https://www.bilibili.com/video/BV1N3nw6KEjc?p=2'}}
    const data=address.includes('/view?')?{cid:1,title:'Portrait',duration:90,pages:[{cid:1,page:1,duration:90,part:'First'},{cid:2,page:2,duration:30,part:'Second'}]}:
      address.endsWith('/nav')?{wbi_img:{img_url:'https://i.test/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i.test/4932caff0ff746eab6f01bf08b70ac45.png'}}:
      {quality:80,accept_quality:[80,64,32],dash:{video:tracks,audio:[{codecs:'mp4a.40.2',bandwidth:192000,baseUrl:'https://fixture.bilivideo.com/audio.m4s'}]}}
    return {responseCode:200,result:JSON.stringify({code:0,data})}
  }})}
  return {requests,...loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BilibiliResolver.ets',{
    '@kit.NetworkKit':{http},'@kit.ArkTS':{url:{URL},util:{TextEncoder}},
    '@kit.CryptoArchitectureKit':{cryptoFramework:{createMd:()=>({async update(){},async digest(){return {data:new Uint8Array(16)}}})}},
    './BilibiliWbi':loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BilibiliWbi.ets'),
  })}
}

test('ArkTS selects portrait 720P/1080P with measured capabilities and preserves short-link part', async () => {
  const {caps}=await capabilities(), h=harmony()
  for (const qn of [80,64,32]) {
    const result=await h.resolveBilibili('https://b23.tv/eI0bzE2',0,qn,'manual',0,'local-fixture',0,false,caps)
    assert.equal(result.currentQn,qn);assert.equal(result.cid,2);assert.equal(result.currentPage,2)
    assert.equal(result.audioCodec,'mp4a.40.2')
  }
  assert.ok(h.requests.filter(r=>r.address.startsWith('https://b23.tv')).every(r=>!r.options.header.Cookie))
  await assert.rejects(()=>h.resolveBilibili('BV1N3nw6KEjc',0,80,'manual',0,'local-fixture',0,false,[{codec:'avc',maxWidth:1920,maxHeight:1080,maxFrameRate:30}]),/对应画质/)
  const explicit=await h.resolveBilibili('https://b23.tv/eI0bzE2',1,80,'manual',0,'local-fixture',0,false,caps)
  assert.equal(explicit.cid,1)
})

test('adding a short link then changing quality and part stays on the local resolver', async () => {
  const source=readFileSync('src/upstream/modules/room/components/MoviePushPanel.tsx','utf8')
  const start=source.indexOf('  const handleResolve = async'),end=source.indexOf('  // 统一添加影片',start)
  const calls=[],errors=[],canonical='https://www.bilibili.com/video/BV1N3nw6KEjc'
  const state={exports:{},...input,isHost:true,roomId:'local',sourceType:'bilibili',url:'【分享】https://b23.tv/eI0bzE2',
    message:{info(){},warning(){},error:e=>errors.push(e)},setLoading(){},setResolveProgress(){},setShowPageSelector(){},setQualityLoading(){},setPageSelectLoading(){},
    resolvedViaCliRef:{current:false},resolvedMovie:null,setResolvedMovie:r=>{state.resolvedMovie=r},
    extractBvid:url=>url.match(/BV[0-9A-Za-z]{10}/)?.[0],extractBangumiId:()=>null,
    getBilibiliInputResolvePolicy:()=> ({proxyUrl:'http://local.test',cliOnly:false}),isEmbeddedBilibiliHost:()=>true,
    async resolveBilibiliViaCli(...args){calls.push(args);return {resolvedUrl:canonical,cid:1,currentQn:args[3]||80,pages:[{page:1,cid:1},{page:2,cid:2}]}},
    async resolveBilibili(){throw Error('unexpected server fallback')},async resolveBilibiliWithOptions(){throw Error('unexpected server fallback')},console,
  }
  runInNewContext(stripTypeScriptTypes(source.slice(start,end))+';exports.api={handleResolve,handleQualityChange,handlePageSelect}',state)
  await state.exports.api.handleResolve()
  await state.exports.api.handleQualityChange('64')
  await state.exports.api.handlePageSelect(2)
  assert.deepEqual(errors,[]);assert.equal(calls.length,3)
  assert.equal(calls[0][1],'https://b23.tv/eI0bzE2')
  assert.equal(calls[1][1],'BV1N3nw6KEjc');assert.equal(calls[1][3],64)
  assert.equal(calls[2][2],2)
})
