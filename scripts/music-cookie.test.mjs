import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

function loginHarness(role = 'user', response = { ok: true, status: 200, data: { success: true } }) {
  const requests = [], updates = []
  const api = async (url, body, options) => { requests.push({ url, body, options }); return url.includes('login/status') ? { ok: true, data: { loggedIn: true, nickname: 'test' } } : response }
  const { useNcmLogin } = loadTs('src/upstream/modules/music/hooks/useNcmLogin.ts', {
    react: { useCallback: f => f, useEffect() {}, useRef: current => ({ current }), useState: v => [v, () => {}] },
    '@/lib/api': { apiGet: (url, options) => api(url, undefined, options), apiPost: api },
    '@/components/ui/message': { message: { info() {}, error() {} } },
    '@/store/authStore': { useAuthStore: { getState: () => ({ user: { role } }) } },
    '../store': { useMusicStore: Object.assign(selector => selector({ loginStatus: { loggedIn: false } }), { getState: () => ({ loginStatus: { loggedIn: false }, setLoginStatus: v => updates.push(v) }) }) },
  })
  return { hook: useNcmLogin(), requests, updates }
}
test('Cookie login accepts header/JSON strings and refreshes music login status only after success', async () => {
  for (const cookie of ['MUSIC_U=test-only; __csrf=test', '["MUSIC_U=test-only; Path=/"]']) {
    const h = loginHarness(); await h.hook.cookieLogin(cookie)
    assert.equal(h.requests[0].url, '/api/music/ncm-cookie-login')
    assert.equal(h.requests[0].body.cookie, cookie)
    assert.equal(h.requests[0].options.refreshAuth, 'never')
    assert.equal(h.updates[0].loggedIn, true)
  }
})
test('guest cannot submit or read cookies; business 401 is distinct from invalid NCM credentials', async () => {
  const guest = loginHarness('guest')
  await assert.rejects(guest.hook.cookieLogin('MUSIC_U=test'), /游客/)
  await assert.rejects(guest.hook.readCookie(), /游客/)
  assert.equal(guest.requests.length, 0)
  const unauthorized = loginHarness('user', { ok: false, status: 401, data: { success: false } })
  await assert.rejects(unauthorized.hook.cookieLogin('MUSIC_U=test'), /ZViewer/)
  assert.equal(unauthorized.requests.length, 1)
  const invalid = loginHarness('user', { ok: false, status: 400, data: { success: false, message: 'Cookie 无效' } })
  await assert.rejects(invalid.hook.cookieLogin('bad'), /Cookie 无效/)
  assert.equal(invalid.updates.length, 0)
})
test('read Cookie is an explicit request and safely handles empty credentials', async () => {
  const h = loginHarness('user', { ok: true, status: 200, data: { success: true, cookie: '' } })
  assert.equal(h.requests.length, 0)
  assert.equal(await h.hook.readCookie(), '')
  assert.equal(h.requests[0].options.refreshAuth, 'never')
})
