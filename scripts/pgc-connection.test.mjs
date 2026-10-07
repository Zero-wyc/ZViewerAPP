import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {loadTs} from './test-ts-module.mjs'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/pgc-contract.json',import.meta.url)))
const globals={URL, URLSearchParams, window:{location:{origin:'https://localhost',hostname:'localhost',protocol:'https:'}}}
const transport=loadTs('src/platform/connectionTransport.ts',{},globals)
const urls=loadTs('src/mobile/serverUrl.ts',{'../platform/connectionTransport':transport},globals)
test('address candidates preserve protocol, IPv6 and path; reject credentials',()=>{
 assert.deepEqual([...urls.serverCandidates('example.com/base/')],['https://example.com/base','http://example.com/base'])
 assert.deepEqual([...urls.serverCandidates('[::1]:3333')],['https://[::1]:3333','http://[::1]:3333'])
 assert.deepEqual([...urls.serverCandidates('https://example.com/base/')],['https://example.com/base'])
 for(const input of ['ftp://x','https://u:p@x','https://x?a=1','https://x#bad'])assert.throws(()=>urls.serverCandidates(input))
 assert.throws(()=>urls.serverCandidates('example.com','custom'))
})
test('transport only maps selected origin; WS, base paths, broadcasting and revocation',()=>{
 transport.bindConnectionTransport('https://selected.test/base','http://127.0.0.1:3333/private/base')
 const remote='https://selected.test/base/api/media?id=1'
 const local=transport.connectionUrl(remote)
 assert.equal(local,'http://127.0.0.1:3333/private/base/api/media?id=1')
 assert.equal(transport.logicalConnectionUrl(local),remote)
 assert.equal(transport.connectionUrl('wss://selected.test/base/rtc'),'ws://127.0.0.1:3333/private/base/rtc')
 assert.equal(transport.connectionUrl('wss://voice.test/rtc'),'wss://voice.test/rtc')
 assert.equal(transport.connectionUrl('https://selected.test:444/api'),'https://selected.test:444/api')
 assert.equal(urls.authenticatedMediaUrl('https://selected.test/base',remote,'access'),'http://127.0.0.1:3333/private/base/api/media?id=1&token=access')
 transport.clearConnectionTransport();assert.equal(transport.connectionUrl(remote),remote)
})
function harmony(play='preview',nested=false){
 const requests=[]
 const http={RequestMethod:{GET:'GET'},createHttp:()=>({destroy(){},async request(url,options){
  requests.push({url,options});const data=url.includes('/season?')?fixture.season:fixture[play]
  return {responseCode:200,result:JSON.stringify(nested?{code:0,data:{result:data}}:{code:0,result:data})}
 }})}
 return {requests,...loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BilibiliResolver.ets',{'@kit.NetworkKit':{http},'@kit.CryptoArchitectureKit':{cryptoFramework:{}},'@kit.ArkTS':{util:{TextEncoder}}})}
}
test('ArkTS PGC shares Go fixture: ep2, season, badge, actual preview length',async()=>{
 const h=harmony('preview',true),r=await h.resolveBilibili('ep102',0,32,'manual',0,'',0,true,[])
 assert.equal(r.cid,1002);assert.equal(r.currentPage,2);assert.equal(r.epId,102);assert.equal(r.seasonId,900)
 assert.equal(r.duration,30);assert.equal(r.preview,true);assert.equal(r.pages[1].badge,'会员')
 assert.ok(h.requests[1].url.includes('cid=1002'))
 await assert.rejects(()=>h.resolveBilibili('ep102',1001,32,'manual',0,'',0,true),/cid/)
})
test('ArkTS manual selection respects capabilities and AAC audio',async()=>{
 const h=harmony('dash'),caps=[{codec:'avc',maxWidth:1280,maxHeight:720,maxFrameRate:30}]
 const r=await h.resolveBilibili('ss900',1002,64,'manual',0,'',0,false,caps)
 assert.equal(r.currentQn,64);assert.equal(r.audioCodec,'mp4a.40.2')
 await assert.rejects(()=>h.resolveBilibili('ep102',0,80,'manual',0,'',0,false,caps),/对应画质/)
})

function connectionHarness({probeCode='tls_unavailable',responseStatus=200}={}){
 const calls=[],configured=[];let count=0
 const native={async configure(p){configured.push(p);return {url:p.url}},async probe(p){calls.push({native:true,url:p.url});return {ok:false,code:probeCode}}}
 const connection=loadTs('src/platform/serverConnection.ts',{
  '@capacitor/core':{registerPlugin:()=>native},'./runtime':{getRuntimePlatform:()=> 'android'},
  './connectionTransport':transport,'../mobile/serverUrl':urls,
 },{...globals,localStorage:{getItem:()=>null,setItem(){}},fetch:async (url,options)=>{
  calls.push({url,options});count++
  if(url.startsWith('https:'))throw new TypeError('opaque web error')
  return {ok:responseStatus===200,status:responseStatus,json:async()=>({success:true,settings:{roomCreationMode:'all'}})}
 }})
 return {...connection,calls,configured}
}
test('HTTPS classification gates HTTP fallback and probes omit all credentials',async()=>{
 const h=connectionHarness(),selected=await h.selectServer('server.test/base','auto',false,new AbortController().signal)
 assert.equal(selected,'http://server.test/base')
 for(const request of h.calls.filter(c=>!c.native)){assert.equal(request.options.credentials,'omit');assert.equal(request.options.headers,undefined);assert.equal(request.options.redirect,'error')}
 assert.equal(h.configured.length,2)
})
test('certificate, business and generic network errors never downgrade',async()=>{
 for(const code of ['certificate_untrusted','network','response']){
  const h=connectionHarness({probeCode:code});await assert.rejects(()=>h.selectServer('server.test','auto',false,new AbortController().signal))
  assert.ok(h.calls.every(c=>c.url.startsWith('https:')))
 }
 const h=connectionHarness();await assert.rejects(()=>h.selectServer('https://server.test','auto',false,new AbortController().signal));assert.equal(h.configured.length,1)
})
test('cancelled address selection cannot send a diagnostic or credentials',async()=>{
 const h=connectionHarness(),abort=new AbortController();abort.abort()
 await assert.rejects(()=>h.selectServer('server.test','auto',false,abort.signal));assert.equal(h.calls.length,0);assert.equal(h.configured.length,0)
})

function resolverHarness(){
 let status={ready:false,loggedIn:false,proxyUrl:'http://127.0.0.1:9333/local',sessionVersion:1},serverCalls=0,localCalls=0
 const movie={id:42,url:'ep102',cid:1002,currentPage:2,cliOnly:true,pages:[{epId:102}]}
 const resolved={videoUrl:'https://fixture.bilivideo.com/80.m4s',cid:1002,epId:102,seasonId:900,seasonTitle:'Contract',preview:true,duration:30,format:'dash'}
 const fail={value:false}
 const modules={
  '@/store/roomStore':{useRoomStore:{getState:()=>({movies:[movie]})}},
  '@/lib/mediaFormat':{detectMediaFormat:()=> 'mp4'},
  '@/modules/bilibili/bilibiliApi':{resolveBilibiliWithOptions:async()=>{serverCalls++;return resolved}},
  '@/modules/bilibili/cliApi':{extractBvid:()=>null,extractBangumiId:()=>({epId:102}),resolveBangumiViaCli:async()=>{localCalls++;if(fail.value)throw Error('NO_PERMISSION');return resolved}},
  '@/store/cliAgentStore':{useCliAgentStore:{getState:()=>({agents:[]})}},
  '@/modules/bilibili/parseOptions':{getBilibiliParseOptions:()=>({configured:true,cliEnabled:false,preferMp4:true})},
  '@/store/systemSettingsStore':{useSystemSettingsStore:{getState:()=>({dashDisabled:true,bilibiliDefaultParseMode:'mp4',bilibiliPgcDefaultMode:'mp4'})}},
  '@/modules/server-files/serverFilesApi':{buildServerFileProxyUrl:p=>p},
  '@/modules/direct-link/directLinkApi':{resolveMovieDirectUrl:()=>null},
  '../../../../platform/bilibiliProxy':{getEmbeddedProxyStatus:()=>status,isEmbeddedBilibiliHost:()=>true,subscribeEmbeddedProxy(){}},
  '../../../../platform/runtime':{getRuntimePlatform:()=> 'android'},
  '@/modules/bilibili/nativeQualityPolicy':{getNativeQualityPolicy:()=>({mode:'autoMax'}),getWebViewCapabilities:async()=>[],nativeQualityCacheKey:()=> 'auto',recordNativeQuality(){}},
  '@/modules/anisubs':{},
 }
 return {movie,fail,setReady(){status={...status,ready:true,loggedIn:true}},counts:()=>({serverCalls,localCalls}),...loadTs('src/upstream/modules/room/watch-together/movie-source-resolver.ts',modules)}
}
test('cliOnly blocks offline and permission failures, forbids server recovery, retains PGC metadata',async()=>{
 const h=resolverHarness()
 await assert.rejects(()=>h.resolveMovieSource({movie:h.movie,sourceType:'bilibili',recovery:{sourceUrl:'https://server.test/media'}}),/本机代理/)
 assert.equal(h.counts().serverCalls,0)
 h.setReady();h.fail.value=true
 await assert.rejects(()=>h.resolveBilibiliOnline(h.movie),/NO_PERMISSION/);assert.equal(h.counts().serverCalls,0)
 h.fail.value=false;const r=await h.resolveBilibiliOnline(h.movie)
 assert.equal(r.epId,102);assert.equal(r.seasonId,900);assert.equal(r.preview,true);assert.equal(r.noProxyFallback,true)
 assert.equal(h.getEffectivePreferMp4(42),false);assert.equal(h.counts().serverCalls,0)
})
test('selected HTTPS media route is direct, private channel never becomes a server proxy target',()=>{
 transport.bindConnectionTransport('https://selected.test/base','http://127.0.0.1:3333/private/base')
 const route=loadTs('src/upstream/modules/player/services/url-proxy.ts',{
  '../../../../platform/connectionTransport':transport,
  '@/lib/api':{getApiUrl:()=> 'http://127.0.0.1:3333/private/base'},
  '../../../../mobile/serverUrl':urls,
 },{...globals,localStorage:{getItem:()=>null}})
 const local='http://127.0.0.1:3333/private/base/media.mp4'
 assert.equal(route.resolveMediaRoute('https://selected.test/base/media.mp4',undefined,'mp4').url,local)
 assert.equal(route.resolveMediaRoute(local,undefined,'mp4').url,local)
 assert.equal(route.resolveMediaRoute(local,undefined,'mp4').allowFallback,false)
 assert.ok(route.resolveMediaRoute('https://fixture.bilivideo.com/video.mp4?platform=pc',undefined,'mp4').url.includes('/api/stream/proxy?url='))
 assert.equal(route.resolveMediaRoute('https://fixture.bilivideo.com/video.mp4?platform=html5',undefined,'mp4').allowFallback,true)
 transport.clearConnectionTransport()
})

test('cliOnly buffer checks this device before cache/download and never downloads a host stream',async()=>{
 let caches=0,downloads=0
 const movie={id:42,url:'ep102',cid:1002,cliOnly:true}
 const {fetchBlobsForBufferMode}=loadTs('src/upstream/modules/player/services/buffer-mode.ts',{
  '@/store/roomStore':{useRoomStore:{getState:()=>({roomId:'room',currentMovieId:42,movies:[movie]})}},
  '../../../../platform/bilibiliProxy':{isEmbeddedBilibiliHost:()=>true,getEmbeddedProxyStatus:()=>({sessionVersion:1})},
  '@/modules/room/watch-together/movie-source-resolver':{getActiveCliProxyUrl:()=>null,resolveBilibiliOnline:async()=>{throw Error('本机代理不可用')}},
  '@/modules/bilibili/parseOptions':{getBilibiliParseOptions:()=>({cliEnabled:false})},
  '@/modules/bilibili/cliApi':{buildCliProxyUrl:()=>{throw Error('not expected')}},
  './buffer-cache':{buildCacheKey:()=> 'key',getCacheEntry:async()=>{caches++;return {videoBlob:{},audioBlob:{}}}},
  './bilibili-downloader':{downloadBilibiliDashStreams:async()=>{downloads++},DownloadError:class extends Error{},UrlExpiredError:class extends Error{},DownloadAbortedError:class extends Error{}},
 },{setTimeout})
 await assert.rejects(()=>fetchBlobsForBufferMode({state:{sourceType:'bilibili',cid:1002,sourceUrl:'https://host/video',audioUrl:'https://host/audio'}}),/本机代理/)
 assert.equal(caches,0);assert.equal(downloads,0)
})
