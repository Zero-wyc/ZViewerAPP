import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm'
import { getAniSubsSearchResultKey } from '../src/upstream/modules/anisubs/source-key.ts'

async function load(file, imports, globals = {}) {
  const context = createContext({ Response, URL, URLSearchParams, ...globals })
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context })
  await module.link(specifier => {
    const values = imports[specifier]
    assert.ok(values, `Unexpected import ${specifier}`)
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return module.namespace
}

test('aggregate API calls the additive endpoint and preserves source metadata', async () => {
  const calls = []
  const api = await load('../src/upstream/modules/anisubs/api.ts', {
    '@/lib/api': {
      getApiUrl: () => 'https://server.invalid',
      apiFetch: async (url, options) => {
        calls.push({ url, options })
        return Response.json({
          success: true,
          results: [{
            id: '17', title: 'Example', source: 'source-a',
            sourceName: 'Source A', altSources: ['Source B'],
          }],
        })
      },
    },
  })

  const results = await api.searchAllAniSubs('番剧 & season')
  const request = new URL(calls[0].url)
  assert.equal(request.pathname, '/api/stream/anisubs/search-all')
  assert.equal(request.searchParams.get('keyword'), '番剧 & season')
  assert.equal(calls.length, 1)
  assert.equal(results[0].source, 'source-a')
  assert.equal(results[0].sourceName, 'Source A')
  assert.deepEqual(Array.from(results[0].altSources), ['Source B'])
})

test('aggregate API rejects failed and malformed responses', async () => {
  let response = Response.json({ success: false, message: 'upstream unavailable' }, { status: 502 })
  const api = await load('../src/upstream/modules/anisubs/api.ts', {
    '@/lib/api': { getApiUrl: () => '', apiFetch: async () => response },
  })
  await assert.rejects(api.searchAllAniSubs('title'), /upstream unavailable/)
  response = Response.json({ success: true, results: null })
  await assert.rejects(api.searchAllAniSubs('title'), /聚合搜索失败/)
})

test('aggregate source is the default option and specific sources retain single-site search', async () => {
  const calls = []
  const aggregate = await load('../src/upstream/modules/anisubs/aggregate-search.ts', {
    './api': {
      getAniSubsSources: async () => [{ id: 'site-a', name: 'Site A' }],
      searchAllAniSubs: async keyword => { calls.push(['all', keyword]); return [] },
      searchAniSubs: async (source, keyword) => { calls.push([source, keyword]); return [] },
    },
  })

  const sources = await aggregate.getAniSubsSourcesWithAggregate()
  assert.equal(sources[0].id, '__all__')
  assert.equal(sources[0].name, '全部站点（聚合搜索）')
  assert.equal(sources[1].id, 'site-a')
  await aggregate.searchAniSubsBySource('__all__', 'all-title')
  await aggregate.searchAniSubsBySource('site-a', 'single-title')
  assert.deepEqual(calls, [['all', 'all-title'], ['site-a', 'single-title']])
})

test('result paths separate colliding site-local IDs and retain source fallback', () => {
  const first = getAniSubsSearchResultKey({ id: '17', source: 'site-a' }, '__all__')
  const second = getAniSubsSearchResultKey({ id: '17', source: 'site-b' }, '__all__')
  assert.notEqual(first, second)
  assert.equal(getAniSubsSearchResultKey({ id: '17', source: '' }, 'site-a'), first)
})

test('episode browsing uses the result source and mobile browser interaction hooks remain mounted', async () => {
  const source = await readFile(
    new URL('../src/upstream/modules/room/components/AnimeSourceBrowser.tsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /getEpisodes\(show\.source \|\| sourceId, show\.id\)/)
  assert.match(source, /show\.sourceName/)
  assert.match(source, /searchOnSourceChange/)
  assert.match(source, /preserveSearchTerm/)
  assert.match(source, /onSelectFiles=\{addFiles\}/)
  assert.match(source, /mountId=\{/)
})
