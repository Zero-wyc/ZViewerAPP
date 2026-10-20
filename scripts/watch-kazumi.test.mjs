import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {runInNewContext} from 'node:vm'
import {fileURLToPath} from 'node:url'
import {loadTs} from './test-ts-module.mjs'

const root=fileURLToPath(new URL('../src/upstream/',import.meta.url))
const read=path=>readFileSync(root+path,'utf8')
const syncState=loadTs(root+'modules/sync-playback/services/state-merge.ts')
const biliState={sourceUrl:'https://media.example/video.m4s',sourceType:'bilibili',audioUrl:'https://media.example/audio.m4s',format:'dash',cid:123,videoCodec:'avc1.640028',audioCodec:'mp4a.40.2',currentQn:80,acceptQuality:[{id:80,label:'1080P'}],currentTime:10,duration:91,isPlaying:true,playbackRate:1,bufferMode:true,hostCliEnabled:true}
const hlsState={sourceUrl:'https://media.example/episode.m3u8',sourceType:'kazumi',format:'hls',audioUrl:undefined,cid:undefined,videoCodec:undefined,audioCodec:undefined,currentQn:undefined,acceptQuality:undefined,duration:undefined,currentTime:0,isPlaying:true,playbackRate:1,headers:{Referer:'https://source.example/'}}
const wire=value=>JSON.parse(JSON.stringify(value))

test('Bilibili to Kazumi clears JSON-omitted audio and metadata before the store shallow merge',()=>{
 const payload=wire({state:hlsState,diff:syncState.computeStateDiff(biliState,hlsState)})
 assert.equal(Object.hasOwn(payload.diff,'audioUrl'),false)
 assert.equal(syncState.mergeStateDiff(biliState,payload.diff).audioUrl,biliState.audioUrl)
 const restored={...biliState,...syncState.restoreStateSnapshot(biliState,payload.state)}
 for(const key of ['audioUrl','cid','videoCodec','audioCodec','currentQn','acceptQuality','bufferMode','hostCliEnabled'])assert.equal(restored[key],undefined,key)
 assert.equal(restored.format,'hls');assert.equal(restored.duration,0)
 assert.equal(restored.headers.Referer,hlsState.headers.Referer)
 assert.equal(biliState.cid,123)
})
test('complete snapshots recover after a missed diff and clear HLS headers when switching back to Bilibili',()=>{
 const payload=wire({state:biliState,diff:{currentTime:10},seq:9})
 const restored=syncState.restoreStateSnapshot(hlsState,payload.state)
 assert.equal(restored.audioUrl,biliState.audioUrl);assert.equal(restored.format,'dash')
 assert.equal(restored.headers,undefined)
})
test('request-state snapshots clear optional source fields even if the video URL is unchanged',()=>{
 const restored=syncState.restoreStateSnapshot(biliState,wire({...hlsState,sourceUrl:biliState.sourceUrl,format:'mp4'}))
 assert.equal(restored.audioUrl,undefined);assert.equal(restored.cid,undefined);assert.equal(restored.format,'mp4')
})
test('legacy same-source snapshots preserve playback policies without leaking them into another film',()=>{
 const current={...hlsState,playsvideoEnabled:false,noProxyFallback:true}
 const restored=syncState.restoreStateSnapshot(current,wire(hlsState))
 assert.equal(restored.playsvideoEnabled,false);assert.equal(restored.noProxyFallback,true)
 const changed=syncState.restoreStateSnapshot(current,wire(biliState))
 assert.equal(changed.playsvideoEnabled,undefined);assert.equal(changed.noProxyFallback,undefined)
 const emitted=wire(syncState.buildStateFromVideo(null,current))
 assert.equal(emitted.playsvideoEnabled,false);assert.equal(emitted.noProxyFallback,true)
})
test('remounted player cannot reuse the original room recovery snapshot',()=>{
 const mobile=readFileSync(new URL('../src/mobile/MobileRoom.tsx',import.meta.url),'utf8')
 const expression=mobile.match(/initialPlayback=\{([^}]+)\}/)[1]
 const room={playback:{currentMovieId:3,currentTime:255}}
 assert.equal(runInNewContext(expression,{playerKey:'init',room}),room.playback)
 for(const playerKey of [1,2,3])assert.equal(runInNewContext(expression,{playerKey,room}),null)
})
const helpers={}
runInNewContext(stripTypeScriptTypes(read('modules/player/services/hls-proxy.ts')).replace(/export /g,'')+';Object.assign(exports,{readHlsProxySource,buildHlsProxyRequest,isServerApiUrl})',{URL,URLSearchParams,exports:helpers})

