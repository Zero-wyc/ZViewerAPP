import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authenticatedMediaUrl, normalizeServerUrl, serverResource } from '../src/mobile/serverUrl.ts'

test('normalize server and reverse proxy paths', () => {
  assert.equal(normalizeServerUrl(' 192.168.1.2:3333/ '), 'http://192.168.1.2:3333')
  assert.equal(normalizeServerUrl('https://example.com/zviewer/'), 'https://example.com/zviewer')
  assert.throws(() => normalizeServerUrl('file:///tmp'))
  assert.throws(() => normalizeServerUrl('https://user:pass@example.com'))
})
test('media paths use remote server, credentials never leak to unrelated origins', () => {
  assert.equal(authenticatedMediaUrl('https://example.com/z', '/api/stream/a', 'abc'), 'https://example.com/z/api/stream/a?token=abc')
  assert.equal(authenticatedMediaUrl('https://example.com', 'https://other.com/api/stream/a', 'abc'), 'https://other.com/api/stream/a')
  assert.equal(authenticatedMediaUrl('https://example.com', '/api/a?token=old', 'new'), 'https://example.com/api/a?token=old')
  assert.equal(serverResource('http://server:3333', '/live/key.flv'), 'http://server:3333/live/key.flv')
  assert.equal(authenticatedMediaUrl('http://server:3333', 'blob:http://localhost/123', 'secret'), 'blob:http://localhost/123')
})
