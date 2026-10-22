import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import ts from 'typescript';
import { SessionLease } from '../src/lib/sessionLease.ts';
import { authenticationFailure, shouldRefreshAuth } from '../src/lib/httpAuth.ts';
import * as freshness from '../src/lib/sessionFreshness.ts';
import * as connectionTransport from '../src/lib/connectionTransport.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const user = id => ({ id, role: 'user', username: `fixture-${id}` });
const session = id => ({ serverUrl: 'https://nas.fixture.invalid/prefix', accessToken: `bearer-${id}`, refreshToken: `refresh-${id}`, user: user(id) });
const deadline = { withDeadline: async operation => operation(new AbortController().signal) };
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(file, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require: name => { assert.ok(modules[name], name); return modules[name]; }, URL, AbortController, setTimeout, clearTimeout, ...globals });
  return exports;
}
const response = (body, status = 200) => ({ status, ok: status >= 200 && status < 300, async json() { return body; }, async text() { return JSON.stringify(body); } });

function hooks() {
  const slots = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  const react = {
    createContext() { return { Provider: 'Provider' }; },
    useContext() { throw new Error('The harness reads the actual Provider value'); },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useMemo: memo,
    useEffect(fn, deps) { const i = effectCursor++; const old = effects[i]; if (!old || changed(old.deps, deps)) queued.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, render(fn) { cursor = 0; effectCursor = 0; const value = fn(); for (const effect of queued.splice(0)) effect(); return value; }, unmount() { effects.forEach(effect => effect.cleanup?.()); } };
}

function mount({ initial = session(1), fetcher, isolate = async () => true, restorePolicy = async () => false, applyPolicy = async url => url, clock = () => Date.now() } = {}) {
  const runtime = hooks(), requests = [], opened = [], writes = [], appListeners = new Set(), timers = new Map(); let timerId = 0;
  const fetch = async (url, init) => {
    requests.push({ url, init });
    // Model the NAS cookie-first authentication order. Omitting credentials
    // makes the chosen Bearer account authoritative instead of stale account 5.
    if (fetcher) return fetcher(url, init);
    const id = init.credentials === 'omit' ? Number(init.headers?.Authorization?.slice(-1) || JSON.parse(init.body || '{}').username?.slice(-1) || 1) : 5;
    return response({ success: true, user: user(id), accessToken: `bearer-${id}`, refreshToken: `refresh-${id}` });
  };
  const server = load('../src/lib/server.ts', { './deadline.ts': deadline, './connectionTransport.ts': connectionTransport }, { fetch });
  const openSocket = value => {
    const listeners = new Map();
    const socket = { connected: false, on(event, fn) { listeners.set(event, fn); }, off(event, fn) { if (listeners.get(event) === fn) listeners.delete(event); }, disconnect() { this.connected = false; }, connect() { this.connected = true; listeners.get('connect')?.(); } };
    opened.push({ session: value, socket }); return socket;
  };
  const modules = {
    react: runtime.react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener(_event, fn) { appListeners.add(fn); return { remove() { appListeners.delete(fn); } }; } } },
    'expo-secure-store': { async getItemAsync() { return null; }, async setItemAsync(key, value) { writes.push({ key, value }); }, async deleteItemAsync(key) { writes.push({ key }); } },
    '@/lib/server': server, '@/lib/socket': { openSocket }, '@/lib/deadline': deadline,
    '@/lib/sessionLease': { SessionLease }, '@/lib/httpAuth': { authenticationFailure, shouldRefreshAuth },
    '@/lib/serverDiscovery': { async selectServerUrl(url, _probe, configure) { await configure?.(url); return url; } },
    '@/lib/serverConnection': { restoreServerPolicy: restorePolicy, applyServerPolicy: applyPolicy, async saveServerPolicy() {} },
    '@/lib/connectionTransport': connectionTransport,
    '@/lib/nativeBridge': { nativeBridge: { isolateServerAuthCookies: isolate } },
    '@/lib/debugLaunch': { async debugLaunchConfiguration() { return { session: initial }; } },
    '@/lib/sessionDiagnostics': { sessionDiagnostic() {} },
    '@/lib/sessionFreshness': { ...freshness, accessRefreshDelay: token => freshness.accessRefreshDelay(token, clock()) },
  };
  class ClockDate extends Date { static now() { return clock(); } }
  const component = load('../src/state/session.tsx', modules, { fetch, Date: ClockDate,
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); } });
  let context;
  const render = () => context = runtime.render(() => component.SessionProvider({ children: null })).props.value;
  render();
  const settle = async () => { for (let i = 0; i < 5; i++) { await tick(); render(); } return context; };
  return { requests, opened, writes, settle, render, value: () => context, unmount: runtime.unmount,
    timers, runTimer(id) { const value = timers.get(id); timers.delete(id); value?.fn(); }, foreground() { for (const fn of appListeners) fn('active'); } };
}

