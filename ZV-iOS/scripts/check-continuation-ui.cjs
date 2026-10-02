// UI + official v4.2.1 protocol validation. Only the isolated local server is used.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const { strict: assert } = require('node:assert');
const dependency = createRequire(resolve(__dirname, '../../../ZViewer-source code/package.json'));
const { chromium } = dependency('playwright');
const { io } = dependency('socket.io-client');
const output = resolve(__dirname, '../../../local-ios-validation/ios-150-b13');
const backend = 'http://127.0.0.1:7343';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } }); const page = await context.newPage(); const errors = []; let viewer; page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message)); const report = { scope: 'Expo web UI + official isolated v4.2.1; not device media acceptance', checks: [], errors };
  const check = (name, value = true) => { assert.ok(value, name); report.checks.push(name); };
  try {
    await page.goto('http://127.0.0.1:7347');
    await page.getByPlaceholder('https://example.com').fill('http://zviewer.localtest:7343'); await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('● 在线', { exact: true }).waitFor(); check('local account login + Socket connection');
    await page.getByRole('button', { name: '创建房间', exact: true }).click(); await page.getByPlaceholder('可留空').first().fill('iOS candidate UI check'); await page.getByRole('button', { name: '确认创建', exact: true }).click();
    await page.getByText('等待房主选择影片', { exact: true }).waitFor(); check('create room + restore host'); const roomId = new URL(page.url()).pathname.split('/').at(-1);
    for (const mode of ['浅色', '深色']) {
      await page.getByRole('button', {name:'全局外观',exact:true}).click();
      await page.getByRole('button', {name:mode,exact:true}).click(); await page.waitForTimeout(400);
      await page.screenshot({path:resolve(output, `appearance-${mode === '浅色' ? 'light' : 'dark'}.png`)});
      await page.getByRole('button', {name:'完成',exact:true}).click();
      check(`${mode} appearance switches without leaving room`, await page.getByText('等待房主选择影片',{exact:true}).isVisible());
    }
    const login = await (await fetch(backend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root' }) })).json(); const headers = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' };
    await page.getByText('片单', { exact: true }).click(); await page.getByRole('button', { name: '添加影片', exact: true }).click();
    await page.getByPlaceholder('影片名称').fill('UI direct source'); await page.getByPlaceholder('MP4 / MKV / HLS / FLV 等 HTTP(S) 媒体地址').fill('https://example.invalid/sample.mp4'); await page.getByRole('button', { name: '添加到片单', exact: true }).click(); await page.getByText('UI direct source', { exact: true }).waitFor();
    const movies = await (await fetch(`${backend}/api/rooms/${roomId}/movies`, { headers })).json(); check('add movie through UI persists canonical source', movies.movies.some(item => item.title === 'UI direct source' && !item.url.includes('token=')));
    // Exercise the reported landscape entry and repeated dismissal/resizing.
    // Web verifies layout/lifecycle only; UIKit rotation still needs the unsigned device build.
    for (const [w,h] of [[1180,820],[820,1180],[390,844]]) {
      await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(200);
      if (await page.getByRole('button',{name:'展开侧栏',exact:true}).isVisible()) await page.getByRole('button',{name:'展开侧栏',exact:true}).click();
      for (let attempt=0;attempt<3;attempt++) {
        await page.getByRole('button',{name:'添加影片',exact:true}).click(); await page.getByTestId('source-picker').waitFor();
        await page.waitForTimeout(400); const box=await page.getByTestId('source-picker').boundingBox();
        assert.ok(box && Math.abs(box.width-w)<2 && Math.abs(box.height-h)<2, 'Source picker fills the current viewport');
        if (attempt===0) await page.screenshot({path:resolve(output,`ios-source-picker-${w}x${h}.png`)});
        await page.getByRole('button',{name:'完成',exact:true}).click(); await page.getByTestId('source-picker').waitFor({state:'hidden'});
      }
      check(`source picker opens/closes three times without layout changes at ${w}x${h}`);
    }
    await page.setViewportSize({width:1180,height:820});
    const guest = await (await fetch(backend + '/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    viewer = io(backend, { transports: ['websocket'], auth: { token: guest.accessToken }, reconnection: false });
    await new Promise((resolve, reject) => { viewer.once('connect', resolve); viewer.once('connect_error', reject); });
    await new Promise((resolve, reject) => viewer.timeout(10000).emit('request-join', { roomId }, (failure, data) => failure || !data?.success ? reject(new Error('Local guest join failed')) : resolve(data)));
    await page.getByText('房间', { exact: true }).click(); await page.getByText(guest.user.username + ' · viewer', { exact: true }).waitFor(); check('member join follows server viewer-joined event');
    viewer.disconnect(); await page.getByText(guest.user.username + ' · viewer', { exact: true }).waitFor({ state: 'hidden' }); check('member leave follows server viewer-left event');
    await page.getByPlaceholder('房间名称').fill('Updated iOS room'); await page.getByRole('button', { name: '保存名称', exact: true }).click(); await page.getByText('Updated iOS room', { exact: true }).filter({ visible: true }).first().waitFor(); check('rename room follows actual server protocol');
    const statusResponse = page.waitForResponse(response => response.url().endsWith('/api/music/login/status'));
    await page.getByRole('button', { name: '一起听', exact: true }).first().click(); await page.getByRole('button', { name: '网易云音乐', exact: true }).waitFor(); check('Android music navigation and floating player are present');
    const statusDto = await (await statusResponse).json(); assert.equal(statusDto.loggedIn, false); assert.equal(statusDto.success, undefined);
    for (let attempt=0; attempt<3; attempt++) { await page.getByRole('button',{name:'打开完整音乐播放器',exact:true}).click(); await page.getByRole('button',{name:'追加 / 更换视频',exact:true}).waitFor(); await page.getByRole('button',{name:'收起 / 关闭',exact:true}).click(); }
    check('empty music player opens/closes three times without update loops');
    await page.waitForTimeout(150); check('actual raw NCM status DTO shows logged-out gate without envelope error', await page.getByText('请先登录网易云音乐', {exact:true}).isVisible() && await page.getByText('服务器未返回成功结果', {exact:true}).count() === 0);
    await page.getByRole('button',{name:'哔哩哔哩',exact:true}).click(); await page.getByRole('button',{name:'网易云音乐',exact:true}).click();
    for (const [w,h] of [[1180,820],[820,1180],[390,844]]) {
      await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(200); await page.waitForTimeout(150);
      const anchor=await page.getByTestId('ncm-menu-anchor').boundingBox(); const menu=await page.getByTestId('ncm-menu').boundingBox();
      check(`NCM menu stays anchored below its button after resizing to ${w}x${h}`, anchor && menu && Math.abs(menu.x-anchor.x)<2 && Math.abs(menu.y-anchor.y-anchor.height-8)<2 && menu.x>=0 && menu.x+menu.width<=w+1);
      await page.screenshot({path:resolve(output,`ios-ncm-menu-${w}x${h}.png`)});
    }
    await page.getByText('我的音乐',{exact:true}).click(); await page.getByTestId('ncm-menu').waitFor({state:'hidden'}); await page.getByText('请先登录网易云音乐',{exact:true}).waitFor(); check('menu selection closes dropdown and switches music page');
    mkdirSync(output, { recursive: true });
    for (const [device,w,h] of [['ipad-landscape',1180,820],['ipad-portrait',820,1180],['iphone',390,844]]) {
      await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(200); await page.waitForTimeout(150);
      await page.screenshot({path:resolve(output,`ios-music-${device}.png`)});
      check(`music ${device} has no horizontal page overflow`, await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    }
    await page.setViewportSize({width:1180,height:820});
    // QR/upstream account data are fixtures; the initial status and logout above/below use the real local server.
    await page.route('**/api/music/ncm/login/qr/key', route => route.fulfill({json:{code:200,data:{unikey:'local-qr-fixture'}}}));
    await page.route('**/api/music/ncm/login/qr/create?*', route => route.fulfill({json:{code:200,data:{qrimg:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}}}));
    await page.route('**/api/music/ncm/login/qr/check?*', route => route.fulfill({json:{code:803}}));
    await page.route('**/api/music/login/status', route => route.fulfill({json:{loggedIn:true,nickname:'Local music account',vipStatus:0}}));
    await page.route('**/api/music/ncm/user/account', route => route.fulfill({json:{code:200,profile:{userId:123}}}));
    await page.route('**/api/music/ncm/user/playlist?*', route => route.fulfill({json:{code:200,playlist:[]}}));
    await page.getByRole('button',{name:'扫码登录',exact:true}).click(); await page.getByText('网易云登录成功',{exact:true}).waitFor();
    await page.getByRole('button',{name:'我的音乐',exact:true}).click(); await page.getByText('Local music account',{exact:true}).waitFor(); check('successful QR polling refreshes existing My Music page');
    await page.unroute('**/api/music/login/status'); await page.getByRole('button',{name:'退出网易云账号',exact:true}).click(); await page.getByText('请先登录网易云音乐',{exact:true}).waitFor(); check('real NCM logout returns to Android login gate');
    await page.getByRole('button', { name: '搜索', exact: true }).click(); await page.getByPlaceholder('歌曲 / 歌手').waitFor(); check('listen mode mounts music search UI');
    await page.route('**/api/music/ncm/cloudsearch?*', route => route.fulfill({ json: { code: 200, result: { songs: [{ id: 123456789, name: 'Fixture music item', ar: [{ name: 'Local fixture' }], al: { name: 'Local fixture', picUrl: '' }, dt: 90000, fee: 0 }] } } }));
    await page.getByPlaceholder('歌曲 / 歌手').fill('fixture'); await page.getByRole('button', { name: '搜索歌曲', exact: true }).click(); await page.getByRole('button', { name: '添加到队列', exact: true }).click(); await page.getByRole('button', { name: '队列', exact: true }).click(); await page.getByText('播放队列 · 1', { exact: true }).waitFor(); check('fixture NCM result + real server music queue upsert/broadcast');
    await page.getByText('Fixture music item · Local fixture', {exact:true}).locator('..').getByRole('button',{name:'播放',exact:true}).click();
    await page.getByRole('button',{name:'收起 / 关闭',exact:true}).click();
    await page.getByRole('button',{name:'打开完整音乐播放器',exact:true}).click();
    for (const [w,h] of [[1180,820],[820,1180],[390,844]]) {
      await page.setViewportSize({width:w,height:h}); await page.waitForTimeout(150);
      await page.getByRole('button',{name:'追加 / 更换视频',exact:true}).click();
      const close=page.getByRole('button',{name:'关闭',exact:true}); await close.waitFor(); await page.waitForTimeout(400);
      const input=await page.getByPlaceholder('B站视频链接 / BV 号',{exact:true}).boundingBox(); const button=await close.boundingBox();
      check(`music video picker stays in viewport at ${w}x${h}`, input && button && input.x>=0 && input.x+input.width<=w+1 && button.y>=0 && button.y+button.height<=h+1);
      await page.screenshot({path:resolve(output,`music-video-picker-${w}x${h}.png`)}); await close.click();
    }
    await page.route('**/api/music/ncm/comment/music?*', route=>route.fulfill({json:{code:200,total:1,comments:[{commentId:1,content:'Isolated UI comment fixture',user:{nickname:'Fixture user',avatarUrl:'https://example.invalid/avatar.jpg'},time:0,likedCount:1}]}}));
    await page.getByRole('button',{name:'歌曲评论',exact:true}).click(); await page.getByText('Isolated UI comment fixture',{exact:true}).waitFor();
    check('song comment modal renders fixture and failed-avatar placeholder'); await page.getByRole('button',{name:'关闭',exact:true}).filter({visible:true}).last().click();
    await page.getByRole('button',{name:'队列',exact:true}).click();
    await page.getByRole('button', { name: '移除', exact: true }).click(); await page.getByText('播放队列 · 0', { exact: true }).waitFor(); check('real server music queue remove/broadcast'); await page.getByRole('button', { name: '收起 / 关闭', exact: true }).click();
    await page.getByRole('button', { name: '投屏', exact: true }).click(); await page.getByText('共享观看需要原生安装包', { exact: true }).waitFor(); check('screen sharing missing-module preview remains usable');
    await page.getByRole('button', { name: '一起看', exact: true }).click(); await page.getByText('等待房主选择影片', { exact: true }).waitFor();
    const bounds = () => page.getByTestId('video-container').boundingBox();
    for (const [w,h] of [[1180,820],[820,1180],[390,844]]) {
      await page.setViewportSize({ width:w,height:h }); await page.getByRole('button', { name:'全屏',exact:true }).click();
      await page.waitForTimeout(150); await page.screenshot({path:resolve(output,`ios-fullscreen-${w}x${h}.png`)}); const box=await bounds();
      check(`fullscreen fills ${w}x${h} viewport`, box && Math.abs(box.x)<2 && Math.abs(box.y)<2 && Math.abs(box.width-w)<2 && Math.abs(box.height-h)<2);
      const slider = await page.getByLabel('播放进度').boundingBox(); check(`video controls remain within ${w}x${h}`, slider && slider.y >= 0 && slider.y+slider.height <= h+1);
      await page.getByRole('button', { name:'退出全屏',exact:true }).click(); await page.getByRole('button',{name:'房间设置',exact:true}).waitFor();
    }
    await page.setViewportSize({width:1180,height:820}); await page.getByRole('button',{name:'旋转并锁定',exact:true}).click();
    check('rotation does not toggle fullscreen',await page.getByRole('button',{name:'房间设置',exact:true}).isVisible());
    if (await page.getByRole('button',{name:'展开侧栏',exact:true}).isVisible()) await page.getByRole('button',{name:'展开侧栏',exact:true}).click(); await page.getByText('片单', { exact: true }).click();
    mkdirSync(output, { recursive: true });
    for (const [name, width, height] of [['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['iphone', 390, 844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(700); await page.screenshot({ path: resolve(output, `ios-ui-${name}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2); check(`${name} has no horizontal page overflow`, !overflow);
    }
    await page.getByText('‹ 返回', { exact: true }).click(); await page.getByRole('button', { name: '退出登录 / 更换服务器', exact: true }).waitFor(); check('leave room returns to lobby');
    await fetch(`${backend}/api/rooms/${roomId}`, { method: 'DELETE', headers }); check('no JS runtime exceptions', errors.length === 0);
  } catch (failure) { report.hitStack = await page.getByRole('button',{name:'歌曲评论',exact:true}).boundingBox().then(box => box ? page.evaluate(({x,y})=>document.elementsFromPoint(x,y).slice(0,6).map(el=>({tag:el.tagName,style:el.getAttribute('style'),label:el.getAttribute('aria-label'),text:el.textContent.slice(0,120)})),{x:box.x+box.width/2,y:box.y+box.height/2}) : null).catch(()=>null); report.failed = failure.message.replace(/https?:\/\/\S+/g, '[url]'); await page.screenshot({ path: resolve(output, 'ios-ui-failure.png') }); throw failure; }
  finally { viewer?.disconnect(); await browser.close(); writeFileSync(resolve(output, 'ios-ui-results.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.checks.length, errors: errors.length }));
})().catch(error => { console.error(error.message.replace(/https?:\/\/\S+/g, '[url]')); process.exitCode = 1; });
