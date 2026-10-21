import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { loadTs } from './test-ts-module.mjs'

const { isPlaybackSessionCurrent } = loadTs('src/upstream/modules/sync-playback/playbackIdentity.ts')
const initial = () => ({roomId:'r',roomSessionRevision:1,currentMovieId:null,movies:[]})
const source = {sourceType:'bilibili',sourceUrl:'https://cdn.test/video',currentMovieId:8,cid:123,currentTime:12,isPlaying:false,playbackRate:1}
const selected = (id=8,cid=123) => ({...initial(),currentMovieId:id,movies:[{id,cid}]})

test('first playlist identity may arrive after playback; actual switches and stale pages remain rejected', () => {
  assert.equal(isPlaybackSessionCurrent(initial(),selected(),source),true)
  assert.equal(isPlaybackSessionCurrent(initial(),selected(),{...source,currentMovieId:undefined}),true)
  assert.equal(isPlaybackSessionCurrent(initial(),selected(9),source),false)
  assert.equal(isPlaybackSessionCurrent(initial(),selected(8,999),source),false)
  assert.equal(isPlaybackSessionCurrent(selected(),selected(9),{...source,currentMovieId:9}),false)
  assert.equal(isPlaybackSessionCurrent(initial(),{...selected(),roomSessionRevision:2},source),false)
  assert.equal(isPlaybackSessionCurrent(initial(),{...selected(),roomId:'new'},source),false)
  assert.equal(isPlaybackSessionCurrent(initial(),selected(),{...source,isPreview:true}),false)
})

test('initial request reaches the shared receiver when the first current-movie event overtakes its ack', async () => {
  let current = initial(), ack, attached=0
  const video = {isConnected:true,currentTime:0,playbackRate:1,paused:true}
  const socket = {emit(event,payload,callback){ack=callback},on(){},off(){}}
  const {usePlaybackStateRequest} = loadTs('src/upstream/modules/playback-memory/hooks/usePlaybackStateRequest.ts', {
    react:{useEffect:fn=>fn(),useRef:current=>({current})},
    '@/hooks/useSocket':{useSocket:()=>({socket})},
    '@/store/roomStore':{useRoomStore:{getState:()=>({...current,watchTogether:source})}},
    '@/components/ui/message':{message:{error(){}}},
    '@/modules/sync-playback/constants':{SOCKET_EVENT:{REQUEST_STATE:'request'}},
    '@/modules/sync-playback/safePlay':{},
    '@/modules/sync-playback/services/state-merge':loadTs('src/upstream/modules/sync-playback/services/state-merge.ts'),
    '@/modules/sync-playback/playbackIdentity':{isPlaybackSessionCurrent},
    '@/modules/player/services/buffer-mode':{},
  },{setTimeout:()=>1,clearTimeout(){}})
  usePlaybackStateRequest({roomId:'r',isHostRef:{current:false},videoRef:{current:video},suppressEventsRef:{current:false},
    receiverRef:{current:{revision:0,receive({state}){attached++;video.currentTime=state.currentTime}}}})
  current=selected()
  ack({success:true,data:{state:source}})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(attached,1)
  assert.equal(video.currentTime,12)
})

test('native source resolution completing the initial metadata wait must mount; a replacement must not', async () => {
  const code=readFileSync('src/upstream/modules/sync-playback/hooks/useVideoSource.ts','utf8')
  const start=code.indexOf('  const applySourceToVideo = useCallback(')
  const end=code.indexOf('\n  useEffect(',start)
  for (const [after,expected] of [[selected(),1],[selected(9),0],[{...selected(),roomSessionRevision:2},0]]) {
    let current=initial(),attached=0
    const exports={}
    runInNewContext(stripTypeScriptTypes(code.slice(start,end))+';exports.apply=applySourceToVideo',{
      exports,useCallback:fn=>fn,useRoomStore:{getState:()=>current},isPlaybackSessionCurrent,
      resolveViewerEffectiveState:async state=>{current=after;return state},
      attachSource:async()=>{attached++},toPlayerSource:state=>state,wasUserPaused:()=>false,
      nativeAttachmentDepth:{current:0},isEmbeddedBilibiliHost:()=>false,
      cleanup(){},recoverNative(){},
    })
    await exports.apply({isConnected:true,currentTime:0},source)
    assert.equal(attached,expected)
  }
})

test('denied automatic danmaku writes are handled without interrupting local video comments', async () => {
  const code=readFileSync('src/upstream/modules/room/watch-together/WatchTogetherCore.tsx','utf8')
  const start=code.indexOf('    const cid = watchTogether.cid')
  const end=code.indexOf('  }, [watchTogether.cid',start)
  for(const cid of [undefined,123]){
    const errors=[],local=[]
    runInNewContext(stripTypeScriptTypes('(function(){'+code.slice(start,end)+'})()'),{
      watchTogether:{cid,sourceType:'bilibili'},danmakuItemsRef:{current:[]},videoRef:{current:{currentTime:0}},
      danmakuLayerRef:{current:{loadDanmakuTrack:(...args)=>local.push(args),clear(){},seek(){}}},
      setDefaultTrack:async()=>{throw Error('无权限')},fetchBilibiliDanmakuByCid:async()=>[{text:'test'}],
      console:{warn:(...args)=>errors.push(args),error:(...args)=>errors.push(args)},
    })
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(errors.length,1)
    assert.ok(local.length>0)
  }
})
