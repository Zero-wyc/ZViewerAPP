import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'

async function load(fixture, { contentRange = true, status = 206 } = {}) {
  const requests = []
  const context = createContext({
    ArrayBuffer, Blob, DataView, Uint8Array,
    console: { warn() {} },
    fetch: async (_url, options) => {
      requests.push(options.headers.Range)
      const end = Number(options.headers.Range.match(/-(\d+)$/)[1]) + 1
      const body = status === 200 ? fixture : fixture.slice(0, end)
      return {
        ok: true, status,
        headers: new Map([
          ...(contentRange ? [['Content-Range', `bytes 0-${body.byteLength - 1}/${fixture.byteLength}`]] : []),
          ['Content-Length', String(body.byteLength)],
        ]),
        arrayBuffer: async () => body,
      }
    },
  })
  const base = new URL('../src/upstream/modules/player/engines/dash/', import.meta.url)
  const parser = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('mp4-box-parser.ts', base), 'utf8')), { context })
  await parser.link(() => { throw Error('Unexpected parser import') })
  await parser.evaluate()
  const builder = new SourceTextModule(stripTypeScriptTypes(await readFile(new URL('mpd-builder.ts', base), 'utf8')), { context })
  await builder.link(specifier => {
    if (specifier === './mp4-box-parser') return parser
    assert.equal(specifier, '../../services/url-proxy')
    return new SyntheticModule(['resolveProxyUrl', 'isCliProxyUrl'], function () {
      this.setExport('resolveProxyUrl', value => value)
      this.setExport('isCliProxyUrl', () => false)
    }, { context })
  })
  await builder.evaluate()
  return { ...builder.namespace, requests }
}

function box(view, offset, size, type) {
  view.setUint32(offset, size)
  for (let i = 0; i < 4; i++) view.setUint8(offset + 4 + i, type.charCodeAt(i))
}

function sidx(view, offset, start, references, { firstOffset = 0, timescale = 1000 } = {}) {
  box(view, offset, 32 + references.length * 12, 'sidx')
  view.setUint32(offset + 12, 1)
  view.setUint32(offset + 16, timescale)
  view.setUint32(offset + 20, start * timescale)
  view.setUint32(offset + 24, firstOffset)
  view.setUint16(offset + 30, references.length)
  references.forEach(({ size, duration, type = 0 }, i) => {
    view.setUint32(offset + 32 + i * 12, size + type * 0x80000000)
    view.setUint32(offset + 36 + i * 12, duration * timescale)
    view.setUint32(offset + 40 + i * 12, 0x90000000)
  })
}

function indexedFixture(mediaSize = 300_000) {
  const secondIndex = 16 + 44 + mediaSize
  const fixture = new ArrayBuffer(secondIndex + 44 + mediaSize)
  const view = new DataView(fixture)
  box(view, 0, 8, 'ftyp')
  box(view, 8, 8, 'moov')
  sidx(view, 16, 0, [{ size: mediaSize, duration: 900 }])
  box(view, 60, mediaSize, 'mdat')
  sidx(view, secondIndex, 900, [{ size: mediaSize, duration: 900 }])
  box(view, secondIndex + 44, mediaSize, 'mdat')
  return fixture
}

function manifest(api, info, duration = 1800) {
  return api.generateMpd({
    videoUrl: 'https://media.example/video.m4s',
    audioUrl: 'https://media.example/audio.m4s',
    initInfo: info,
    duration,
  })
}

function ranges(mpd) {
  return [...mpd.matchAll(/mediaRange="([^"]+)"/g)].map(match => match[1])
}

test('a secondary scan merges later SIDX media ranges and presentation times into the manifest', async () => {
  const fixture = indexedFixture()
  const api = await load(fixture)
  const info = await api.preloadInitSegment('https://media.example/video.m4s', { duration: 1800 })
  assert.equal(info.sidxCount, 2)
  assert.equal(info.sidxCoverage, 1800)
  assert.deepEqual(Array.from(info.segments, value => ({ ...value })), [
    { startTime: 0, duration: 900, byteOffset: 60, byteSize: 300_000 },
    { startTime: 900, duration: 900, byteOffset: 300_104, byteSize: 300_000 },
  ])
  assert.deepEqual(api.requests, ['bytes=0-262143', 'bytes=0-5242879'])
  assert.deepEqual(ranges(manifest(api, info)), ['60-300059', '300104-600103'])
})

test('initial preload and Blob parsing both retain every SIDX already in the buffer', async () => {
  const fixture = indexedFixture(128)
  const api = await load(fixture)
  const streamed = await api.preloadInitSegment('https://media.example/video.m4s', { duration: 1800 })
  const buffered = await api.parseInitFromBlob(new Blob([fixture]), 1800)
  for (const info of [streamed, buffered]) {
    assert.equal(info.sidxCount, 2)
    assert.equal(info.sidxCoverage, 1800)
    assert.deepEqual(ranges(manifest(api, info)), ['60-187', '232-359'])
  }
  assert.equal(api.requests.length, 1)
})

