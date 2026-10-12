import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { biliSelection } from '../src/lib/biliSelection.ts';
import { canonicalSelection, moviePlayback } from '../src/lib/sources.ts';
import { RoomPlayback } from '../src/lib/roomPlayback.ts';
import { enumerateLibrary, librarySelection, canClearMovies, nextMovieId } from '../src/lib/mediaLibrary.ts';
import { voiceToken, adminMuted } from '../src/lib/livekitProtocol.ts';
import { importDanmaku, danmakuBody, MAX_DANMAKU_BYTES } from '../src/lib/danmakuImport.ts';
import { shouldRefreshAuth } from '../src/lib/httpAuth.ts';
import { cleanSubtitlePayload } from '../src/lib/subtitleSync.ts';
const { verifySources } = createRequire(import.meta.url)('../scripts/stage-native-core.cjs');

test('PGC preserves episode identity and requires per-device local resolution without private URLs', () => {
  assert.equal(biliSelection('ep123').epId, 123); assert.equal(biliSelection('ss456').seasonId, 456);
  const value = canonicalSelection({ source: 'bilibili', title: '番剧', url: 'ss456' }, 'https://room.invalid', 'private');
  assert.equal(value.cliOnly, true); assert(!JSON.stringify(value).includes('private'));
  const movie = { id: 1, title: '番剧', source: 'bilibili', url: value.url, cliOnly: true, pages: [{ page: 1, epId: 123, cid: 42, part: '第一集' }, { page: 2, epId: 124, cid: 43, part: '第二集' }], currentPage: 2 };
  const source = moviePlayback(movie); assert.equal(biliSelection(source.sourceUrl).epId, 124); assert.equal(source.cid, 43); assert.equal(source.cliOnly, true);
});
test('library season pages use sorted real item IDs and do not reinterpret them as Bili cids', async () => {
  const routes = [];
  const request = async path => { routes.push(path); return { entries: path.includes('season') ? [{ name: '后集', path: 'ep-2', type: 'file', embyType: 'Episode', indexNumber: 2, parentIndexNumber: 1 }, { name: '前集', path: 'ep-1', type: 'file', embyType: 'Episode', indexNumber: 1, parentIndexNumber: 1 }] : [{ name: '第一季', path: 'season', type: 'directory' }] }; };
  const pages = await enumerateLibrary(request, 'jellyfin', 8, { name: '剧集', path: 'series', type: 'directory' });
  assert.deepEqual(pages.map(item => item.path), ['ep-1','ep-2']); assert.equal(pages[0].mountId, 8); assert.equal(pages[0].cid, undefined);
  const selection = librarySelection('jellyfin', { id: 8, serverUrl: 'https://library.invalid' }, { name: '剧集', path: 'series', type: 'directory' }, { videoUrl: '/api/jellyfin/proxy?mountId=8&path=ep-1', format: 'hls', duration: 100, multiVersion: true }, pages);
  assert.equal(selection.path, 'ep-1'); assert.equal(selection.currentPage, 1); assert.equal(selection.multiVersion, true); assert(!JSON.stringify(selection).includes('api_key')); assert.equal(routes.length, 2);
});
test('library enumeration rejects cancellation, excessive recursion and duplicate items', async () => {
  const controller = new AbortController(); controller.abort(); await assert.rejects(enumerateLibrary(async () => { throw new Error('should not fetch'); }, 'emby', 1, { path: 'root' }, controller.signal), /abort/i);
  const pages = await enumerateLibrary(async () => ({ entries: [{ name:'Root',path: 'root', type: 'directory' }, { name:'Episode',path: 'ep', type: 'file' }, { name:'Episode',path: 'ep', type: 'file' }] }), 'emby', 1, { path: 'root' }); assert.equal(pages.length, 1);
  let depth = 0; await assert.rejects(enumerateLibrary(async () => ({ entries: [{ name:'目录',path:String(++depth),type:'directory' }] }), 'emby', 1, { name:'根',path:'root' }), /目录过多/);
});
test('library room playback substitutes authoritative stream identity, switches versions, and null retires delayed states', () => {
  const room = new RoomPlayback(); const movie = { id: 4, source: 'emby', title: '剧集', url: '/api/emby/stream?movieId=4&ms=source-1080', currentPage: 2 };
  room.list([movie]); room.current(4); const value = room.state({ sourceType: 'emby', sourceUrl: '/api/emby/proxy?mountId=99&token=other-device', currentMovieId: 4, isPlaying: true, currentTime: 8 });
  assert.equal(value.sourceUrl, movie.url); assert.equal(value.currentPage, 2);
  room.list([{ ...movie, url: '/api/emby/stream?movieId=4&ms=real-opaque-id' }]); assert(room.value().sourceUrl.includes('real-opaque-id'));
  room.current(null); room.state({ ...value, isPlaying: true }); assert.equal(room.value(), null);
});
test('clear/sort permissions are distinct from live host and autoplay never wraps at end', () => {
  assert(canClearMovies('root',1,null)); assert(canClearMovies('admin',2,2)); assert(!canClearMovies('admin',2,1)); assert(!canClearMovies('user',2,2));
  assert.equal(nextMovieId([1,3,2],3),2); assert.equal(nextMovieId([1,3,2],2),null); assert.equal(nextMovieId([1,3,2],8),null);
});
test('LiveKit token validation uses server URL verbatim and separates admin mute from user intent', () => {
  assert.equal(voiceToken({ success:true, url:'wss://rtc.invalid/rtc/prefix',token:'fixture' }).url,'wss://rtc.invalid/rtc/prefix');
  for (const value of [{ success:false }, { success:true,url:'https://rtc.invalid',token:'x' }, { success:true,url:'wss://name:password@rtc.invalid',token:'x' }, { success:true,url:'wss://rtc.invalid',token:'' }]) assert.throws(() => voiceToken(value));
  assert(adminMuted('{"adminMuted":true}')); assert(!adminMuted('bad')); assert(!adminMuted('{"adminMuted":false}'));
});
test('Dandanplay and protobuf clocks match XML, unsupported modes drop, UTF8 body size rejects before save', () => {
  assert.equal(importDanmaku('{"comments":[{"cid":5,"p":"1.25,4,16711680","m":"测试"}]}')[0].time,1.25);
  assert.equal(importDanmaku('{"elements":[{"id":"x","progress":1250,"mode":5,"content":"测试"}]}')[0].time,1.25);
  assert.equal(importDanmaku('[{"time":1,"mode":8,"content":"不支持"}]').length,0);
  assert.throws(() => importDanmaku('[{"time":1,"content":"'+ '中'.repeat(MAX_DANMAKU_BYTES / 3) +'"}]'), /5 MiB/);
  assert.throws(() => danmakuBody({ items:['中'.repeat(Math.ceil(MAX_DANMAKU_BYTES / 3))] }), /5 MiB/);
});
test('third-party 401 does not retire site auth but site APIs retain refresh', () => { assert(!shouldRefreshAuth('/api/music/ncm/login/status')); assert(!shouldRefreshAuth('/api/music/ncm-cookie-login')); assert(shouldRefreshAuth('/api/rooms')); });
test('PGS bitmap payload retains only validated PNG dimensions, rejects URLs/oversize and renders no empty substitute', () => {
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const bitmap = { src:'data:image/png;base64,'+bytes.toString('base64'),x:1,y:1,width:1,height:1,canvasWidth:1920,canvasHeight:1080 };
  const input = { enabled:true,activeIndex:0,tracks:[{ label:'PGS',cues:[{ start:0,end:1,text:'',bitmap }] }] };
  assert.equal(cleanSubtitlePayload(input).tracks[0].cues[0].bitmap.src,bitmap.src);
  for (const patch of [{ src:'https://external.invalid/subtitle.png?token=secret' },{ width:0 },{ width:3 },{ x:1920 }]) assert.throws(() => cleanSubtitlePayload({ ...input, tracks:[{ label:'PGS',cues:[{ start:0,end:1,text:'',bitmap:{...bitmap,...patch} }] }] }));
});
test('native provenance fails closed on modified, added and removed source files', () => {
  const dir = mkdtempSync(join(tmpdir(),'zv-ios-source-'));
  try {
    mkdirSync(join(dir,'core')); mkdirSync(join(dir,'mobile')); const files={};
    for (const name of ['go.mod','go.sum','UPSTREAM-LICENSE','core/a.go']) { writeFileSync(join(dir,name),'reviewed\n'); files[name]=createHash('sha256').update('reviewed\n').digest('hex'); }
    assert.equal(Object.keys(verifySources(dir,{files})).length,4);
    writeFileSync(join(dir,'core/a.go'),'modified\n'); assert.throws(() => verifySources(dir,{files}),/differs/);
    writeFileSync(join(dir,'core/a.go'),'reviewed\n'); writeFileSync(join(dir,'mobile/injected.go'),'injected'); assert.throws(() => verifySources(dir,{files}),/inventory/);
    rmSync(join(dir,'mobile/injected.go')); rmSync(join(dir,'core/a.go')); assert.throws(() => verifySources(dir,{files}),/inventory/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('explicit localhost server API canonicalizes relative URLs, while foreign loopback remains forbidden', () => { const value = canonicalSelection({ title:'本机服务',source:'emby',url:'/api/emby/proxy?mountId=1&token=old' }, 'http://127.0.0.1:4312','secret'); assert.equal(value.url, '/api/emby/proxy?mountId=1'); assert.throws(() => canonicalSelection({ title:'外域',source:'mp4',url:'http://127.0.0.1:9999/proxy' }, 'http://127.0.0.1:4312','secret'), /本机/); });
import { selectServerUrl } from '../src/lib/serverDiscovery.ts';
import { canRoomAction } from '../src/lib/roomPermissions.ts';
test('automatic discovery has no credential input and falls back only on same-port plaintext evidence', async () => {
  const calls=[]; const probe=async url=>{ calls.push(url);return {ok:url.startsWith('http:'),code:'tls_unavailable'}; };
  assert.equal(await selectServerUrl('host.invalid:3333/prefix',probe),'http://host.invalid:3333/prefix'); assert.deepEqual(calls,['https://host.invalid:3333/prefix','http://host.invalid:3333/prefix']);
  assert.equal(await selectServerUrl('host.invalid',probe),'http://host.invalid:443');
  const before=calls.length; assert.equal(await selectServerUrl('http://host.invalid:3333/prefix',probe),'http://host.invalid:3333/prefix'); assert.equal(calls.length,before);
  let fallback=0; await assert.rejects(selectServerUrl('host.invalid',async()=>{fallback++;return {ok:false,code:'certificate_untrusted'};}),/证书/); assert.equal(fallback,1);
  await assert.rejects(selectServerUrl('host.invalid',async()=>({ok:false,code:'timeout'})),/无法确认/);
});
test('viewer movie switching follows actual server permission matrix without granting REST playlist ownership', () => {
  assert(!canRoomAction(null,'manageMovie','user',false,false)); assert(canRoomAction({manageMovie:{user:true}},'manageMovie','user',false,false)); assert(!canRoomAction({manageMovie:{admin:false}},'manageMovie','admin',false,false)); assert(canRoomAction(null,'manageMovie','user',false,true)); assert(!canRoomAction({manageMovie:{moderator:false}},'manageMovie','user',false,true)); assert(canRoomAction(null,'manageMovie','guest',true,false));
});
import { socketEndpoint } from '../src/lib/socketEndpoint.ts';
test('server path prefix belongs to Socket.IO transport path rather than a foreign namespace', () => {
  assert.deepEqual(socketEndpoint('https://host.invalid/media/prefix'), { origin:'https://host.invalid',path:'/media/prefix/socket.io' });
  assert.deepEqual(socketEndpoint('http://host.invalid:3333/'), { origin:'http://host.invalid:3333',path:'/socket.io' });
});
