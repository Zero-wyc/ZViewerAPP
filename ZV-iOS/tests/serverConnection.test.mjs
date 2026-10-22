import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as transport from '../src/lib/connectionTransport.ts';
import { normalizeServerUrl, fetchJson } from '../src/lib/server.ts';
import { selectServerUrl } from '../src/lib/serverDiscovery.ts';
import { socketEndpoint } from '../src/lib/socketEndpoint.ts';

const capability = 'a'.repeat(48);
const local = (server, port = 43120) => `http://127.0.0.1:${port}/${capability}${new URL(server).pathname.replace(/\/$/, '')}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const compile = ts.transpileModule(readFileSync(new URL('../src/lib/serverConnection.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function policyStore({ initial = {}, configure } = {}) {
  let stored = { origins: initial }; const writes = [], calls = [];
  const nativeBridge = { async configureServerConnection(url, allow) { calls.push({ url, allow }); return configure ? configure(url, allow) : { url: allow ? local(url) : url }; } };
  const modules = { './server': { normalizeServerUrl }, './connectionTransport': transport, './nativeBridge': { nativeBridge }, './preferences': { async readPreference() { return structuredClone(stored); }, async writePreference(_key, value) { stored = structuredClone(value); writes.push(stored); } } };
  const exports = {}; vm.runInNewContext(compile, { exports, require: key => modules[key], URL });
  return { ...exports, calls, writes, stored: () => stored };
}

test('connection transport maps exact HTTPS/WSS origin and reverses only its own capability path', () => {
  transport.clearConnectionTransport();
  const server = 'https://nas.fixture.invalid/base'; transport.bindConnectionTransport(server, local(server));
  const input = 'https://NAS.fixture.invalid:443/base/api/items?q=a%2Fb#position';
  const mapped = `http://127.0.0.1:43120/${capability}/base/api/items?q=a%2Fb#position`;
  assert.equal(transport.connectionUrl(input), mapped);
  assert.equal(transport.connectionUrl(mapped), mapped);
  assert.equal(transport.logicalConnectionUrl(mapped), 'https://nas.fixture.invalid/base/api/items?q=a%2Fb#position');
  assert.equal(transport.connectionUrl('wss://nas.fixture.invalid/base/socket.io?EIO=4'), `ws://127.0.0.1:43120/${capability}/base/socket.io?EIO=4`);
  assert.equal(transport.logicalConnectionUrl(`ws://127.0.0.1:43120/${capability}/base/socket.io`), 'wss://nas.fixture.invalid/base/socket.io');
  for (const outside of ['https://nas.fixture.invalid:3334/base', 'https://voice.fixture.invalid', 'https://cdn.fixture.invalid/video', 'http://nas.fixture.invalid/base', 'wss://voice.fixture.invalid/socket.io', 'data:image/png;base64,AA==']) assert.equal(transport.connectionUrl(outside), outside);
  const wrongCapability = `http://127.0.0.1:43120/${capability}x/base`;
  assert.equal(transport.logicalConnectionUrl(wrongCapability), wrongCapability);
  transport.clearConnectionTransport(); assert.equal(transport.connectionUrl(input), input);
});

test('malformed or foreign transport replies fail closed and cannot retain a previous binding', () => {
  const server = 'https://nas.fixture.invalid/prefix';
  for (const invalid of ['http://remote.fixture.invalid/' + capability + '/prefix', 'http://127.0.0.1:43120/wrong/prefix', local(server) + '?cap=other', local(server).replace('/prefix', '/different')]) {
    transport.bindConnectionTransport(server, local(server));
    assert.throws(() => transport.bindConnectionTransport(server, invalid), /通道无效/);
    assert.equal(transport.connectionUrl(server), server);
  }
});

