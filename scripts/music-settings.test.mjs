import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parse } from '@babel/parser'

test('listening settings include every row from the pinned server page, including loudness normalization', async () => {
  const contract = JSON.parse(await readFile(new URL('./fixtures/music-settings-contract.json', import.meta.url), 'utf8'))
  const source = await readFile(new URL('../src/upstream/modules/music/pages/MusicSettingsPage.tsx', import.meta.url), 'utf8')
  const rows = [...source.matchAll(/<SettingOption name="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(rows, contract.rows)
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  const bindings = []
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'JSXElement' && node.openingElement.name.name === 'SettingOption' &&
      node.openingElement.attributes.some(attribute => attribute.name?.name === 'name' && attribute.value?.value === '音量均衡')) {
      bindings.push(source.slice(node.start, node.end))
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') visit(value)
    }
  }
  visit(ast)
  assert.equal(bindings.length, 1)
  assert.match(bindings[0], /on=\{settings\.volumeNormalize\}/)
  assert.match(bindings[0], /setSettings\(\{ volumeNormalize: !settings\.volumeNormalize \}\)/)
})
