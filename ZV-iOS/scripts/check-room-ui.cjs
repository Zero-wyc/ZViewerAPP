// UI + actual v4.2.0 protocol validation. Only the isolated local server is used.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const { strict: assert } = require('node:assert');
const dependency = createRequire(resolve(__dirname, '../../../ZViewer-source-code/package.json'));
const { chromium } = dependency('playwright');
const { io } = dependency('socket.io-client');
const output = resolve(__dirname, '../../../local-ios-validation');
const backend = 'http://127.0.0.1:7333';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } }); const page = await context.newPage(); const errors = []; let viewer;
  page.on('pageerror', error => errors.push(error.message)); const report = { scope: 'Expo web UI + unmodified local v4.2.0; not device media acceptance', checks: [], errors };
  const check = (name, value = true) => { assert.ok(value, name); report.checks.push(name); };
  try {
    await page.goto('http://127.0.0.1:7337');
    await page.getByPlaceholder('https://example.com').fill('http://zviewer.localtest:7333'); await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('● 在线', { exact: true }).waitFor(); check('local account login + Socket connection');
    await page.getByRole('button', { name: '创建房间', exact: true }).click(); await page.getByPlaceholder('可留空').first().fill('iOS candidate UI check'); await page.getByRole('button', { name: '确认创建', exact: true }).click();
    await page.getByText('等待房主选择影片', { exact: true }).waitFor(); check('create room + restore host'); const roomId = new URL(page.url()).pathname.split('/').at(-1);
    const login = await (await fetch(backend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root' }) })).json(); const headers = { Authorization: `Bearer ${login.accessToken}`, 'Content-Type': 'application/json' };
    await page.getByText('片单', { exact: true }).click(); await page.getByRole('button', { name: '添加影片', exact: true }).click();
    await page.getByPlaceholder('影片名称').fill('UI direct source'); await page.getByPlaceholder('MP4 / MKV / HLS / FLV 等 HTTP(S) 媒体地址').fill('https://example.invalid/sample.mp4'); await page.getByRole('button', { name: '添加到片单', exact: true }).click(); await page.getByText('UI direct source', { exact: true }).waitFor();
    const movies = await (await fetch(`${backend}/api/rooms/${roomId}/movies`, { headers })).json(); check('add movie through UI persists canonical source', movies.movies.some(item => item.title === 'UI direct source' && !item.url.includes('token=')));
    await page.getByRole('button', { name: '添加影片', exact: true }).click(); await page.getByRole('button', { name: '服务器文件与我的挂载', exact: true }).click();
    // Mount display names are configured locally; identify the root without logging paths.
    const roots = await (await fetch(backend + '/api/server-files/roots', { headers })).json(); const root = roots.roots.find(item => item.absPath.replaceAll('\\', '/').toLowerCase() === 'c:/users/fredq/videos');
    await page.getByRole('button', { name: root.name, exact: true }).click(); await page.getByRole('button', { name: '▶ S01E04.mp4', exact: true }).click(); await page.getByText('S01E04.mp4', { exact: true }).waitFor(); check('browse local server mount + resolve file + add movie');
    const guest = await (await fetch(backend + '/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    viewer = io(backend, { transports: ['websocket'], auth: { token: guest.accessToken }, reconnection: false });
    await new Promise((resolve, reject) => { viewer.once('connect', resolve); viewer.once('connect_error', reject); });
    await new Promise((resolve, reject) => viewer.timeout(10000).emit('request-join', { roomId }, (failure, data) => failure || !data?.success ? reject(new Error('Local guest join failed')) : resolve(data)));
    await page.getByText('房间', { exact: true }).click(); await page.getByText(guest.user.username + ' · viewer', { exact: true }).waitFor(); check('member join follows server viewer-joined event');
    viewer.disconnect(); await page.getByText(guest.user.username + ' · viewer', { exact: true }).waitFor({ state: 'hidden' }); check('member leave follows server viewer-left event');
    await page.getByPlaceholder('房间名称').fill('Updated iOS room'); await page.getByRole('button', { name: '保存名称', exact: true }).click(); await page.getByText('Updated iOS room', { exact: true }).filter({ visible: true }).first().waitFor(); check('rename room follows actual server protocol');
    await page.getByRole('button', { name: '一起听', exact: true }).click(); await page.getByPlaceholder('歌曲 / 歌手').waitFor(); check('listen mode mounts queue + lyrics UI');
    await page.route('**/api/music/ncm/cloudsearch?*', route => route.fulfill({ json: { code: 200, result: { songs: [{ id: 123456789, name: 'Fixture music item', ar: [{ name: 'Local fixture' }], al: { name: 'Local fixture', picUrl: '' }, dt: 90000, fee: 0 }] } } }));
    await page.getByPlaceholder('歌曲 / 歌手').fill('fixture'); await page.getByRole('button', { name: '搜索', exact: true }).click(); await page.getByRole('button', { name: '添加到队列', exact: true }).click(); await page.getByText('播放队列 · 1', { exact: true }).waitFor(); check('fixture NCM result + real server music queue upsert/broadcast');
    await page.getByRole('button', { name: '移除', exact: true }).click(); await page.getByText('播放队列 · 0', { exact: true }).waitFor(); check('real server music queue remove/broadcast');
    await page.getByRole('button', { name: '屏幕共享', exact: true }).click(); await page.getByText('共享观看需要原生安装包', { exact: true }).waitFor(); check('screen sharing missing-module preview remains usable');
    await page.getByRole('button', { name: '同步观影', exact: true }).click(); await page.getByText('等待房主选择影片', { exact: true }).waitFor();
    await page.getByText('片单', { exact: true }).click();
    mkdirSync(output, { recursive: true });
    for (const [name, width, height] of [['ipad-landscape', 1180, 820], ['ipad-portrait', 820, 1180], ['iphone', 390, 844]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(700); await page.screenshot({ path: resolve(output, `ios-ui-${name}.png`) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2); check(`${name} has no horizontal page overflow`, !overflow);
    }
    await page.getByText('‹ 返回', { exact: true }).click(); await page.getByRole('button', { name: '退出登录 / 更换服务器', exact: true }).waitFor(); check('leave room returns to lobby');
    await fetch(`${backend}/api/rooms/${roomId}`, { method: 'DELETE', headers }); check('no JS runtime exceptions', errors.length === 0);
  } catch (failure) { report.failed = failure.message.replace(/https?:\/\/\S+/g, '[url]'); await page.screenshot({ path: resolve(output, 'ios-ui-failure.png') }); throw failure; }
  finally { viewer?.disconnect(); await browser.close(); writeFileSync(resolve(output, 'ios-ui-results.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.checks.length, errors: errors.length }));
})().catch(error => { console.error(error.message.replace(/https?:\/\/\S+/g, '[url]')); process.exitCode = 1; });