test('certificate preference defaults off and is canonical-origin scoped across paths and ports', async () => {
  const policy = policyStore(); assert.equal(await policy.readServerPolicy('nas.fixture.invalid/prefix'), false);
  await policy.saveServerPolicy('HTTPS://NAS.fixture.invalid:443/prefix', true);
  assert.equal(await policy.readServerPolicy('https://nas.fixture.invalid/other'), true);
  for (const value of ['http://nas.fixture.invalid', 'https://nas.fixture.invalid:444', 'https://voice.fixture.invalid', 'not a server']) assert.equal(await policy.readServerPolicy(value), false);
  await Promise.all([policy.saveServerPolicy('https://second.fixture.invalid', true), policy.saveServerPolicy('https://third.fixture.invalid', true)]);
  assert.equal(await policy.readServerPolicy('https://second.fixture.invalid'), true); assert.equal(await policy.readServerPolicy('https://third.fixture.invalid'), true);
  await policy.saveServerPolicy('https://nas.fixture.invalid/new-prefix', false);
  assert.equal(await policy.readServerPolicy('https://nas.fixture.invalid'), false);
  await policy.saveServerPolicy('http://plaintext.fixture.invalid', true);
  assert.equal(await policy.readServerPolicy('http://plaintext.fixture.invalid'), false);
  assert(policy.writes.every(value => Object.keys(value.origins).every(key => key.startsWith('https:') && !key.includes('127.0.0.1'))));
});

test('stored certificate exceptions reject malformed entries and remain bounded', async () => {
  const policy = policyStore({ initial: { 'https://valid.fixture.invalid': true, 'http://plain.fixture.invalid': true, 'https://path.fixture.invalid/path': true, 'https://string.fixture.invalid': 'true' } });
  assert.equal(await policy.readServerPolicy('https://valid.fixture.invalid'), true);
  assert.equal(await policy.readServerPolicy('https://path.fixture.invalid/path'), false);
  assert.equal(await policy.readServerPolicy('https://string.fixture.invalid'), false);
  for (let n = 0; n < 65; n++) await policy.saveServerPolicy(`https://fixture-${n}.invalid`, true);
  assert.equal(Object.keys(policy.stored().origins).length, 64);
});

test('configuration deduplicates the active channel and disabling closes mapping without erasing saved opt-in', async () => {
  const policy = policyStore(); const server = 'https://nas.fixture.invalid/prefix';
  await policy.saveServerPolicy(server, true);
  assert.equal(await policy.restoreServerPolicy(server), true);
  await policy.applyServerPolicy(server + '/', true);
  assert.equal(policy.calls.length, 1);
  assert.equal(transport.connectionUrl(server), local(server));
  await policy.applyServerPolicy(server, false);
  assert.equal(transport.connectionUrl(server), server); assert.equal(policy.calls.length, 2);
  assert.equal(await policy.readServerPolicy(server), true);
  await policy.saveServerPolicy(server, false); assert.equal(await policy.readServerPolicy(server), false);
});

test('late old configuration cannot bind over the newer selected origin', async () => {
  let release; const old = new Promise(resolve => { release = resolve; });
  const policy = policyStore({ configure: async (url, allow) => { if (url.includes('old.')) await old; return { url: allow ? local(url) : url }; } });
  const previous = policy.applyServerPolicy('https://old.fixture.invalid/prefix', true); const rejected = assert.rejects(previous, /已取消/);
  await tick(); const latest = policy.applyServerPolicy('https://new.fixture.invalid/prefix', true); release();
  await rejected; await latest;
  assert.equal(transport.connectionUrl('https://old.fixture.invalid/prefix'), 'https://old.fixture.invalid/prefix');
  assert.equal(transport.connectionUrl('https://new.fixture.invalid/prefix'), local('https://new.fixture.invalid/prefix'));
});

