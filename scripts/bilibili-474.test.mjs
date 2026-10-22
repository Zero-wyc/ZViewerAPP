import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const capabilityFile = 'src/upstream/modules/player/codec-capability.ts'
function codecProbe(supports) {
  return loadTs(capabilityFile, {}, supports ? {MediaSource:{isTypeSupported:supports}} : {})
}

test('decoder preflight uses the exact profile and reports missing probes as unknown', () => {
  const requested=[]
  const api=codecProbe(type => {requested.push(type);return type.includes('avc1') || type.includes('hvc1.1.')})
  assert.equal(api.getVideoCodecSupport('hvc1.1.6.L153.B0'),'supported')
  assert.equal(api.getVideoCodecSupport('hvc1.2.4.H150.90'),'unsupported')
  assert.equal(api.getVideoCodecSupport('dvh1.05.06'),'unsupported')
  assert.equal(api.getVideoCodecSupport(''),'unknown')
  assert.equal(api.getVideoCodecSupport('hevc'),'unknown')
  assert.equal(codecProbe().getVideoCodecSupport('hvc1.2.4.H150.90'),'unknown')
  assert.equal(codecProbe(()=>{throw Error('unavailable')}).getVideoCodecSupport('hvc1.2.4.H150.90'),'unknown')
  assert.ok(requested.includes('video/mp4; codecs="hvc1.2.4.H150.90"'))
  assert.throws(()=>api.assertVideoCodecSupported({format:'dash',videoCodec:'hvc1.2.4.H150.90'}),/当前设备无法解码/)
})

test('actual server resolver preserves optional HDR metadata and rejects unsupported manual results', async () => {
  const payload={success:true,status:'done',videoUrl:'https://fixture.test/video',format:'dash',videoCodec:'hvc1.2.4.H150.90',isHdr:true,hdrType:'hlg',videoCodecid:12}
  for(const ndjson of [false,true]) {
    const api=loadTs('src/upstream/modules/bilibili/bilibiliApi.ts',{
      '@/lib/api':{apiFetch:async()=>({ok:true,headers:{get:()=>ndjson?'application/x-ndjson':'application/json'},json:async()=>payload,text:async()=>JSON.stringify(payload)+'\n'})},
      '../player/codec-capability':codecProbe(()=>true),
    },{setTimeout,clearTimeout})
    const result=await api.resolveBilibili('BV1xx411c7mD',125)
    assert.equal(result.isHdr,true);assert.equal(result.hdrType,'hlg');assert.equal(result.videoCodecid,12)
  }
  const api=loadTs('src/upstream/modules/bilibili/bilibiliApi.ts',{
    '@/lib/api':{apiFetch:async()=>({ok:true,headers:{get:()=>''},json:async()=>payload})},
    '../player/codec-capability':codecProbe(()=>false),
  },{setTimeout,clearTimeout})
  await assert.rejects(()=>api.resolveBilibili('BV1xx411c7mD',125),/当前设备无法解码/)
})

test('player hook rejects an unsupported switch and force reload before destroying the active engine', async () => {
  const attachments=[],cleanups=[],effects=[]
  const video={isConnected:true,paused:false,pause(){},addEventListener(){},removeEventListener(){}}
  const api=loadTs('src/upstream/modules/player/hooks/usePlayerSource.ts',{
    react:{useRef:current=>({current}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn())},
    '@/store/roomStore':{useRoomStore:{getState:()=>({roomSessionRevision:1,currentMovieId:1,setMediaAttachProgress(){}})}},
    '@/modules/player':{selectEngine:()=>({type:'videojs10-dash',async attach(_video,source){attachments.push(source);return {cleanup:()=>cleanups.push(source)}}}),shouldUsePlaysVideo:()=>false,resetVideoElement(){}},
    '@/modules/player/utils':{formatVideoLoadError:()=>''},'@/lib/api':{},'@/lib/mediaFormat':{isBrowserPlayableFormat:()=>true},
    '../services/source-identity':loadTs('src/upstream/modules/player/services/source-identity.ts'),
    '../codec-capability':codecProbe(type=>type.includes('avc1')),
  },{URL})
  const player=api.usePlayerSource({videoRef:{current:video}})
  try {
    const old={url:'https://fixture.test/sdr',format:'dash',videoCodec:'avc1.640033'}
    await player.attachSource(video,old)
    const hdr={url:'https://fixture.test/hdr',format:'dash',videoCodec:'hvc1.2.4.H150.90'}
    await assert.rejects(()=>player.attachSource(video,hdr),/当前设备无法解码/)
    await assert.rejects(()=>player.forceReload(video,hdr),/当前设备无法解码/)
    assert.equal(attachments.length,1);assert.equal(cleanups.length,0)
    assert.equal(player.appliedSourceUrlRef.current,old.url)
  } finally {effects.forEach(fn=>fn?.())}
})

