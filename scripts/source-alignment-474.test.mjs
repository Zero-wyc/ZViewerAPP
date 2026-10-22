import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'

const helper = loadTs('src/upstream/lib/antileech-proxy-url.ts', {
  './api': { getApiUrl: () => 'https://selected.test/base' },
}, { URLSearchParams })
const kazumi = loadTs('src/upstream/modules/kazumi/api.ts', {
  '@/lib/api': { getApiUrl: () => 'https://selected.test/base' },
  '@/lib/antileech-proxy-url': helper,
}, { URL, URLSearchParams })
const cms = loadTs('src/upstream/modules/cms/api.ts', {
  '@/lib/api': { getApiUrl: () => 'https://selected.test/base' },
  '@/lib/antileech-proxy-url': helper,
}, { URL, URLSearchParams })

function harness() {
  const state = { fail: false, calls: [], media: { url: 'https://cdn.test/episode.m3u8', format: 'hls',
    headers: { Referer: 'https://source.test/', 'User-Agent': 'media-agent', Origin: 'https://source.test', Cookie: 'source-session=1' } } }
  const resolve = async (...args) => {
    state.calls.push(args)
    if (state.fail) throw new Error('upstream unavailable')
    return state.media
  }
  const api = loadTs('src/upstream/modules/room/watch-together/movie-source-resolver.ts', {
    '@/store/roomStore': {}, '@/lib/mediaFormat': { detectMediaFormat: url => url.includes('m3u8') ? 'hls' : 'mp4' },
    '@/modules/bilibili/bilibiliApi': {}, '@/modules/bilibili/cliApi': {}, '@/modules/bilibili/input': {},
    '@/store/cliAgentStore': {}, '@/modules/bilibili/parseOptions': {}, '@/store/systemSettingsStore': {},
    '../../../../platform/bilibiliProxy': { subscribeEmbeddedProxy() {} }, '@/modules/bilibili/nativeQualityPolicy': {},
    '@/modules/server-files/serverFilesApi': {}, '@/modules/direct-link/directLinkApi': {},
    '@/modules/anisubs': { resolveAniSubsEpisode: resolve,
      buildAniSubsProxyUrl: (url, headers, force) => helper.buildAntileechProxyUrl('anisubs', url, headers, { force, relative: true }) },
    '@/modules/kazumi': { resolveKazumiEpisode: resolve, buildKazumiProxyUrl: kazumi.buildKazumiProxyUrl },
    '@/modules/cms/api': { resolveCmsEpisode: resolve, buildCmsProxyUrl: cms.buildCmsProxyUrl },
  }, { URL, URLSearchParams })
  const movie = { id: 1, url: 'kazumi://source/episode', sourceType: 'kazumi', serverProxy: false, playsvideoEnabled: false,
    sourceMeta: { sourceId: 'source', episode: { id: 'ep1', title: 'Episode', episodeNumber: 1, playbackParams: {} } } }
  return { state, movie, ...api }
}

test('Kazumi and CMS proxies use the selected client server and preserve source headers', () => {
  for (const [module, build] of [['kazumi', kazumi.buildKazumiProxyUrl], ['cms', cms.buildCmsProxyUrl]]) {
    const result = build('https://cdn.test/episode.m3u8', { Referer: 'https://source.test/', Cookie: 'media=1' }, true)
    assert.ok(result.startsWith(`/api/stream/${module}/proxy?`))
    const query = new URL(result, 'https://viewer.test').searchParams
    assert.equal(query.get('url'), 'https://cdn.test/episode.m3u8')
    assert.equal(query.get('cookie'), 'media=1'); assert.equal(query.get('referer'), 'https://source.test/')
    assert.equal(build('https://cdn.test/episode.m3u8'), 'https://cdn.test/episode.m3u8')
  }
})

test('anime preserves explicit false transcoding policy during every fresh resolution', async () => {
  const h = harness()
  for (const serverProxy of [false, true]) {
    const movie = { ...h.movie, sourceType: 'anime', serverProxy }
    const result = await h.resolveMovieSource({ movie, sourceType: 'anime' })
    assert.equal(result.playsvideoEnabled, false)
    assert.equal(result.noProxyFallback, !serverProxy)
    assert.equal(result.sourceUrl.startsWith('/api/stream/anisubs/proxy?'), serverProxy)
  }
})

test('Kazumi metadata resolves first; legacy proxy fallback unwraps, rewraps and retains source headers', async () => {
  const h = harness()
  let result = await h.resolveKazumiOnline(h.movie)
  assert.equal(result.sourceUrl, h.state.media.url); assert.equal(h.state.calls.length, 1)
  const saved = `https://owner.test/base${kazumi.buildKazumiProxyUrl(h.state.media.url, h.state.media.headers, true)}&token=owner-login`
  h.state.fail = true
  for (const sourceMeta of [h.movie.sourceMeta, null]) {
    for (const serverProxy of [true, false]) {
      result = await h.resolveMovieSource({ movie: { ...h.movie, url: saved, sourceMeta, serverProxy }, sourceType: 'kazumi' })
      assert.equal(result.noProxyFallback, !serverProxy); assert.equal(result.playsvideoEnabled, false)
      if (!serverProxy) { assert.equal(result.sourceUrl, h.state.media.url); continue }
      const parsed = new URL(result.sourceUrl, 'https://viewer.test')
      assert.equal(parsed.origin, 'https://viewer.test')
      assert.equal(parsed.searchParams.get('url'), h.state.media.url)
      for (const [query, header] of [['referer', 'Referer'], ['userAgent', 'User-Agent'], ['origin', 'Origin'], ['cookie', 'Cookie']]) {
        assert.equal(parsed.searchParams.get(query), h.state.media.headers[header])
      }
      assert.equal(parsed.searchParams.has('token'), false)
    }
  }
})

