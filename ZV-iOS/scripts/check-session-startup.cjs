// Runs the actual provider with React DOM and mocked native storage/socket APIs.
// This tests asynchronous session ownership, not Keychain/UIKit on a device.
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { writeFileSync, mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const dependency = createRequire(resolve(root, '../../ZViewer-source code/package.json'));
const { chromium } = dependency('playwright');
const { build } = dependency('esbuild');
const output = resolve(process.env.IOS_TEST_OUTPUT || resolve(root, '../../local-ios-validation/ios-150-b14'));
const checks = [], errors = [];
const stored = { serverUrl: 'http://zviewer.localtest:7343', accessToken: 'test-old-access', refreshToken: 'test-refresh', user: { id: 1, username: 'test-user', role: 'user' } };
const modules = {
  'react-native': `export const Platform={OS:'ios'}; export const AppState={addEventListener:()=>({remove(){}})};`,
  'expo-secure-store': `export async function getItemAsync(key) { if(window.__storageMode==='pending') return new Promise(()=>{}); if(window.__storageMode==='error') throw new Error('storage unavailable'); return window.__store[key] || null; } export async function setItemAsync(key,value) { window.__writes.push({key,value}); window.__store[key]=value; } export async function deleteItemAsync(key) { window.__writes.push({key,value:null}); delete window.__store[key]; }`,
  '@/lib/socket': `export function openSocket() { return {on(){},off(){},disconnect(){},connect(){},connected:false}; }`,
};
(async () => {
  mkdirSync(output, { recursive: true });
  await build({ stdin: { contents: `import React,{useEffect} from 'react'; import {createRoot} from 'react-dom/client'; import {SessionProvider,useSession} from './src/state/session'; function Probe(){const state=useSession();useEffect(()=>{window.__session=state},[state]);return null} createRoot(document.getElementById('root')).render(<SessionProvider><Probe/></SessionProvider>);`, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser', outfile: resolve(output, 'web-export/startup-harness.js'), plugins: [{ name: 'native-test-ports', setup(api) {
    api.onResolve({ filter: /^(react-native|expo-secure-store|@\/lib\/socket)$/ }, args => ({ path: args.path, namespace: 'native-test' }));
    api.onLoad({ filter: /.*/, namespace: 'native-test' }, args => ({ contents: modules[args.path], loader: 'js' }));
    api.onResolve({ filter: /^@\// }, args => ({ path: resolve(root, 'src', args.path.slice(2) + '.ts') }));
  } }] });
  writeFileSync(resolve(output, 'web-export/startup-harness.html'), '<meta charset="utf-8"><div id="root"></div><script src="/startup-harness.js"></script>');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
  const check = (name, result = true) => { assert.ok(result, name); checks.push(name); };
  const scenario = async (values, mode = '') => {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ values, mode }) => { window.__store = values; window.__storageMode = mode; window.__writes = []; }, { values, mode });
    return page;
  };
  const visit = page => page.goto('http://127.0.0.1:7347/startup-harness.html');
  const ready = page => page.waitForFunction(() => window.__session?.restoring === false);
  const values = () => ({ 'zviewer-ios-server': stored.serverUrl, 'zviewer-ios-session': JSON.stringify(stored) });
  const fulfill = (route, status, body) => route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    for (const [name, initial, mode] of [['fresh install', {}, ''], ['corrupt saved JSON', { 'zviewer-ios-session': '{broken' }, ''], ['storage rejection', {}, 'error'], ['storage never settles', {}, 'pending']]) {
      const page = await scenario(initial, mode); const started = Date.now(); await visit(page); await ready(page);
      check(`${name} releases startup gate`, await page.evaluate(() => window.__session.session === null) && Date.now() - started < 6500); await page.close();
    }
    {
      const page = await scenario(values()); await page.route('**/api/**', () => new Promise(() => {})); const started = Date.now(); await visit(page); await ready(page);
      check('offline verification does not gate restored session', Date.now() - started < 2000 && await page.evaluate(() => window.__session.session.user.username === 'test-user'));
      await page.evaluate(() => window.__session.logout()); check('logout remains available while verification hangs', await page.evaluate(() => window.__session.session === null)); await page.close();
    }
    {
      const page = await scenario(values()); let release;
      await page.route('**/api/auth/me', route => new Promise(resolve => { release = async () => { await fulfill(route, 200, { success: true, user: { ...stored.user, username: 'late-user' } }); resolve(); }; }));
      await visit(page); await ready(page); await page.waitForFunction(() => window.__session.session !== null);
      await page.evaluate(() => window.__session.logout()); await release(); await page.waitForTimeout(150);
      check('late verification cannot revive logout or overwrite persisted logout', await page.evaluate(() => window.__session.session === null && !window.__store['zviewer-ios-session'])); await page.close();
    }
    {
      const page = await scenario(values()); let release; let refreshing = false;
      await page.route('**/api/auth/me', route => fulfill(route, 401, { success: false, message: 'test expired' }));
      await page.route('**/api/auth/refresh', route => new Promise(resolve => { refreshing = true; release = async () => { await fulfill(route, 200, { success: true, accessToken: 'late-new-token', user: stored.user }); resolve(); }; }));
      await visit(page); await ready(page); for (let index = 0; !refreshing && index < 30; index++) await page.waitForTimeout(30); assert(refreshing);
      await page.evaluate(() => window.__session.logout()); await release(); await page.waitForTimeout(150);
      check('late refresh cannot revive logout or persist old credentials', await page.evaluate(() => window.__session.session === null && !window.__store['zviewer-ios-session'])); await page.close();
    }
    for (const expiredStatus of [401, 403]) {
      const page = await scenario(values()); let refreshes = 0;
      await page.route('**/api/auth/refresh', async route => { refreshes++; await fulfill(route, 200, { success: true, accessToken: 'test-fresh-access', user: stored.user }); });
      await page.route('**/api/auth/me', route => fulfill(route, route.request().headers().authorization === 'Bearer test-fresh-access' ? 200 : expiredStatus, { success: route.request().headers().authorization === 'Bearer test-fresh-access', message: '认证令牌无效或已过期', user: stored.user }));
      await visit(page); await ready(page); await page.waitForFunction(() => window.__session.session?.accessToken === 'test-fresh-access');
      check(`expired ${expiredStatus} access token refreshes and persists a usable session`, refreshes === 1 && await page.evaluate(() => JSON.parse(window.__store['zviewer-ios-session']).accessToken === 'test-fresh-access')); await page.close();
    }
    {
      const page = await scenario(values()); await page.route('**/api/**', route => fulfill(route, 401, { success: false, message: 'test invalid refresh' }));
      await visit(page); await ready(page); await page.waitForFunction(() => window.__writes.some(item => item.key === 'zviewer-ios-session' && item.value === null));
      check('invalid refresh clears session for fresh login', await page.evaluate(() => window.__session.session === null)); await page.close();
    }
    {
      const page = await scenario(values()); let refreshes = 0;
      await page.route('**/api/auth/me', route => fulfill(route, 200, { success: true, user: stored.user }));
      await page.route('**/api/auth/refresh', route => { refreshes++; return fulfill(route, 200, { success: true, accessToken: 'should-not-refresh', user: stored.user }); });
      await page.route('**/api/root-only', route => fulfill(route, 403, { success: false, message: '无权限：仅超级管理员可操作' }));
      await visit(page); await ready(page);
      const message = await page.evaluate(() => window.__session.request('/api/root-only').catch(error => error.message));
      check('permission-denied 403 neither refreshes nor logs out', /无权限/.test(message) && refreshes === 0 && await page.evaluate(() => window.__session.session?.accessToken === 'test-old-access')); await page.close();
    }
    check('no unhandled provider errors', errors.length === 0);
  } finally {
    writeFileSync(resolve(output, 'session-startup.json'), JSON.stringify({ scope: 'Actual SessionProvider under React DOM with simulated native storage/transport; not iOS Keychain acceptance', checks, errors }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
