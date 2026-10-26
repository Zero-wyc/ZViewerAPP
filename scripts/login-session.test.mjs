import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { parse } from '@babel/parser'
import { transformSync } from 'rolldown/experimental'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'

// Exercise the shared App handlers with a small hook host and isolated transport.
async function appHost(storedSession) {
  const storage = new Map(storedSession ? [['zviewer-mobile-session', JSON.stringify(storedSession)]] : [])
  const states = []; let cursor = 0; let user = null; let tokens = ''; let calls = 0
  const auth = Object.assign(() => user, { getState: () => ({
    login: value => { user = value }, logout: () => { user = null }, markAuthResolved() {},
  }) })
  const node = (type, props) => ({ type, props: props || {} })
  const mocks = {
    useEffect() {}, useMemo: fn => fn(), useRef: value => ({ current: value }),
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }] },
    lazy: () => 'Lazy', Suspense: 'Suspense', jsx: node, jsxs: node, Fragment: 'Fragment',
    useLocation: () => ({ pathname: '/' }), useNavigate: () => () => {},
    useAuthStore: auth, useSocket: () => ({ socket: null, connected: false }),
    useSystemSettingsStore: { getState: () => ({ invalidate() {}, fetchSettings() {} }) },
    readServerPolicy: () => false, normalizeServerUrl: value => value,
    selectServer: async value => value, connectionUrl: value => value,
    saveAuthTokens: value => { tokens = value }, clearAuthTokens: () => { tokens = '' },
    isGlobalAppearanceRuntime: () => false, useScreenShareCapabilities: () => ({}),
    apiFetch: async url => Response.json(url.endsWith('/api/rooms') ? { success: true, rooms: [] } : { success: true }),
  }
  const context = createContext({
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async () => { calls++; return Response.json({ success: true, user: { id: 1, username: 'fixture', role: 'user' }, accessToken: 'fixture-token', refreshToken: 'fixture-refresh' }) },
    Headers, Response, AbortController, AbortSignal, URL, console,
  })
  const source = await fs.readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const imports = new Map([['react/jsx-runtime', ['jsx', 'jsxs', 'Fragment']]])
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') continue
    const names = statement.specifiers.map(item => item.type === 'ImportDefaultSpecifier' ? 'default' : item.imported.name)
    imports.set(statement.source.value, names)
  }
  const output = transformSync('App.tsx', source, { lang: 'tsx', target: 'es2022', jsx: { runtime: 'automatic' } })
  const module = new SourceTextModule(output.code, { context })
  await module.link(specifier => new SyntheticModule(imports.get(specifier), function () {
    for (const name of imports.get(specifier)) this.setExport(name, mocks[name] ?? (() => {}))
  }, { context }))
  await module.evaluate()
  const render = () => { cursor = 0; return module.namespace.default() }
  function find(predicate, tree = render()) {
    if (!tree || typeof tree !== 'object') return
    if (predicate(tree)) return tree
    for (const child of [tree.props?.children].flat(Infinity)) { if (child == null) continue; const found = find(predicate, child); if (found) return found }
  }
  return {
    field: id => find(n => n.props.id === id)?.props,
    change: (id, value) => find(n => n.props.id === id).props.onChange({ target: { value } }),
    submit: () => find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }),
    logout: () => find(n => n.props['aria-label'] === '更换服务器').props.onClick(),
    togglePassword: () => find(n => n.props['aria-label'] === '显示密码').props.onClick(),
    storage, get user() { return user }, get tokens() { return tokens }, get calls() { return calls },
  }
}

test('logout retains entered credentials, masks password and removes only the active session', async () => {
  const app = await appHost()
  app.change('server-url', 'https://fixture.invalid')
  app.change('username', 'fixture'); app.change('password', 'fixture-password')
  app.togglePassword()
  await app.submit(); await app.submit()
  assert.ok(app.tokens); assert.ok(app.user)
  app.logout()
  assert.equal(app.field('username').value, 'fixture')
  assert.equal(app.field('password').value, 'fixture-password')
  assert.equal(app.field('password').type, 'password')
  assert.equal(app.tokens, ''); assert.equal(app.user, null)
  assert.equal(app.storage.has('zviewer-mobile-session'), false)
  assert.equal([...app.storage.values()].some(value => value.includes('fixture-password')), false)
  assert.equal(app.calls, 1, 'logout must not automatically log in again')
  await app.submit(); await app.submit()
  assert.equal(app.calls, 2, 'retained fields support an explicit new login')
})

test('a restored account keeps its known username without inventing or persisting a password', async () => {
  const session = { serverUrl: 'https://fixture.invalid', user: { id: 1, username: 'fixture', role: 'user' }, accessToken: 'old', refreshToken: 'old-refresh' }
  const app = await appHost(session)
  app.logout()
  assert.equal(app.field('username').value, 'fixture')
  assert.equal(app.field('password').value, '')
  assert.equal(app.storage.has('zviewer-mobile-session'), false)
})