function harmonyHarness() {
  const requests=[]
  const http={RequestMethod:{GET:'GET'},createHttp:()=>({destroy(){},async request(address){
    requests.push(new URL(address))
    const data=address.includes('/pgc/view/')?{season_id:900,title:'fixture',episodes:[{id:102,cid:1,title:'One',duration:300000}]}:
      address.includes('/view?')?{title:'fixture',cid:1,duration:300,pages:[{cid:1,page:1,part:'One',duration:300}]}:
      address.endsWith('/nav')?{wbi_img:{img_url:'https://i.test/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i.test/4932caff0ff746eab6f01bf08b70ac45.png'}}:
      {quality:64,accept_quality:[64],durl:[{url:'https://fixture.test/video.mp4',length:300000}]}
    return {responseCode:200,result:JSON.stringify({code:0,...(address.includes('/pgc/')?{result:data}:{data})})}
  }})}
  return {requests,...loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BilibiliResolver.ets',{
    '@kit.NetworkKit':{http},'@kit.ArkTS':{url:{URL},util:{TextEncoder}},
    '@kit.CryptoArchitectureKit':{cryptoFramework:{createMd:()=>({async update(){},async digest(){return {data:new Uint8Array(16)}}})}},
    './BilibiliWbi':loadTs('ZV-HarmonyOS/entry/src/main/ets/services/BilibiliWbi.ets'),
  })}
}

test('ArkTS UGC and PGC actual HTTP requests use corrected flags and retain MP4', async () => {
  const api=harmonyHarness()
  for(const [input,qn,vip,mp4,want] of [
    ['BV1xx411c7mD',64,0,false,16],['BV1xx411c7mD',120,1,false,208],['BV1xx411c7mD',127,1,false,1232],
    ['ep102',64,0,false,16],['ep102',127,1,false,1232],['ep102',64,1,true,1],
  ]) {
    try{await api.resolveBilibili(input,0,qn,'manual',0,'local-fixture',vip,mp4)}catch{/* fixture has only a 720P track */}
    const actual=api.requests.filter(url=>url.pathname.endsWith('/playurl')).at(-1)
    assert.ok(actual);assert.equal(actual.searchParams.get('fnval'),String(want))
  }
  assert.equal(api.computeBilibiliFnval(true,127,'av1'),3280)
  assert.equal(api.computeBilibiliFnval(true,126),208)
  assert.equal(api.computeBilibiliFnval(true,126,'',false,true),720)
})

test('native quality selection confirms resolution before reload and restores failures without stopping playback', async () => {
  const code=readFileSync('src/upstream/modules/bilibili/NativeQualitySelect.tsx','utf8')
  const start=code.indexOf('onChange={')+10,end=code.indexOf('\n    }} />',start)+6
  let policy={mode:'autoMax'},revision=0,fail=true
  const events=[],movie={id:1,cid:11},store={roomSessionRevision:1,currentMovieId:1,movies:[movie],setViewerCliResolvedSource:()=>events.push('clear'),triggerReloadBilibili:()=>events.push('reload')}
  const box={exports:{},busy:false,movieId:1,isHost:true,useRoomStore:{getState:()=>store},
    getNativeQualityPolicy:()=>policy,getQualitySelectionRevision:()=>revision,getEmbeddedProxyStatus:()=>({sessionVersion:1}),
    selectNativeQuality:(_id,qn)=>{policy=qn?{mode:'manual',qn}:{mode:'autoMax'};revision++},restoreNativeQuality:(_id,p)=>{policy=p},
    setBusy(){},resolveBilibiliOnline:async()=>{events.push('resolve');if(fail)throw Error('unsupported')},message:{error:()=>events.push('error'),info:()=>events.push('success')},
  }
  runInNewContext('exports.change = '+code.slice(start,end),box)
  await box.exports.change('120')
  assert.equal(policy.mode,'autoMax');assert.deepEqual(events,['resolve','error'])
  events.length=0;fail=false
  await box.exports.change('64')
  assert.equal(policy.qn,64);assert.deepEqual(events,['resolve','clear','reload','success'])
})