test('login, guest and refresh JSON requests cannot opt into a stale native cookie account', async () => {
  const sent = [];
  const server = load('../src/lib/server.ts', { './deadline.ts': deadline, './connectionTransport.ts': connectionTransport }, { fetch: async (url, init) => { sent.push({ url, init }); return response({ success: true, user: user(init.credentials === 'omit' ? 1 : 5) }); } });
  for (const endpoint of ['login', 'guest', 'refresh']) {
    const result = await server.fetchJson(`https://nas.fixture.invalid/api/auth/${endpoint}`, { method: 'POST', credentials: 'include', body: '{}' });
    assert.equal(result.user.id, 1); assert.equal(sent.at(-1).init.credentials, 'omit');
  }
});

test('restored SessionProvider uses its Bearer account even with a stale account cookie present', async () => {
  const provider = mount();
  try {
    const value = await provider.settle();
    assert.equal(value.session.user.id, 1); assert.equal(provider.opened.length, 1); assert.equal(provider.opened[0].session.user.id, 1);
    await value.request('/api/fixture', { credentials: 'include' });
    assert(provider.requests.length >= 2);
    assert(provider.requests.every(item => item.init.credentials === 'omit'));
    assert(provider.requests.every(item => item.init.headers.Authorization === 'Bearer bearer-1'));
  } finally { provider.unmount(); }
});

test('auth/me from a different account cannot silently replace or persist the selected user', async () => {
  const provider = mount({ fetcher: async () => response({ success: true, user: user(5) }) });
  try {
    const value = await provider.settle();
    assert.equal(value.session.user.id, 1); assert.equal(provider.opened.length, 1); assert.equal(provider.opened[0].session.user.id, 1);
    assert.equal(provider.writes.length, 0);
  } finally { provider.unmount(); }
});

test('refresh returning a different account fails and never persists that account or token', async () => {
  const provider = mount({ fetcher: async (url, init) => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { assert.equal(init.credentials, 'omit'); return response({ success: true, user: user(5), accessToken: 'wrong-account', refreshToken: 'wrong-refresh' }); }
    return response({ success: false }, 401);
  } });
  try {
    const value = await provider.settle();
    await assert.rejects(value.request('/api/fixture'), /身份校验不一致/);
    const next = await provider.settle(); assert.equal(next.session, null);
    assert(provider.writes.every(item => !item.value?.includes('wrong-account') && !item.value?.includes('wrong-refresh')));
  } finally { provider.unmount(); }
});

test('logout while native cookie isolation is pending cannot open a late socket', async () => {
  const pending = deferred(), provider = mount({ isolate: () => pending.promise });
  try {
    const value = await provider.settle(); assert.equal(value.session.user.id, 1); assert.equal(provider.opened.length, 0);
    await value.logout(); await provider.settle();
    pending.resolve(true); await provider.settle();
    assert.equal(provider.opened.length, 0); assert.equal(provider.value().session, null);
  } finally { provider.unmount(); }
});

test('switching account while native isolation is pending opens only the current account socket', async () => {
  const pending = deferred(); let isolationCount = 0;
  const provider = mount({ isolate: () => ++isolationCount === 1 ? pending.promise : Promise.resolve(true) });
  try {
    const value = await provider.settle(); assert.equal(value.session.user.id, 1); assert.equal(provider.opened.length, 0);
    await value.login('https://nas.fixture.invalid/prefix', 'account', 'fixture-2', 'fixture-password');
    await provider.settle(); pending.resolve(true); await provider.settle();
    assert.equal(provider.opened.length, 1); assert.equal(provider.opened[0].session.user.id, 2); assert.equal(provider.value().session.user.id, 2);
  } finally { provider.unmount(); }
});

test('socket handshake disables cookie polling and keeps the chosen explicit auth token', () => {
  let options;
  const socket = { on() {} };
  const module = load('../src/lib/socket.ts', {
    'socket.io-client': { io(_origin, value) { options = value; return socket; } },
    './socketEndpoint': { socketEndpoint() { return { origin: 'https://nas.fixture.invalid', path: '/prefix/socket.io' }; } },
    './sessionDiagnostics': { sessionDiagnostic() {} },
    './connectionTransport': connectionTransport,
  });
  assert.equal(module.openSocket(session(1)), socket);
  assert.equal(options.withCredentials, false); assert.equal(options.auth.token, 'bearer-1'); assert.equal(options.path, '/prefix/socket.io');
});