test('Kazumi recovery skips placeholders, rejects invalid fallback, and avoids nested saved proxies', async () => {
  const h = harness(); h.state.fail = true
  await assert.rejects(h.resolveKazumiOnline(h.movie), /重新添加/)
  const nested = kazumi.buildKazumiProxyUrl(`https://owner.test${kazumi.buildKazumiProxyUrl(h.state.media.url, h.state.media.headers, true)}`, undefined, true)
  const result = await h.resolveKazumiOnline({ ...h.movie, url: nested, serverProxy: true }, 'kazumi://stale/placeholder')
  assert.equal(new URL(result.sourceUrl, 'https://viewer.test').searchParams.get('url'), h.state.media.url)
  const recovery = await h.resolveKazumiOnline(h.movie, 'https://new.test/fresh.mp4')
  assert.equal(recovery.sourceUrl, 'https://new.test/fresh.mp4')
  for (const url of ['kazumi://source/episode', '/local/media.mp4', 'javascript:alert(1)', '/api/stream/kazumi/proxy?url=kazumi%3A%2F%2Fplaceholder']) {
    await assert.rejects(h.resolveKazumiOnline({ ...h.movie, sourceMeta: null, url }), /有效媒体地址/)
  }
})

test('viewer broadcast policy wins over stale lists in both directions without mutating the record', async () => {
  const h = harness()
  for (const sourceType of ['anime', 'kazumi', 'cms']) {
    for (const noProxyFallback of [false, true]) {
      const movie = { ...h.movie, sourceType, serverProxy: noProxyFallback, playsvideoEnabled: true,
        ...(sourceType === 'cms' ? { sourceMeta: { sourceId: 'source', vodId: 'vod1', episodeIndex: 0, playFromIndex: 0 } } : {}) }
      const result = await h.resolveViewerMovieSource(movie, { noProxyFallback, playsvideoEnabled: false })
      assert.equal(result.noProxyFallback, noProxyFallback)
      assert.equal(result.sourceUrl.startsWith('/api/stream/'), !noProxyFallback)
      assert.equal(result.playsvideoEnabled, false)
      assert.equal(movie.serverProxy, noProxyFallback); assert.equal(movie.playsvideoEnabled, true)
    }
  }
})

test('absent viewer policy retains list defaults; directLink remains independent from serverProxy', async () => {
  const h = harness()
  const result = await h.resolveViewerMovieSource({ ...h.movie, serverProxy: true }, {})
  assert.equal(result.noProxyFallback, false)
  const direct = await h.resolveViewerMovieSource({ ...h.movie, url: 'https://cdn.test/file.mp4', sourceType: 'url', directLink: true }, { noProxyFallback: false })
  assert.equal(direct.sourceUrl, 'https://cdn.test/file.mp4'); assert.equal(direct.noProxyFallback, true)
})

test('legacy viewer can recover from the host media URL when its record only has a placeholder', async () => {
  const h = harness()
  const result = await h.resolveViewerMovieSource({ ...h.movie, sourceMeta: null }, {
    sourceUrl: `https://owner.test${kazumi.buildKazumiProxyUrl(h.state.media.url, h.state.media.headers, true)}`,
    noProxyFallback: false,
  })
  assert.equal(new URL(result.sourceUrl, 'https://viewer.test').searchParams.get('url'), h.state.media.url)
  assert.ok(result.sourceUrl.startsWith('/api/stream/kazumi/proxy?'))
})

test('relative media proxies preserve each selected server prefix and certificate transport', () => {
  for (const server of ['https://lan.test', 'https://public.test/zviewer']) {
    for (const tunnel of [false, true]) {
      const transport = loadTs('src/platform/connectionTransport.ts', {}, { URL })
      if (tunnel) transport.bindConnectionTransport(server, 'http://127.0.0.1:3399/private' + new URL(server).pathname)
      const urls = loadTs('src/mobile/serverUrl.ts', { '../platform/connectionTransport': transport }, { URL })
      const proxy = loadTs('src/upstream/modules/player/services/url-proxy.ts', {
        '../../../../platform/connectionTransport': transport,
        '../../../../mobile/serverUrl': urls,
        '@/lib/api': { getApiUrl: () => transport.connectionUrl(server) },
      }, { URL, URLSearchParams, localStorage: { getItem: () => 'viewer-access' } })
      for (const build of [kazumi.buildKazumiProxyUrl, cms.buildCmsProxyUrl]) {
        const relative = build('https://cdn.test/media.m3u8', undefined, true)
        const actual = proxy.appendAuthToken(relative)
        const logical = new URL(transport.logicalConnectionUrl(actual))
        assert.equal(logical.origin, new URL(server).origin)
        assert.equal(logical.pathname, new URL(server).pathname.replace(/\/$/, '') + new URL(relative, server).pathname)
        assert.equal(logical.searchParams.get('token'), 'viewer-access')
        assert.equal(logical.searchParams.get('url'), 'https://cdn.test/media.m3u8')
        assert.ok(!logical.searchParams.get('url').includes('viewer-access'))
        if (tunnel) assert.ok(actual.startsWith('http://127.0.0.1:3399/private'))
      }
      assert.equal(proxy.appendAuthToken('https://cdn.test/media.m3u8'), 'https://cdn.test/media.m3u8')
    }
  }
})
