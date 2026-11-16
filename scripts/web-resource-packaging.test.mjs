import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { packWeb } from '../ZV-HarmonyOS/scripts/pack-web.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zviewer-web-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, 'assets'))
  const originals = { 'index.html': Buffer.from('<html>offline</html>'), 'assets/player.js': Buffer.from('const player = 1;\n'.repeat(2000)), 'assets/font.woff2': Buffer.from([0, 255, 1, 4]) }
  for (const [name, data] of Object.entries(originals)) await writeFile(join(root, name), data)
  const entries = await packWeb(root)
  const reads = new Map()
  const manifest = await readFile(join(root, 'resources.json'))
  const context = createContext({ Map, ArrayBuffer, Uint8Array, Number, JSON, Error, Promise })
  const module = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('../ZV-HarmonyOS/entry/src/main/ets/services/LocalWebResources.ets', import.meta.url), 'utf8')), { context })
  const imports = {
    '@ohos.resourceManager': {},
    '@ohos.util': { TextDecoder: class { decodeToString(data) { return new TextDecoder().decode(data) } } },
    '@ohos.zlib': { ReturnStatus: { OK: 0 }, async createZip() { return { async uncompress(dest, source) { const data = inflateSync(new Uint8Array(source)); new Uint8Array(dest).set(data); return { status: 0, destLen: data.length } } } } },
  }
  await module.link(name => new SyntheticModule(['default'], function () { this.setExport('default', imports[name]) }, { context }))
  await module.evaluate()
  let intercept = async () => {}
  const reader = new module.namespace.LocalWebResources({ getRawFileContentSync() { return manifest }, async getRawFileContent(path) { reads.set(path, (reads.get(path) ?? 0) + 1); await intercept(); return readFile(join(root, path.slice(4))) } })
  return { root, originals, entries, reader, reads, setIntercept(fn) { intercept = fn } }
}

test('packaging preserves every byte and original URL for compressed and plain resources', async t => {
  const f = await fixture(t)
  assert(f.entries.some(e => e.compressed))
  assert(f.entries.some(e => !e.compressed))
  for (const [path, data] of Object.entries(f.originals)) assert.deepEqual(Buffer.from(await f.reader.read(path)), data)
})

test('concurrent requests share decompression and cache; clearing reloads packaged data', async t => {
  const f = await fixture(t)
  await Promise.all(Array.from({ length: 12 }, () => f.reader.read('assets/player.js')))
  assert.equal(f.reads.get('web/assets/player.js.zlib'), 1)
  f.reader.clear()
  assert.deepEqual(Buffer.from(await f.reader.read('assets/player.js')), f.originals['assets/player.js'])
  assert.equal(f.reads.get('web/assets/player.js.zlib'), 2)
})

test('invalid URLs never escape the package manifest', async t => {
  const f = await fixture(t)
  for (const path of ['../private', '/index.html', 'assets/player.js.zlib', 'unknown.js']) await assert.rejects(f.reader.read(path))
  assert.equal(f.reads.size, 0)
})

test('damaged data fails closed and does not poison retries or unrelated resources', async t => {
  const f = await fixture(t)
  const path = join(f.root, 'assets/player.js.zlib'), original = await readFile(path)
  await writeFile(path, 'corrupt')
  await assert.rejects(f.reader.read('assets/player.js'))
  await writeFile(path, original)
  assert.deepEqual(Buffer.from(await f.reader.read('assets/player.js')), f.originals['assets/player.js'])
  assert.deepEqual(Buffer.from(await f.reader.read('index.html')), f.originals['index.html'])
})

test('disposing during a read rejects stale completion and allows a fresh load', async t => {
  const f = await fixture(t)
  let release, started
  const entered = new Promise(resolve => { started = resolve })
  f.setIntercept(() => { started(); return new Promise(resolve => { release = resolve }) })
  const pending = f.reader.read('assets/player.js')
  await entered
  f.reader.clear()
  release()
  await assert.rejects(pending, /disposed/)
  f.setIntercept(async () => {})
  assert.deepEqual(Buffer.from(await f.reader.read('assets/player.js')), f.originals['assets/player.js'])
})

test('bounded cache evicts old data and reads it again when needed', async t => {
  const f = await fixture(t)
  f.reader.limit = 40000
  await f.reader.read('assets/player.js')
  f.reader.limit = 100
  await f.reader.read('index.html')
  await f.reader.read('assets/player.js')
  assert.equal(f.reads.get('web/assets/player.js.zlib'), 2)
})
