// Exercise the real React Native presentation and isolated server protocol.
// Cover/lyrics are fixtures. These checks do not claim VLC/device playback acceptance.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync, readFileSync } = require('node:fs');
const { strict: assert } = require('node:assert');
const dependency = createRequire(resolve(__dirname, '../../../ZViewer-source code/package.json'));
const { chromium } = dependency('playwright');
const output = resolve(process.env.IOS_TEST_OUTPUT || resolve(__dirname, '../../../local-ios-validation/ios-150-b15-music'));
const report = { scope: 'Exported RN Web layout; fixture artwork and lyrics; actual isolated v4.2.1 queue', checks: [], errors: [] };
const check = (name, result) => { assert.ok(result, name); report.checks.push(name); };
(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }); page.setDefaultTimeout(10000);
  let roomId, headers;
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    const art = 'data:image/jpeg;base64,' + readFileSync(resolve(__dirname, '../assets/images/mobile-wallpaper.jpg')).toString('base64');
    await page.route('**/api/music/ncm/cloudsearch?*', route => route.fulfill({ json: { code: 200, result: { songs: [{ id: 123456789, name: '播放界面对齐 · 测试曲目', ar: [{ name: '测试歌手' }], al: { name: '测试专辑', picUrl: art }, dt: 180000, fee: 0 }] } } }));
    await page.route('**/api/music/ncm/lyric?*', route => route.fulfill({ json: { code: 200, lrc: { lyric: Array.from({ length: 80 }, (_, i) => `[${String(Math.floor(i * 3 / 60)).padStart(2, '0')}:${String(i * 3 % 60).padStart(2, '0')}.00]第 ${i + 1} 行歌词 · 独立滚动与播放跟随`).join('\n') } } }));
    await page.goto('http://127.0.0.1:7347');
    await page.getByPlaceholder('https://example.com', { exact: true }).fill('http://zviewer.localtest:7343');
    await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('● 在线', { exact: true }).waitFor();
    await page.getByRole('button', { name: '创建房间', exact: true }).click(); await page.getByPlaceholder('可留空').first().fill('Music player layout regression');
    await page.getByRole('button', { name: '确认创建', exact: true }).click(); await page.getByText('等待房主选择影片', { exact: true }).waitFor();
    roomId = new URL(page.url()).pathname.split('/').at(-1);
    const login = await (await fetch('http://127.0.0.1:7343/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root' }) })).json();
    headers = { Authorization: `Bearer ${login.accessToken}` };
    await page.getByRole('button', { name: '房间设置', exact: true }).click(); await page.getByTestId('dialog-房间').getByRole('button', { name: '一起听', exact: true }).click(); await page.getByTestId('dialog-房间').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '打开完整音乐播放器', exact: true }).click();
    check('empty queue shows usable card without blank lyric panel', await page.getByText('还没有歌曲', { exact: true }).isVisible() && await page.getByTestId('player-lyrics-panel').count() === 0);
    await page.getByRole('button', { name: '收起 / 关闭', exact: true }).click();
    await page.getByRole('button', { name: '搜索', exact: true }).click(); await page.getByPlaceholder('歌曲 / 歌手').fill('fixture');
    await page.getByRole('button', { name: '搜索歌曲', exact: true }).click();
    const result = page.getByText('播放界面对齐 · 测试曲目', { exact: true }); await result.waitFor();
    await result.locator('..').locator('..').getByRole('button', { name: '播放', exact: true }).click();
    await page.getByRole('button', { name: '打开完整音乐播放器', exact: true }).click();
    await page.getByRole('button', { name: '跳转歌词：第 1 行歌词 · 独立滚动与播放跟随', exact: true }).waitFor();
    const root = page.getByTestId('expanded-music-player');
    for (const [w, h] of [[1180,820], [820,1180], [970,1390], [390,844], [844,390], [320,568]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(350);
      const cover = await page.getByTestId('player-album-cover').boundingBox(); const card = await page.getByTestId('player-card').boundingBox(); const tools = await page.getByTestId('player-tool-strip').boundingBox();
      check(`square bounded artwork ${w}x${h}`, cover && Math.abs(cover.width - cover.height) < 1 && cover.height <= h * .4 && cover.x >= 0 && cover.y >= 0);
      check(`card and tool strip within ${w}x${h}`, card && tools && card.y + card.height <= h + 1 && tools.y + tools.height <= h + 1 && tools.x + tools.width <= w + 1);
      const pause = await root.getByRole('button', { name: '暂停', exact: true }).boundingBox(); const close = await root.getByRole('button', { name: '收起 / 关闭', exact: true }).boundingBox();
      check(`transport and close remain reachable ${w}x${h}`, pause && close && pause.y >= 0 && pause.y + pause.height <= h + 1 && close.y + close.height <= h + 1);
      const lyric = await page.getByTestId('player-lyrics-panel').count() ? await page.getByTestId('player-lyrics-panel').boundingBox() : null;
      if (w < 768 && h >= w) {
        check(`phone defaults to card ${w}x${h}`, !lyric);
        await root.getByRole('button', { name: '显示歌词', exact: true }).click();
        check(`phone switches to full lyric area ${w}x${h}`, await page.getByTestId('player-lyrics-panel').isVisible() && await page.getByTestId('player-card').count() === 0);
        await root.getByRole('button', { name: '显示播放卡', exact: true }).click();
      } else check(`tablet/landscape two columns ${w}x${h}`, lyric && lyric.x >= card.x + card.width && lyric.height > 200);
      await page.screenshot({ path: resolve(output, `expanded-music-${w}x${h}.png`) });
    }
    await page.setViewportSize({ width: 1180, height: 820 }); await page.waitForTimeout(200);
    const firstTone = await page.getByTestId('player-card').evaluate(el => getComputedStyle(el).backgroundColor);
    await root.getByRole('button', { name: '切换播放器明暗', exact: true }).click();
    check('player tone changes without losing track or queue', await page.getByTestId('player-card').evaluate(el => getComputedStyle(el).backgroundColor) !== firstTone && await root.getByText('播放界面对齐 · 测试曲目', { exact: true }).isVisible());
    await page.screenshot({ path: resolve(output, 'expanded-music-dark.png') });
    await root.getByRole('button', { name: '音乐设置', exact: true }).click(); await page.getByTestId('dialog-音乐设置').getByRole('button', { name: '单曲循环', exact: true }).click();
    await page.getByTestId('dialog-音乐设置').getByRole('button', { name: '关闭', exact: true }).click();
    check('settings preserve player and mode reflects real room state', await root.getByRole('button', { name: '播放模式：单曲循环', exact: true }).isVisible());
    check('all lyrics are available instead of a seven-line slice', await page.getByRole('button', { name: /^跳转歌词：/ }).count() === 80);
    check('no runtime JS errors', report.errors.length === 0);
  } catch (error) { report.failed = error.message; await page.screenshot({ path: resolve(output, 'music-failure.png') }); throw error; }
  finally { if (roomId && headers) await fetch(`http://127.0.0.1:7343/api/rooms/${roomId}`, { method: 'DELETE', headers }).catch(() => {}); await browser.close(); writeFileSync(resolve(output, 'music-player-ui.json'), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ passed: report.checks.length, errors: report.errors.length }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
