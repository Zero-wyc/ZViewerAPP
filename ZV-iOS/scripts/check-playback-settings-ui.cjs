// Runs against an isolated database and an exported RN Web app. No native media claim.
const { createRequire } = require('node:module');
const { resolve, extname } = require('node:path');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sourceRoot = resolve(process.env.ZVIEWER_SOURCE_ROOT || resolve(__dirname, '../../../ZViewer-source code'));
const { chromium } = createRequire(resolve(sourceRoot, 'package.json'))('playwright');
const root = resolve(__dirname, '..');
const output = resolve(root, '.expo/b16-settings-validation'); mkdirSync(output, { recursive: true });
const webRoot = resolve(root, '.expo-export-test/b16-web');
const port = 17343, webPort = 17347;
const backend = `http://127.0.0.1:${port}`;
const report = { scope: 'RN Web UI with isolated local backend; iOS VLC/rotation require device validation', checks: [], errors: [] };
const check = (name, result = true) => { assert.ok(result, name); report.checks.push(name); };
const server = createServer((req, res) => {
  let route = decodeURIComponent(req.url.split('?')[0]);
  if (route.startsWith('/room/') && !route.endsWith('.html')) route = '/room/[roomId].html';
  if (route === '/') route = '/index.html';
  const file = resolve(webRoot, '.' + route);
  if (!file.startsWith(webRoot)) { res.writeHead(403).end(); return; }
  try { const body = readFileSync(file); const types = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' }; res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(body); }
  catch { res.writeHead(404).end(); }
});
let browser, roomId, token, child; const logs = [];
(async () => {
  try {
    child = spawn(process.execPath, [resolve(sourceRoot, 'backend/dist/index.js')], { cwd: output, windowsHide: true, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', RTMP_PORT: '17344', HTTP_FLV_PORT: '17345', PROJECT_ROOT: output, CONFIG_DIR: resolve(output, 'config'), DATABASE_URL: resolve(output, 'config/isolated.sqlite'), UPLOADS_DIR: resolve(output, 'uploads'), AVATARS_DIR: resolve(output, 'avatars'), MEDIA_DIR: resolve(output, 'media'), NODE_ENV: 'test' } });
    child.stdout.on('data', data => logs.push(String(data))); child.stderr.on('data', data => logs.push(String(data)));
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) { try { const response = await fetch(backend + '/health'); if (response.ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 250)); }
    assert.ok(ready, 'isolated backend started');
    await new Promise(r => server.listen(webPort, '127.0.0.1', r));
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true }); page.setDefaultTimeout(10000); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(`http://127.0.0.1:${webPort}`);
    await page.getByPlaceholder('https://example.com').fill(`http://zviewer.localtest:${port}`); await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('● 在线', { exact: true }).waitFor();
    await page.getByRole('button', { name: '创建房间', exact: true }).click(); await page.getByPlaceholder('可留空').first().fill('iOS b16 settings check'); await page.getByRole('button', { name: '确认创建', exact: true }).click();
    await page.getByText('等待房主选择影片', { exact: true }).waitFor(); roomId = new URL(page.url()).pathname.split('/').at(-1);
    check('watch room opens without standalone subtitle management button', await page.getByRole('button', { name: '字幕管理', exact: true }).count() === 0);
    for (const [w, h] of [[1180, 820], [820, 1180], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.getByRole('button', { name: '设置', exact: true }).click();
      const dialog = page.getByTestId('dialog-播放设置'); await dialog.waitFor();
      await dialog.getByRole('button', { name: '字幕', exact: true }).click();
      await page.waitForTimeout(100); check(`subtitle tab is selected at ${w}x${h}`, (await dialog.getByRole('button', { name: '字幕', exact: true }).innerText()).includes('✓'));
      await dialog.getByRole('button', { name: '导入 / 同步字幕', exact: true }).click();
      await dialog.getByRole('button', { name: '选择字幕文件（SRT / ASS / VTT / SMI / SUB）', exact: true }).waitFor();
      await page.screenshot({ path: resolve(output, `subtitles-${w}x${h}.png`) });
      check(`subtitle management is reachable inside playback settings at ${w}x${h}`);
      await dialog.getByRole('button', { name: '播放', exact: true }).click();
      await dialog.getByRole('button', { name: '1.25×', exact: true }).click();
      await page.waitForTimeout(100); check(`rate selection updates immediately at ${w}x${h}`, (await dialog.getByRole('button', { name: '1.25×', exact: true }).innerText()).includes('✓'));
      await dialog.getByRole('button', { name: '弹幕', exact: true }).click(); await dialog.getByRole('button', { name: '弹幕设置', exact: true }).click();
      await dialog.getByText('随屏幕缩放', { exact: true }).waitFor(); await page.screenshot({ path: resolve(output, `danmaku-${w}x${h}.png`) });
      const box = await dialog.boundingBox(); check(`settings stay within ${w}x${h}`, box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1 && box.y + box.height <= h + 1);
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    }
    await page.getByRole('button', { name: '全屏', exact: true }).click(); await page.getByRole('button', { name: '设置', exact: true }).click();
    const finalDialog = page.getByTestId('dialog-播放设置');
    await finalDialog.getByRole('button', { name: '字幕', exact: true }).click(); check('subtitle management remains accessible in fullscreen');
    await finalDialog.getByRole('button', { name: '导入 / 同步字幕', exact: true }).click();
    const importSubtitle = async () => {
      const chooser = page.waitForEvent('filechooser');
      await finalDialog.getByRole('button', { name: '选择字幕文件（SRT / ASS / VTT / SMI / SUB）', exact: true }).click();
      await (await chooser).setFiles({ name: 'sync.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:00,000 --> 00:00:10,000\nSYNC-ONLY-CUE\n') });
      await finalDialog.getByText('✓ sync.srt', { exact: true }).waitFor();
    };
    await importSubtitle(); await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.getByText('SYNC-ONLY-CUE', { exact: true }).waitFor(); check('imported synchronized subtitle renders once', await page.getByText('SYNC-ONLY-CUE', { exact: true }).count() === 1);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await finalDialog.getByPlaceholder('外部 SRT / ASS / VTT 字幕地址').fill('/api/subtitles/local-fixture.ass'); await finalDialog.getByRole('button', { name: '加载字幕', exact: true }).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    await page.getByText('SYNC-ONLY-CUE', { exact: true }).waitFor({ state: 'hidden' }); check('selecting native external subtitle clears the synchronized overlay');
    await page.getByRole('button', { name: '设置', exact: true }).click(); await importSubtitle();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click(); await page.getByText('SYNC-ONLY-CUE', { exact: true }).waitFor(); check('switching back to synchronized subtitles clears native external selection');
    check('no JS page errors', report.errors.length === 0);
  } finally {
    if (browser) await browser.close();
    if (roomId) { try { const login = await (await fetch(backend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'root', password: 'root' }) })).json(); token = login.accessToken; await fetch(backend + '/api/rooms/' + roomId, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); } catch {} }
    await new Promise(r => server.close(r)); if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2)); writeFileSync(resolve(output, 'backend.log'), logs.join(''));
  }
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exitCode = 1; });
