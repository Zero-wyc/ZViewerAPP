import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, selectUpdate, trustedReleaseUrl, checkAppUpdate } from '../src/mobile/appUpdates.ts'
const release = (version, overrides = {}) => ({ tag_name: `client-v${version}`, html_url: `https://github.com/Zero-wyc/ZViewerAPP/releases/tag/client-v${version}`, assets: ['apk', 'hap'].map(extension => ({ name: `ZViewer-${version}-release.${extension}`, size: 42, browser_download_url: `https://github.com/Zero-wyc/ZViewerAPP/releases/download/client-v${version}/ZViewer.${extension}` })), ...overrides })
test('semantic versions and platform assets choose the newest stable client release', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.8.6', '1.8.6'), 0)
  const list = [release('1.8.5'), release('1.10.0'), release('1.9.0'), release('2.0.0', { prerelease: true }), release('3.0.0', { draft: true }), release('4.0.0', { tag_name: 'ios-v4.0.0' })]
  for (const platform of ['android', 'harmony']) {
    const result = selectUpdate(list, platform, '1.8.6')
    assert.equal(result.version, '1.10.0'); assert(result.assetName.endsWith(platform === 'android' ? '.apk' : '.hap'))
    assert.equal(selectUpdate(list, platform, '1.10.0'), null)
  }
  assert.equal(selectUpdate([release('1.8.6')], 'android', '1.8.6-debug'), null)
})
test('draft, absent, unsigned, debug and foreign assets never produce a download prompt', () => {
  for (const name of ['app-debug.apk', 'app-unsigned.apk', 'app.ipa', 'source.zip']) assert.equal(selectUpdate([release('1.9.0', { assets: [{ name, size: 100, browser_download_url: release('1.9.0').assets[0].browser_download_url }] })], 'android', '1.8.6'), null)
  const external = release('1.9.0'); external.assets[0].browser_download_url = 'https://evil.example/app.apk'
  assert.equal(selectUpdate([external], 'android', '1.8.6'), null)
  assert.equal(selectUpdate([release('1.9.0', { assets: [] })], 'android', '1.8.6'), null)
  for (const url of ['javascript:alert(1)', 'http://github.com/Zero-wyc/ZViewerAPP/releases', 'https://github.com/evil/app/releases', 'https://user:pass@github.com/Zero-wyc/ZViewerAPP/releases', 'https://github.com.evil.example/Zero-wyc/ZViewerAPP/releases']) assert(!trustedReleaseUrl(url))
})
test('offline and rate limited checks fail without claiming the installed version is current', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('{}', { status: 403 })
    await assert.rejects(checkAppUpdate('android', '1.8.6'), /过于频繁/)
    globalThis.fetch = async () => { throw new Error('offline') }
    await assert.rejects(checkAppUpdate('harmony', '1.8.6'), /offline/)
    globalThis.fetch = async () => new Response(JSON.stringify([release('1.9.0')]))
    assert.equal((await checkAppUpdate('harmony', '1.8.6')).version, '1.9.0')
  } finally { globalThis.fetch = previous }
})