const jwt = exp => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
test('concurrent optional-auth music calls renew an expired NAS token before anonymous 200 responses can occur', async () => {
  let now = 1_000_000; const old = { ...session(1), accessToken: jwt(1060) }, fresh = jwt(5000), pending = deferred(); let refreshes = 0;
  const p = mount({ initial: old, clock: () => now, fetcher: async (url, init) => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { refreshes++; await pending.promise; return response({ success: true, user: user(1), accessToken: fresh }); }
    return response({ loggedIn: init.headers.Authorization === `Bearer ${fresh}` });
  } });
  try {
    const value = await p.settle(); now = 1_070_000;
    const first = value.requestText('/api/music/login/status'), second = value.requestText('/api/music/ncm/user/cloud'); await tick();
    assert.equal(refreshes, 1); assert.equal(p.requests.filter(x => x.url.includes('/api/music/')).length, 0);
    pending.resolve(); const replies = await Promise.all([first, second]);
    assert(replies.every(text => JSON.parse(text).loggedIn));
    assert(p.requests.filter(x => x.url.includes('/api/music/')).every(x => x.init.headers.Authorization === `Bearer ${fresh}`));
    await p.settle(); assert.equal(p.value().session.user.id, 1);
  } finally { p.unmount(); }
});

test('pre-expiry timer and foreground renewal share the active NAS lease without per-song auth probes', async () => {
  let now = 1_000_000, refreshes = 0; const fresh = jwt(5000);
  const p = mount({ initial: { ...session(1), accessToken: jwt(1060) }, clock: () => now, fetcher: async url => {
    if (url.endsWith('/api/auth/refresh')) { refreshes++; return response({ success: true, user: user(1), accessToken: fresh }); }
    return response({ success: true, user: user(1), loggedIn: true });
  } });
  try {
    await p.settle(); const [id, timer] = [...p.timers].find(([, value]) => value.delay === 30_000); assert.equal(timer.delay, 30_000);
    now = 1_030_000; p.runTimer(id); p.foreground(); await p.settle();
    assert.equal(refreshes, 1); assert.equal(p.value().session.accessToken, fresh);
    const probes = p.requests.filter(x => x.url.endsWith('/api/auth/me')).length;
    await p.value().requestText('/api/music/ncm/lyric?id=1'); await p.value().requestText('/api/music/ncm/comment/music?id=1');
    assert.equal(p.requests.filter(x => x.url.endsWith('/api/auth/me')).length, probes);
  } finally { p.unmount(); }
});

test('logout during proactive token refresh prevents late music fetch, credential persistence and socket revival', async () => {
  let now = 1_000_000; const pending = deferred();
  const p = mount({ initial: { ...session(1), accessToken: jwt(1060) }, clock: () => now, fetcher: async url => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { await pending.promise; return response({ success: true, user: user(1), accessToken: jwt(5000) }); }
    return response({ loggedIn: true });
  } });
  try {
    const value = await p.settle(); now = 1_070_000; const music = value.requestText('/api/music/login/status');
    const rejected = assert.rejects(music, /登录状态已改变/); await tick(); await value.logout(); await p.settle(); pending.resolve(); await rejected; await p.settle();
    assert.equal(p.value().session, null); assert.equal(p.requests.filter(x => x.url.includes('/api/music/')).length, 0);
    assert(p.writes.every(x => !x.value?.includes(jwt(5000)))); assert.equal(p.opened.length, 1);
  } finally { p.unmount(); }
});

test('switching NAS and account during renewal cannot send the retired music request or persist its refreshed token', async () => {
  let now = 1_000_000; const pending = deferred(), late = jwt(5000), next = jwt(9000);
  const p = mount({ initial: { ...session(1), accessToken: jwt(1060) }, clock: () => now, fetcher: async url => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { await pending.promise; return response({ success: true, user: user(1), accessToken: late }); }
    if (url.endsWith('/api/auth/login')) return response({ success: true, user: user(2), accessToken: next, refreshToken: 'new-server-refresh' });
    return response({ loggedIn: true });
  } });
  try {
    const value = await p.settle(); now = 1_070_000;
    const rejected = assert.rejects(value.requestText('/api/music/login/status'), /登录状态已改变/); await tick();
    await value.login('https://other.fixture.invalid', 'account', 'fixture-2', 'fixture-password'); await p.settle();
    pending.resolve(); await rejected; await p.settle();
    assert.equal(p.value().session.user.id, 2); assert.equal(p.value().session.serverUrl, 'https://other.fixture.invalid');
    assert.equal(p.requests.filter(x => x.url.includes('/api/music/')).length, 0); assert(p.writes.every(x => !x.value?.includes(late)));
    assert.equal(p.opened.at(-1).session.user.id, 2);
  } finally { p.unmount(); }
});

