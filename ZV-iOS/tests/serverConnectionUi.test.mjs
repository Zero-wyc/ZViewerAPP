import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeServerUrl, messageFor } from '../src/lib/server.ts';
import * as transport from '../src/lib/connectionTransport.ts';
const tick = () => new Promise(resolve => setImmediate(resolve));
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const jsx = (type, props) => ({ type, props });
function all(tree, predicate) { if (!tree || typeof tree !== 'object') return []; return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => all(child, predicate))]; }
function hooks() {
  const slots = [], effects = [], queued = []; let cursor = 0, effectCursor = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => value !== b[index]);
  const memo = (fn, deps) => { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useCallback(fn, deps) { return memo(() => fn, deps); },
    useEffect(fn, deps) { const i = effectCursor++, old = effects[i]; if (!old || changed(old.deps, deps)) queued.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, render(fn) { cursor = 0; effectCursor = 0; const tree = fn(); for (const effect of queued.splice(0)) effect(); return tree; }, dispose() { effects.forEach(effect => effect.cleanup?.()); } };
}
const theme = { color: value => value, preferences: { radius: 14 }, open() {} };
function evaluate(file, modules, globals = {}) { const exports = {}; vm.runInNewContext(compile(file), { exports, require: key => { assert(key in modules, key); return modules[key]; }, URL, setTimeout, clearTimeout, ...globals }); return exports; }
function home({ loggedIn = false } = {}) {
  const runtime = hooks(), logins = [], revocations = [], logouts = [];
  const value = { session: loggedIn ? { serverUrl: 'https://nas.fixture.invalid/prefix', user: { id: 1, role: 'user', username: 'fixture' } } : null, savedServer: 'https://nas.fixture.invalid/prefix', restoring: false, socket: null, connected: false, certificateException: loggedIn, connectionError: '', async login(...args) { logins.push(args); }, async logout() { logouts.push(true); }, async revokeCertificateException() { revocations.push(true); }, async request() { return { rooms: [], settings: {} }; } };
  const modules = {
    react: runtime.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'expo-router': { router: { push() {} }, usePathname: () => '/' }, '@expo/vector-icons/Feather': { default: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/lib/roomModes': { roomModes: [{ id: 'watch-together', name: '一起看' }], roomModeName: value => value }, '@/state/appearance': { useAppearance: () => theme }, '@/state/session': { useSession: () => value },
    '@/lib/socket': { emitAck() {} }, '@/lib/server': { normalizeServerUrl, messageFor }, '@/lib/homeLayout': { homeLayout: {} }, '@/lib/serverConnection': { async readServerPolicy() { return false; } },
    '@/components/NativePreviewNotice': { NativePreviewNotice: 'NativePreviewNotice' }, '@/components/Surface': { Surface: 'Surface' }, '@/components/AppDialog': { AppDialog: 'AppDialog' }, '@/components/RoomUi': { RoomIconButton: 'RoomIconButton' }, '@/components/BiliAccount': { BiliAccount: 'BiliAccount' }, '@/components/SourceDropdown': { SourceDropdown: 'SourceDropdown' },
  };
  const { default: Home } = evaluate('../src/app/index.tsx', modules); let tree;
  const render = () => tree = runtime.render(() => Home()); render();
  return { get tree() { return tree; }, render, async settle() { for (let i = 0; i < 3; i++) { await tick(); render(); } }, logins, revocations, logouts, dispose: runtime.dispose };
}

test('connection UI uses the requested default-off Switch, passes explicit choice and resets it for another address', async () => {
  const page = home(); try {
    await page.settle();
    const option = () => all(page.tree, node => node.type === 'Switch' && node.props.accessibilityLabel === '允许服务器使用不受信任的证书')[0];
    assert(option()); assert.equal(option().props.value, false); assert.equal(option().props.disabled, false);
    option().props.onValueChange(true); page.render(); assert.equal(option().props.value, true);
    all(page.tree, node => node.type === 'TextInput' && node.props.textContentType === 'username')[0].props.onChangeText('fixture');
    all(page.tree, node => node.type === 'TextInput' && node.props.textContentType === 'password')[0].props.onChangeText('fixture-password'); page.render();
    all(page.tree, node => node.props?.label === '登录并选择房间')[0].props.onPress(); await page.settle();
    assert.equal(page.logins.length, 1); assert.equal(page.logins[0][0], 'https://nas.fixture.invalid/prefix'); assert.equal(page.logins[0][4], true);
    all(page.tree, node => node.type === 'TextInput' && node.props.keyboardType === 'url')[0].props.onChangeText('https://other.fixture.invalid'); await page.settle();
    assert.equal(option().props.value, false);
    all(page.tree, node => node.type === 'TextInput' && node.props.keyboardType === 'url')[0].props.onChangeText('http://plain.fixture.invalid'); await page.settle();
    assert.equal(option().props.value, false); assert.equal(option().props.disabled, true);
  } finally { page.dispose(); }
});

test('connected certificate exception exposes the explicit revoke-and-disconnect action', async () => {
  const page = home({ loggedIn: true }); try {
    await page.settle();
    const revoke = all(page.tree, node => node.props?.accessibilityLabel === '撤销服务器证书例外并断开')[0]; assert(revoke);
    revoke.props.onAccessibilityTap(); await page.settle();
    assert.equal(page.revocations.length, 1); assert.equal(page.logouts.length, 0);
  } finally { page.dispose(); }
});

test('MediaImage and authenticated SourcePoster map only selected NAS loads and keep data or CDN images intact', async () => {
  const server = 'https://nas.fixture.invalid/prefix', token = 'b'.repeat(48), base = `http://127.0.0.1:43121/${token}`;
  transport.bindConnectionTransport(server, base + '/prefix');
  const mediaRuntime = hooks(), common = { react: mediaRuntime.react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { Image: 'Image', Text: 'Text', View: 'View' }, '@/state/appearance': { useAppearance: () => theme }, '@/lib/connectionTransport': transport, '@/lib/neteaseImage': { neteaseImageUrl: value => value } };
  const { MediaImage } = evaluate('../src/components/MediaImage.tsx', common);
  for (const raw of [server + '/api/image', 'https://cdn.fixture.invalid/cover', 'data:image/png;base64,AA==']) {
    const image = mediaRuntime.render(() => MediaImage({ source: { uri: raw } }));
    assert.equal(image.props.source.uri, raw.startsWith(server) ? base + '/prefix/api/image' : raw);
  }
  const posterRuntime = hooks(), sent = [], session = { serverUrl: server, accessToken: 'fixture-token', user: { id: 1 } };
  const { SourcePoster } = evaluate('../src/components/SourcePoster.tsx', { ...common, react: posterRuntime.react, '@/state/session': { useSession: () => ({ session }) }, '@/lib/biliCatalog': { posterHeight: width => width }, 'base64-js': { fromByteArray: () => 'AA==' } }, { fetch: async (url, init) => { sent.push({ url, init }); return { ok: true, headers: { get: key => key === 'content-type' ? 'image/png' : '1' }, arrayBuffer: async () => new Uint8Array([0]).buffer }; }, AbortController, Uint8Array });
  try {
    const render = () => posterRuntime.render(() => SourcePoster({ uri: '/api/poster?id=1', serverProxy: true })); render(); await tick(); const poster = render();
    assert.equal(sent[0].url, base + '/prefix/api/poster?id=1'); assert.equal(sent[0].init.headers.Authorization, 'Bearer fixture-token'); assert.equal(sent[0].init.credentials, 'omit');
    assert.equal(poster.props.source.uri, 'data:image/png;base64,AA==');
    assert.equal(session.serverUrl, server);
  } finally { posterRuntime.dispose(); mediaRuntime.dispose(); transport.clearConnectionTransport(); }
});
