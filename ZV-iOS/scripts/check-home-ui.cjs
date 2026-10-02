const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const dependency = createRequire(resolve(__dirname, '../../../ZViewer-source code/package.json'));
const { chromium } = dependency('playwright');
const output = resolve(process.env.IOS_TEST_OUTPUT || resolve(__dirname, '../../../local-ios-validation/ios-150-b14'));
const checks = [], errors = [];
(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--host-resolver-rules=MAP zviewer.localtest 127.0.0.1', '--no-proxy-server'] });
  const page = await browser.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message));
  const check = (name, result) => { assert.ok(result, name); checks.push(name); };
  try {
    for (const [width, height] of [[390, 844], [844, 390], [820, 1180], [1180, 820], [1390, 970], [320, 568]]) {
      await page.setViewportSize({ width, height }); await page.goto('http://127.0.0.1:7347');
      const submit = page.getByRole('button', { name: '登录并选择房间', exact: true }); await submit.waitFor();
      await assert.doesNotReject(() => submit.isEnabled().then(value => assert(value)));
      const appearance = await page.getByRole('button', { name: '全局外观', exact: true }).boundingBox();
      const heading = await page.getByText('连接服务器', { exact: true }).boundingBox();
      check(`home content and intrinsic appearance button ${width}x${height}`, appearance.height >= 44 && appearance.height < 80 && heading.y > appearance.y && heading.y < height - 80);
      await page.getByRole('button', { name: '游客进入', exact: true }).click();
      check(`guest form ${width}x${height}`, await page.getByRole('button', { name: '游客登录', exact: true }).isVisible() && await page.getByPlaceholder('密码', { exact: true }).count() === 0);
      await page.getByRole('button', { name: '账号登录', exact: true }).click();
      await page.screenshot({ path: resolve(output, `home-${width}x${height}.png`) });
    }
    check('Bilibili account entry has a visible text label', await page.getByRole('button', { name: 'B站账号', exact: true }).innerText() === 'B站账号');
    for (const mode of ['light', 'dark']) for (const background of ['black', 'white']) {
      await page.evaluate(({ mode, background }) => localStorage.setItem('zviewer-appearance-v1', JSON.stringify({ mode, opacity: 0.2, overlay: background === 'black' ? 1 : 0, whiteOverlay: background === 'white' ? 1 : 0 })), { mode, background });
      await page.reload(); await page.getByTestId('connection-help').waitFor();
      for (const id of ['connection-heading', 'connection-help']) {
        const contrast = await page.getByTestId(id).evaluate((element, background) => {
          const values = value => value.match(/[\d.]+/g).map(Number);
          const foreground = values(getComputedStyle(element.lastElementChild).color);
          const surface = values(getComputedStyle(element).backgroundColor);
          const composite = surface.slice(0, 3).map(value => value * surface[3] + (background === 'black' ? 0 : 255) * (1 - surface[3]));
          const luminance = color => color.slice(0, 3).map(value => { value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
          const a = luminance(foreground), b = luminance(composite);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }, background);
        check(`${id} contrast >= 4.5 with ${mode}/${background}/low opacity`, contrast >= 4.5);
      }
    }
    await page.evaluate(() => localStorage.removeItem('zviewer-appearance-v1')); await page.reload();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: '全局外观', exact: true }).click();
    await page.getByRole('button', { name: '浅色', exact: true }).click(); await page.getByTestId('dialog-外观设置').getByRole('button', { name: '关闭', exact: true }).click(); await page.reload();
    check('light theme survives reload without losing login form', await page.getByText('连接服务器', { exact: true }).isVisible());
    await page.getByRole('button', { name: '全局外观', exact: true }).click();
    await page.getByRole('button', { name: '深色', exact: true }).click(); await page.getByTestId('dialog-外观设置').getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByPlaceholder('https://example.com', { exact: true }).fill('http://zviewer.localtest:7343');
    await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('wrong-test-password');
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click();
    await page.getByText(/密码错误|用户名或密码/).waitFor();
    check('wrong password keeps retry enabled', await page.getByRole('button', { name: '登录并选择房间', exact: true }).isEnabled());
    await page.getByPlaceholder('密码', { exact: true }).fill('root'); await page.getByRole('button', { name: '登录并选择房间', exact: true }).click();
    await page.getByText('● 在线', { exact: true }).waitFor(); check('official v4.2.1 account login + room list', true);
    await page.getByRole('button', { name: '退出登录 / 更换服务器', exact: true }).click();
    await page.getByPlaceholder('https://example.com', { exact: true }).waitFor(); await page.getByPlaceholder('https://example.com', { exact: true }).fill('');
    check('saved server can be fully cleared after logout', await page.getByPlaceholder('https://example.com', { exact: true }).inputValue() === '');
    await page.getByRole('button', { name: '游客进入', exact: true }).click(); await page.getByPlaceholder('https://example.com', { exact: true }).fill('http://zviewer.localtest:7343');
    await page.getByRole('button', { name: '游客登录', exact: true }).click(); await page.getByText('● 在线', { exact: true }).waitFor();
    check('official guest login omits room creation', await page.getByRole('button', { name: '创建房间', exact: true }).count() === 0);
    await page.getByRole('button', { name: '退出登录 / 更换服务器', exact: true }).click();
    await page.getByRole('button', { name: '账号登录', exact: true }).click();
    await page.getByPlaceholder('用户名', { exact: true }).fill('root'); await page.getByPlaceholder('密码', { exact: true }).fill('root');
    await page.route('**/api/auth/login', () => new Promise(() => {}));
    await page.getByRole('button', { name: '登录并选择房间', exact: true }).click(); await page.getByText('请求超时，请检查网络后重试', { exact: true }).waitFor();
    check('a stalled login times out and releases form interaction', await page.getByRole('button', { name: '登录并选择房间', exact: true }).isEnabled() && await page.getByPlaceholder('密码', { exact: true }).isEditable());
    await page.evaluate(() => localStorage.setItem('zviewer-appearance-v1', JSON.stringify({ radius: null, opacity: 'invalid', scale: null, mode: 'invalid' })));
    await page.reload(); await page.getByRole('button', { name: '全局外观', exact: true }).click(); await page.getByText('圆角 · 16', { exact: true }).waitFor();
    check('corrupt saved appearance falls back without a render error', true);
    check('no unhandled JavaScript errors', errors.length === 0);
  } finally {
    writeFileSync(resolve(output, 'home-ui.json'), JSON.stringify({ scope: 'Expo Web with isolated official v4.2.1; not native device acceptance', checks, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
