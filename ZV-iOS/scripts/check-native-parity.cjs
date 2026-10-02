// Native UI exported to Web: isolated official server, synthetic upstream
// sources only. This verifies interaction/layout, never device playback.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = createRequire(resolve(__dirname, '../../../ZViewer-source code/package.json'))('playwright');
const output = resolve(process.env.IOS_TEST_OUTPUT || resolve(__dirname, '../../../local-ios-validation/ios-150-b15'));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } }); const checks = [], errors = []; page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message)); const check = (name, result = true) => { assert.ok(result, name); checks.push(name); };
  let roomId; const backend = 'http://127.0.0.1:7343'; let headers;
  try {
    await page.goto('http://127.0.0.1:7347');
    const wallpaper = page.locator('img').first(); await wallpaper.waitFor();
    check('bundled shared default wallpaper loads', await wallpaper.evaluate(el => el.complete && el.naturalWidth > 100));
    await page.getByPlaceholder('https://example.com', { exact: true }).fill('http://zviewer.localtest:7343');
    await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.getByRole('button', { name: '显示密码', exact: true }).click(); check('password visibility control follows other mobile clients', await page.getByPlaceholder('密码', { exact: true }).getAttribute('type') !== 'password');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('选择房间', { exact: true }).waitFor();
    check('lobby toolbar and count heading', await page.getByText('在线放映室', { exact: true }).isVisible());
    await page.getByRole('button', { name: '创建房间', exact: true }).click();
    check('create dialog supports capacity and approval', await page.getByLabel('人数上限').isVisible() && await page.getByText('入房需要批准', { exact: true }).isVisible());
    await page.getByRole('button', { name: '确认创建', exact: true }).click(); await page.getByText('等待房主选择影片', { exact: true }).waitFor(); roomId = new URL(page.url()).pathname.split('/').at(-1);
    const auth = await (await fetch(backend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root' }) })).json(); headers = { Authorization: `Bearer ${auth.accessToken}`, 'Content-Type': 'application/json' };
    const sources = Array.from({ length: 60 }, (_, index) => ({ id: `source-${index}`, name: `数据源 ${index + 1}` }));
    const episodes = Array.from({ length: 80 }, (_, index) => ({ id: `ep-${index}`, title: `第 ${index + 1} 集`, episodeNumber: index + 1, playbackParams: { id: `ep-${index}` } }));
    await page.route('**/api/stream/anisubs/sources', route => route.fulfill({ json: { success: true, sources } }));
    await page.route('**/api/stream/anisubs/search?*', route => route.fulfill({ json: { success: true, results: [{ id: 'show-1', title: '测试番剧' }, { id: 'show-2', title: '第二部番剧' }] } }));
    await page.route('**/api/stream/anisubs/episodes?*', route => route.fulfill({ json: { success: true, episodes } }));
    await page.getByText('片单', { exact: true }).click(); await page.getByRole('button', { name: '添加影片', exact: true }).click();
    await page.getByRole('button', { name: '影片来源', exact: true }).click(); await page.getByRole('button', { name: 'ani-subs 番剧源', exact: true }).click();
    await page.getByText('60 个数据源可用', { exact: true }).waitFor();
    check('source sections replace the all-in-one page', await page.getByPlaceholder('影片名称').count() === 0 && await page.getByPlaceholder('B站视频链接 / BV 号（可附分 P）').count() === 0);
    await page.getByRole('button', { name: '番剧数据源', exact: true }).click();
    const options = page.getByTestId('anime-source-options'); const bounds = await options.boundingBox();
    check('60 sources use a bounded dropdown', bounds.height <= 201);
    await options.evaluate(el => { el.scrollTop = el.scrollHeight; }); await page.getByRole('button', { name: '数据源 60', exact: true }).click();
    check('dropdown scrolls to its last source and closes', await options.count() === 0);
    await page.getByPlaceholder('搜索番剧名称').fill('测试'); await page.getByRole('button', { name: '搜索番剧', exact: true }).click();
    await page.getByRole('button', { name: '展开选集 · 测试番剧', exact: true }).click(); await page.getByText('共 80 集', { exact: true }).waitFor();
    const grid = page.getByTestId('episode-grid');
    check('80 episodes stay grouped in a 200px scroller', (await grid.boundingBox()).height <= 201);
    const first = await page.getByRole('button', { name: '添加 第 1 集', exact: true }).boundingBox(); const second = await page.getByRole('button', { name: '添加 第 2 集', exact: true }).boundingBox();
    check('tablet episodes use two columns', Math.abs(first.y - second.y) < 2 && second.x > first.x);
    await page.getByRole('button', { name: '添加 第 1 集', exact: true }).click(); await page.getByText('已添加 1 集', { exact: true }).waitFor();
    check('single episode adds without dismissing selection', await page.getByTestId('source-picker').isVisible());
    let failOnce = true;
    await page.route(`**/api/rooms/${roomId}/movies`, route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.sourceMeta?.episode?.id === 'ep-1' && failOnce) { failOnce = false; return route.fulfill({ status: 500, json: { success: false, message: 'Isolated retry fixture' } }); }
      return route.continue();
    });
    await page.getByRole('button', { name: '多选', exact: true }).click();
    await page.getByRole('checkbox', { name: '第 2 集', exact: true }).click(); await page.getByRole('checkbox', { name: '第 3 集', exact: true }).click();
    await page.getByRole('button', { name: '添加所选', exact: true }).click(); await page.getByText('1 集添加失败，保留选择，可重试', { exact: true }).waitFor();
    check('bulk partial failure retains only failed episode', await page.getByRole('checkbox', { name: '第 2 集', exact: true }).getAttribute('aria-checked') === 'true' && await page.getByRole('checkbox', { name: '第 3 集', exact: true }).getAttribute('aria-checked') === 'false');
    await page.getByRole('button', { name: '添加所选', exact: true }).click(); await page.getByText('已选 0 集', { exact: true }).waitFor();
    check('failed episode retry succeeds against real server');
    for (const [width, height] of [[1180, 820], [820, 1180], [390, 844], [844, 390]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(200);
      const dialog = await page.getByTestId('source-picker').boundingBox(); const ep = await grid.boundingBox();
      check(`selection dialog and nested episode scroller fit ${width}x${height}`, dialog.x >= 0 && dialog.y >= 0 && dialog.x + dialog.width <= width + 1 && dialog.y + dialog.height <= height + 1 && ep.height <= 201);
      await page.screenshot({ path: resolve(output, `parity-source-${width}x${height}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const a = await page.getByRole('checkbox', { name: '第 1 集', exact: true }).boundingBox(); const b = await page.getByRole('checkbox', { name: '第 2 集', exact: true }).boundingBox();
    check('phone grid becomes one column', Math.abs(a.x - b.x) < 2 && b.y > a.y);
    await page.getByRole('button', { name: '全选', exact: true }).click(); await page.getByText('已选 80 集', { exact: true }).waitFor(); await page.getByRole('button', { name: '清空', exact: true }).click(); await page.getByText('已选 0 集', { exact: true }).waitFor();
    check('select all and clear use the complete episode group');
    await page.getByRole('button', { name: '完成', exact: true }).click(); await page.getByPlaceholder('搜索影片…').fill('第 3 集');
    check('compact playlist supports filtering', await page.getByText('测试番剧 · 第 3 集', { exact: true }).isVisible() && await page.getByText('测试番剧 · 第 1 集', { exact: true }).count() === 0);
    const movies = await (await fetch(`${backend}/api/rooms/${roomId}/movies`, { headers })).json();
    check('real playlist preserves selected data source metadata', movies.movies.length === 3 && movies.movies.every(movie => movie.sourceMeta?.sourceId === 'source-59'));
    check('no JavaScript runtime exceptions', errors.length === 0);
  } catch (failure) { await page.screenshot({ path: resolve(output, 'parity-failure.png') }); throw failure; }
  finally { if (roomId && headers) await fetch(`${backend}/api/rooms/${roomId}`, { method: 'DELETE', headers }); await browser.close(); writeFileSync(resolve(output, 'native-parity.json'), JSON.stringify({ scope: 'Expo Web native UI export; fixtures + isolated official v4.2.1; not native device acceptance', checks, errors }, null, 2)); }
  console.log(JSON.stringify({ passed: checks.length, errors: errors.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
