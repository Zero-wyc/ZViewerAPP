import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {loadTs} from './test-ts-module.mjs'
const input=loadTs('src/upstream/modules/bilibili/input.ts',{}, {URL})

function harness(){
 const state={proxy:{ready:true,loggedIn:false,proxyUrl:'http://127.0.0.1:9333/device',sessionVersion:1},settings:{bilibiliDefaultParseMode:'dash',bilibiliPgcDefaultMode:'mp4'},movie:{id:42,url:'https://www.bilibili.com/video/BV1N3nw6KEjc',cid:1,currentPage:1,cliOnly:false},prefs:{cliEnabled:false,configured:true,preferMp4:false},failLocal:false,server:[],local:[]}
 const resolved={videoUrl:'https://fixture.bilivideo.com/video.m4s',audioUrl:'https://fixture.bilivideo.com/audio.m4s',format:'dash',currentQn:80,cid:1,pages:[{page:1,cid:1},{page:2,cid:2}],resolvedUrl:state.movie.url}
 const cli={extractBvid:s=>s.match(/BV[0-9A-Za-z]{10}/)?.[0]||null,extractBangumiId:s=>{const m=s.match(/(?:^|\/)ep(\d+)/);return m?{epId:Number(m[1])}:null},async resolveBilibiliViaCli(...args){state.local.push(args);if(state.failLocal)throw Error('NO_PERMISSION');return resolved},async resolveBangumiViaCli(...args){state.local.push(args);if(state.failLocal)throw Error('NO_PERMISSION');return resolved}}
 const api=loadTs('src/upstream/modules/room/watch-together/movie-source-resolver.ts',{
  '@/store/roomStore':{useRoomStore:{getState:()=>({movies:[state.movie]})}},'@/lib/mediaFormat':{detectMediaFormat:()=> 'mp4'},
  '@/modules/bilibili/bilibiliApi':{async resolveBilibiliWithOptions(...args){state.server.push(args);return resolved}},
  '@/modules/bilibili/cliApi':cli,'@/modules/bilibili/input':input,'@/store/cliAgentStore':{useCliAgentStore:{getState:()=>({agents:[]})}},
  '@/modules/bilibili/parseOptions':{getBilibiliParseOptions:()=>state.prefs},'@/store/systemSettingsStore':{useSystemSettingsStore:{getState:()=>state.settings}},
  '../../../../platform/bilibiliProxy':{getEmbeddedProxyStatus:()=>state.proxy,isEmbeddedBilibiliHost:()=>true,subscribeEmbeddedProxy(){}},
  '@/modules/bilibili/nativeQualityPolicy':{getNativeQualityPolicy:()=>({mode:'autoMax'}),getWebViewCapabilities:async()=>[],nativeQualityCacheKey:()=>String(state.proxy.sessionVersion),recordNativeQuality(){}},
  '@/modules/server-files/serverFilesApi':{},'@/modules/direct-link/directLinkApi':{},'@/modules/anisubs':{},'@/modules/cms/api':{},'@/modules/kazumi':{},'@/modules/player/services/url-proxy':{},
 })
 return {state,cli,resolved,...api}
}

test('native proxy is eligible only when logged in; ordinary playback uses the server without it',async()=>{
 const h=harness()
 assert.equal(h.getActiveCliProxyUrl(),null)
 assert.equal(h.getBilibiliInputResolvePolicy(h.state.movie.url).proxyUrl,null)
 await h.resolveBilibiliOnline(h.state.movie)
 assert.equal(h.state.server.length,1);assert.equal(h.state.local.length,0)
 assert.equal(h.state.server[0][3].movieId,42)
 h.state.proxy={...h.state.proxy,loggedIn:true,sessionVersion:2};h.state.prefs.cliEnabled=true
 await h.resolveBilibiliOnline(h.state.movie)
 assert.equal(h.state.local.length,1);assert.equal(h.state.server.length,1)
 h.state.failLocal=true
 await assert.rejects(()=>h.resolveBilibiliOnline(h.state.movie,undefined,{forceRefresh:true}),/NO_PERMISSION/)
 assert.equal(h.state.server.length,1,'local permission failure must not switch accounts')
})

test('CLI-only rejects both unready and anonymous native proxies before any server request',async()=>{
 const h=harness();h.state.movie.cliOnly=true;h.state.settings.bilibiliPgcDefaultMode='cliOnly'
 assert.throws(()=>h.getBilibiliInputResolvePolicy('https://www.bilibili.com/bangumi/play/ep102'),/仅允许本机代理/)
 await assert.rejects(()=>h.resolveBilibiliOnline(h.state.movie),/本机代理/)
 assert.equal(h.state.server.length,0);assert.equal(h.state.local.length,0)
 h.state.proxy.loggedIn=true;h.state.proxy.ready=false
 await assert.rejects(()=>h.resolveBilibiliOnline(h.state.movie),/本机代理/)
 assert.equal(h.state.server.length,0)
})

test('native add preview, quality and part use the server when only the server is logged in',async()=>{
 const h=harness(),source=readFileSync('src/upstream/modules/room/components/MoviePushPanel.tsx','utf8'),start=source.indexOf('  const handleResolve = async'),end=source.indexOf('  // 统一添加影片',start),errors=[]
 const box={exports:{},...input,...h.cli,getBilibiliInputResolvePolicy:h.getBilibiliInputResolvePolicy,isEmbeddedBilibiliHost:()=>true,isHost:true,roomId:'r',sourceType:'bilibili',url:'https://b23.tv/eI0bzE2',resolvedMovie:null,
  setResolvedMovie:r=>{box.resolvedMovie=r},setShowPageSelector(){},setLoading(){},setResolveProgress(){},setQualityLoading(){},setPageSelectLoading(){},resolvedViaCliRef:{current:true},message:{error:e=>errors.push(e),warning(){},info(){}},console:{error(){},warn(){}},
  async resolveBilibili(...args){h.state.server.push(args);return h.resolved},async resolveBilibiliWithOptions(...args){h.state.server.push(args);return h.resolved},
 }
 runInNewContext(stripTypeScriptTypes(source.slice(start,end))+';exports.api={handleResolve,handleQualityChange,handlePageSelect}',box)
 await box.exports.api.handleResolve();assert.equal(box.resolvedViaCliRef.current,false)
 await box.exports.api.handleQualityChange('64');await box.exports.api.handlePageSelect(2)
 assert.deepEqual(errors,[]);assert.equal(h.state.server.length,3);assert.equal(h.state.local.length,0)
 assert.equal(h.state.server[1][1],64);assert.equal(h.state.server[2][3].page,2)
 h.state.settings.bilibiliPgcDefaultMode='cliOnly';box.url='https://www.bilibili.com/bangumi/play/ep102'
 await box.exports.api.handleResolve();assert.equal(h.state.server.length,3);assert.equal(errors.length,1)
})