test('overlapping indices are deduplicated and hierarchical references never become media ranges', async () => {
  const fixture = new ArrayBuffer(200)
  const view = new DataView(fixture)
  box(view, 0, 8, 'ftyp')
  box(view, 8, 8, 'moov')
  sidx(view, 16, 0, [{ type: 1, size: 44, duration: 1 }])
  sidx(view, 60, 0, [{ size: 52, duration: 1 }], { firstOffset: 44 })
  sidx(view, 104, 0, [{ size: 52, duration: 1 }])
  box(view, 148, 52, 'mdat')
  const api = await load(fixture)
  const info = await api.parseInitFromBlob(new Blob([fixture]), 1)
  assert.equal(info.sidxCount, 3)
  assert.equal(info.sidxCoverage, 1)
  assert.deepEqual(ranges(manifest(api, info, 1)), ['148-199'])
})

test('a real presentation gap is retained as an explicit timeline start', async () => {
  const fixture = indexedFixture(128)
  sidx(new DataView(fixture), 188, 1000, [{ size: 128, duration: 900 }])
  const api = await load(fixture)
  const info = await api.parseInitFromBlob(new Blob([fixture]), 1900)
  assert.equal(info.sidxCoverage, 1900)
  assert.match(manifest(api, info, 1900), /<S t="1000000" d="900000" \/>/)
})

test('206 Content-Length is not mistaken for the whole media size', async () => {
  const api = await load(indexedFixture(), { contentRange: false })
  const info = await api.preloadInitSegment('https://media.example/video.m4s', { duration: 1800 })
  assert.equal(info.totalSize, undefined)
  assert.equal(info.segments.length, 2)
})

test('a complete 200 response can supply the whole file size without Content-Range', async () => {
  const fixture = indexedFixture(128)
  const api = await load(fixture, { contentRange: false, status: 200 })
  const info = await api.preloadInitSegment('https://media.example/video.m4s', { duration: 1800 })
  assert.equal(info.totalSize, fixture.byteLength)
  assert.equal(info.segments.length, 2)
})

test('an authoritative EOF prevents estimates even when the presentation duration was rounded up', async () => {
  const api = await load(new ArrayBuffer(0))
  const segments = [{ startTime: 0, duration: 899, byteOffset: 100, byteSize: 1000 }]
  assert.equal(api.extendSegmentsWithLinearEstimation(segments, 1100, 901), segments)
  assert.equal(api.extendSegmentsWithLinearEstimation(segments, 1000, 901), segments)
})

test('estimated ranges stay integral, contiguous, inside EOF and within presentation duration', async () => {
  const api = await load(new ArrayBuffer(0))
  const segments = [
    { startTime: 0, duration: 1, byteOffset: 100, byteSize: 101 },
    { startTime: 1, duration: 1, byteOffset: 201, byteSize: 102 },
  ]
  const estimated = api.extendSegmentsWithLinearEstimation(segments, 500, 4)
  for (let i = 0; i < estimated.length; i++) {
    const segment = estimated[i]
    assert.equal(Number.isSafeInteger(segment.byteOffset), true)
    assert.equal(Number.isSafeInteger(segment.byteSize), true)
    assert.ok(segment.byteSize > 0)
    assert.ok(segment.byteOffset + segment.byteSize <= 500)
    assert.ok(segment.startTime + segment.duration <= 4)
    if (i > 0) assert.equal(segment.byteOffset, estimated[i - 1].byteOffset + estimated[i - 1].byteSize)
  }
  assert.equal(estimated.at(-1).byteOffset + estimated.at(-1).byteSize, 500)
  assert.ok(ranges(manifest(api, { initEnd: 100, segments: estimated }, 4)).every(range => /^\d+-\d+$/.test(range)))
  const withoutSize = api.extendSegmentsWithLinearEstimation(segments, undefined, 4.5)
  assert.equal(withoutSize.at(-1).startTime + withoutSize.at(-1).duration, 4.5)
})

test('FFmpeg multi-SIDX media keeps every decodable fragment in both parsing paths', async t => {
  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=2:d=4',
    '-c:v', 'libx264', '-g', '2', '-bf', '0',
    '-movflags', '+empty_moov+frag_keyframe+dash',
    '-f', 'mp4', 'pipe:1',
  ]
  const generated = spawnSync('ffmpeg', args, { encoding: null, timeout: 20_000 })
  if (generated.error?.code === 'ENOENT') {
    t.skip('FFmpeg is not installed')
    return
  }
  assert.equal(generated.status, 0, generated.stderr?.toString())
  const fixture = generated.stdout.buffer.slice(
    generated.stdout.byteOffset,
    generated.stdout.byteOffset + generated.stdout.byteLength
  )
  const api = await load(fixture)
  const streamed = await api.preloadInitSegment('https://media.example/video.m4s', { duration: 4 })
  const buffered = await api.parseInitFromBlob(new Blob([fixture]), 4)
  for (const info of [streamed, buffered]) {
    assert.equal(info.sidxCount, 4)
    assert.equal(info.segments.length, 4)
    assert.equal(info.sidxCoverage, 4)
    const mpd = manifest(api, info, 4)
    assert.equal(ranges(mpd).length, 4)
    const reconstructed = Buffer.concat([
      generated.stdout.subarray(0, info.initEnd),
      ...info.segments.map(segment => generated.stdout.subarray(
        segment.byteOffset,
        segment.byteOffset + segment.byteSize
      )),
    ])
    const decoded = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0',
      '-map', '0:v:0', '-f', 'framemd5', 'pipe:1',
    ], { input: reconstructed, encoding: null, timeout: 20_000 })
    assert.equal(decoded.status, 0, decoded.stderr?.toString())
    assert.equal(decoded.stdout.toString().split('\n').filter(line => line && !line.startsWith('#')).length, 8)
  }
})