function loaderHarness(kind='kazumi', channel=false) {
 const base='https://server.example/base'
 const source=`${base}/api/stream/${kind}/proxy?url=${encodeURIComponent('https://cdn.example/show/master.m3u8?sig=a%2Fb')}&referer=&userAgent=Fixture&origin=https%3A%2F%2Fanime.example&cookie=source-cookie&token=host-token`
 const channelBase='http://127.0.0.1:9988/private'
 const logicalConnectionUrl=url=>channel?url.replace(channelBase,base):url
 const connectionUrl=url=>channel?url.replace(base,channelBase):url
 let request
 class BaseLoader { load(context,config,callbacks){ request={context,config,callbacks} } }
 const code=read('modules/player/engines/hls-engine.ts')
 const start=code.indexOf('function createProxyLoader('),end=code.indexOf('/** 等待 hls.js',start)
 const exports={}
 runInNewContext(stripTypeScriptTypes(code.slice(start,end))+';exports.createProxyLoader=createProxyLoader',{
  ...helpers,...loadTs(root+'modules/player/services/library-hls-proxy.ts',{}, {URL,URLSearchParams}),exports,URL,URLSearchParams,Hls:{DefaultConfig:{loader:BaseLoader}},getApiUrl:()=>base,
  logicalConnectionUrl,connectionUrl,isLocalUrl:()=>false,isRelativeUrl:url=>url.startsWith('/'),
  resolveProxyUrl:()=>{throw Error('Unexpected generic proxy')},buildProxyUrl:()=>{throw Error('Unexpected generic proxy')},
  appendAuthToken:url=>{const u=new URL(logicalConnectionUrl(url));u.searchParams.set('token','viewer-token');return connectionUrl(u.href)}
 })
 const Loader=exports.createProxyLoader(connectionUrl(source))
 const loader=new Loader()
 return {source,base,loader,get request(){return request},logicalConnectionUrl,connectionUrl}
}

test('Kazumi and AniSubs master/child playlists, maps, segments and keys keep upstream bases and proxy headers',()=>{
 for(const kind of ['kazumi','anisubs']){
  const h=loaderHarness(kind)
  const contexts=[h.source,'https://cdn.example/show/2000k/playlist.m3u8','https://other-cdn.example/init.mp4','https://cdn.example/show/2000k/0001.ts','https://cdn.example/key.bin?sig=signed%2Fkey']
  for(const url of contexts){
   let args
   const config={timeout:1000},context={url}
   h.loader.load(context,config,{onSuccess:(...values)=>{args=values}})
   const proxy=new URL(h.request.context.url)
   assert.equal(proxy.pathname,`/base/api/stream/${kind}/proxy`)
   assert.equal(proxy.searchParams.get('token'),'viewer-token')
   assert.equal(proxy.searchParams.get('referer'),'')
   assert.equal(proxy.searchParams.get('userAgent'),'Fixture')
   assert.equal(proxy.searchParams.get('cookie'),'source-cookie')
   const upstream=proxy.searchParams.get('url')
   assert.ok(!upstream.includes('/api/stream/'))
   assert.ok(!upstream.includes('host-token')&&!upstream.includes('viewer-token'))
   const response={url:h.request.context.url,data:'manifest'},stats={loaded:8},details={status:200}
   h.request.callbacks.onSuccess(response,stats,context,details)
   assert.equal(response.url,upstream);assert.equal(context.url,upstream)
   assert.equal(args[0],response);assert.equal(args[1],stats);assert.equal(args[2],context);assert.equal(args[3],details)
   assert.equal(h.request.config,config)
  }
 }
})

test('API origin and path prefix are exact; source credentials never become client authentication',()=>{
 assert.equal(helpers.isServerApiUrl('https://server.example/base/api/file','https://server.example/base'),true)
 assert.equal(helpers.isServerApiUrl('https://server.example/other/api/file','https://server.example/base'),false)
 assert.equal(helpers.isServerApiUrl('https://other.example/base/api/file','https://server.example/base'),false)
 assert.equal(helpers.readHlsProxySource('/api/stream/kazumi/proxy?url=javascript%3Aalert(1)','https://server.example'),null)
 const h=loaderHarness('kazumi',true)
 h.loader.load({url:h.connectionUrl(h.source)},{},{onSuccess(){}})
 assert.ok(h.request.context.url.startsWith('http://127.0.0.1:9988/private/api/'))
 const proxy=new URL(h.logicalConnectionUrl(h.request.context.url))
 assert.equal(proxy.searchParams.get('token'),'viewer-token')
 assert.ok(proxy.searchParams.get('url').startsWith('https://cdn.example/'))
})

test('host and viewers accept explicit clear; clear invalidates old recovery and asynchronous media loads',()=>{
 const code=read('modules/room/watch-together/useWatchTogether.ts')
 const start=code.indexOf('const handleCurrentMovie ='),end=code.indexOf('// 观众端：',start)
 const exports={},state={currentMovieId:1},isHostRef={current:true}
 runInNewContext(stripTypeScriptTypes(code.slice(start,end))+';exports.receive=handleCurrentMovie',{
  exports,isHostRef,initialPlaybackRef:{current:{}},loadSeqRef:{current:1},downloadAbortRef:{current:{abort:()=>{}}},useRoomStore:{getState:()=>state},setCurrentMovieId:id=>{state.currentMovieId=id}
 })
 exports.receive({movieId:2});assert.equal(state.currentMovieId,2)

 exports.receive({movieId:null});assert.equal(state.currentMovieId,null)
 isHostRef.current=false;exports.receive({movieId:null});assert.equal(state.currentMovieId,null)

 isHostRef.current=true;exports.receive({movieId:3});assert.equal(state.currentMovieId,3)

})