test('discovery configures before every actual candidate and never downgrades a certificate failure', async () => {
  const events = [];
  const result = await selectServerUrl('nas.fixture.invalid:3333/prefix', async url => { events.push(['probe', url]); return { ok: url.startsWith('http:'), code: 'tls_unavailable' }; }, async url => { events.push(['configure', url]); });
  assert.equal(result, 'http://nas.fixture.invalid:3333/prefix');
  assert.deepEqual(events.map(value => value[0]), ['configure', 'probe', 'configure', 'probe']);
  const certificate = [];
  await assert.rejects(selectServerUrl('nas.fixture.invalid', async url => { certificate.push(url); return { ok: false, code: 'certificate_untrusted' }; }, async () => {}), /证书/);
  assert.deepEqual(certificate, ['https://nas.fixture.invalid']);
});

test('REST and Socket.IO use the same prefixed channel while retaining explicit account credentials', async () => {
  const server = 'https://nas.fixture.invalid/prefix'; transport.bindConnectionTransport(server, local(server));
  const previousFetch = globalThis.fetch; let sent;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return { ok: true, json: async () => ({ success: true }) }; };
  try {
    await fetchJson(server + '/api/auth/me', { headers: { Authorization: 'Bearer fixture' }, credentials: 'include' });
    assert.equal(sent.url, local(server) + '/api/auth/me'); assert.equal(sent.init.credentials, 'omit'); assert.equal(sent.init.headers.Authorization, 'Bearer fixture');
    assert.deepEqual(socketEndpoint(server), { origin: 'http://127.0.0.1:43120', path: `/${capability}/prefix/socket.io` });
  } finally { globalThis.fetch = previousFetch; transport.clearConnectionTransport(); }
});

test('Socket.IO sends the accepted local Origin only for its verified current certificate channel', () => {
  const server = 'https://nas.fixture.invalid/prefix', sent = [];
  const source = ts.transpileModule(readFileSync(new URL('../src/lib/socket.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules = { 'socket.io-client': { io(origin, options) { sent.push({ origin, options }); return { on() {} }; } }, './socketEndpoint': { socketEndpoint }, './sessionDiagnostics': { sessionDiagnostic() {} }, './connectionTransport': transport };
  const exports = {}; vm.runInNewContext(source, { exports, require: key => modules[key] });
  const session = { serverUrl: server, accessToken: 'fixture', user: { id: 1, role: 'user' } };
  transport.clearConnectionTransport(); exports.openSocket(session);
  assert.equal(sent.at(-1).options.extraHeaders, undefined);
  transport.bindConnectionTransport(server, local(server)); exports.openSocket(session);
  assert.equal(sent.at(-1).origin, 'http://127.0.0.1:43120'); assert.equal(sent.at(-1).options.extraHeaders.Origin, 'https://localhost');
  assert.equal(sent.at(-1).options.auth.token, 'fixture'); assert.equal(session.serverUrl, server);
  exports.openSocket({ ...session, serverUrl: 'https://voice.fixture.invalid' }); assert.equal(sent.at(-1).options.extraHeaders, undefined);
  transport.clearConnectionTransport(); exports.openSocket(session); assert.equal(sent.at(-1).options.extraHeaders, undefined);
});


test('plain HTTP gateway maps REST and WS without a certificate exception and retains logical identities', () => {
  const server = 'http://nas.fixture.invalid:3333/base';
  transport.bindConnectionTransport(server, local(server));
  const rest = server + '/api/items?q=1';
  assert.equal(transport.connectionUrl(rest), local(server) + '/api/items?q=1');
  assert.equal(transport.logicalConnectionUrl(transport.connectionUrl(rest)), rest);
  const socket = 'ws://nas.fixture.invalid:3333/socket.io/?EIO=4';
  assert.equal(transport.connectionUrl(socket), `ws://127.0.0.1:43120/${capability}/socket.io/?EIO=4`);
  assert.equal(transport.logicalConnectionUrl(transport.connectionUrl(socket)), socket);
  assert.equal(transport.connectionUrl('https://nas.fixture.invalid:3333/api'), 'https://nas.fixture.invalid:3333/api');
  transport.clearConnectionTransport();
});