test('automatic pre-expiry refresh stops after three failed attempts instead of looping on an old JWT', async () => {
  let now = 1_000_000, refreshes = 0;
  const p = mount({ initial: { ...session(1), accessToken: jwt(1060) }, clock: () => now, fetcher: async url => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { refreshes++; throw Error('offline'); }
    throw Error('unexpected request');
  } });
  try {
    await p.settle(); now = 1_030_000;
    for (let attempt = 0; attempt < 3; attempt++) { const id = [...p.timers.keys()][0]; assert.notEqual(id, undefined); p.runTimer(id); await p.settle(); now += 5000; }
    assert.equal(refreshes, 3); assert.equal(p.timers.size, 0); assert.equal(p.value().session.user.id, 1);
  } finally { p.unmount(); }
});

test('expired-token refresh failures are bounded and never fall through to anonymous music requests', async () => {
  let now = 1_000_000, refreshes = 0;
  const p = mount({ initial: { ...session(1), accessToken: jwt(1060) }, clock: () => now, fetcher: async url => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { refreshes++; throw Error('offline'); }
    return response({ loggedIn: false });
  } });
  try {
    const value = await p.settle(); now = 1_070_000;
    await assert.rejects(value.requestText('/api/music/login/status'), /offline/);
    await assert.rejects(value.requestText('/api/music/ncm/user/cloud'), /offline/);
    assert.equal(refreshes, 1); assert.equal(p.requests.filter(x => x.url.includes('/api/music/')).length, 0); assert.equal(p.value().session.user.id, 1);
    now += 5001; await assert.rejects(value.requestText('/api/music/login/status'), /offline/); assert.equal(refreshes, 2);
  } finally { p.unmount(); }
});

test('a third-party NCM 401 on a fresh NAS lease does not refresh or log out that lease', async () => {
  let refreshes = 0;
  const p = mount({ initial: { ...session(1), accessToken: jwt(5000) }, clock: () => 1_000_000, fetcher: async url => {
    if (url.endsWith('/api/auth/me')) return response({ success: true, user: user(1) });
    if (url.endsWith('/api/auth/refresh')) { refreshes++; throw Error('unexpected'); }
    return response({ code: 401, message: 'NCM session rejected' }, 401);
  } });
  try {
    const value = await p.settle(); await assert.rejects(value.requestText('/api/music/ncm/user/cloud'), /NCM session rejected/); await p.settle();
    assert.equal(refreshes, 0); assert.equal(p.value().session.user.id, 1);
  } finally { p.unmount(); }
});

test('NAS relay 401 can force one unknown-expiry renewal but a retired expected lease cannot renew again', async () => {
  let refreshes = 0;
  const p = mount({ fetcher: async url => {
    if (url.endsWith('/api/auth/refresh')) { refreshes++; return response({ success: true, user: user(1), accessToken: 'renewed-opaque' }); }
    return response({ success: true, user: user(1) });
  } });
  try {
    const value = await p.settle(); const expected = value.session;
    const fresh = await value.ensureFresh({ force: true, expected }); assert.equal(fresh.accessToken, 'renewed-opaque');
    await assert.rejects(value.ensureFresh({ force: true, expected }), /登录状态已改变/); assert.equal(refreshes, 1);
  } finally { p.unmount(); }
});


test('restoring a stored certificate exception finishes before publishing Session or sending me and Socket', async () => {
  const gate = deferred(); const p = mount({ restorePolicy: async () => { await gate.promise; return true; } });
  try {
    await p.settle(); assert.equal(p.value().session, null); assert.equal(p.opened.length, 0); assert.equal(p.requests.length, 0);
    gate.resolve(); await p.settle();
    assert.equal(p.value().session.user.id, 1); assert.equal(p.value().certificateException, true); assert(p.requests.some(value => value.url.endsWith('/api/auth/me'))); assert.equal(p.opened.length, 1);
    assert(!JSON.stringify(p.writes).includes('127.0.0.1'));
  } finally { p.unmount(); }
});

test('logout while certificate setup is pending revokes its selected origin and prevents a late restored Socket', async () => {
  const gate = deferred(), applications = []; const p = mount({ restorePolicy: async () => { await gate.promise; return true; }, applyPolicy: async (url, allow) => { applications.push({ url, allow }); return url; } });
  try {
    await p.settle(); await p.value().logout(); gate.resolve(); await p.settle();
    assert.equal(p.value().session, null); assert.equal(p.opened.length, 0); assert.equal(p.requests.length, 0);
    assert.deepEqual(applications, [{ url: 'https://nas.fixture.invalid/prefix', allow: false }]);
  } finally { p.unmount(); }
});
