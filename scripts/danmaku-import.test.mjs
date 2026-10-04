import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './test-ts-module.mjs'
const { parseLocalDanmaku } = loadTs('src/upstream/modules/danmaku/localImport.ts')

test('Bilibili XML sorts, decodes entities, and retains top/bottom modes', () => {
  const result = parseLocalDanmaku('<i><d p="2,5,25,255">上 &amp; 下</d><d p="1,4,25,16777215">底</d></i>')
  assert.deepEqual(Array.from(result.items, i => [i.time, i.mode, i.content]), [[1,4,'底'],[2,5,'上 & 下']])
})
test('Bilibili progress is milliseconds; invalid entries and unsupported BAS are filtered', () => {
  const result = parseLocalDanmaku(JSON.stringify({ elements: [{ id: 1, progress: 2500, content: 'ok' }, { time: -1, content: 'bad' }, { time: 1, mode: 9, content: 'BAS' }] }))
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].time, 2.5)
})
test('dandanplay tolerates invalid records, rejects empty/malformed input and limits file bytes', () => {
  assert.equal(parseLocalDanmaku('{"comments":[null,{"p":"1,1,255","m":"弹幕"}]}').items[0].content, '弹幕')
  for (const input of ['', '{bad', '<i></i>']) assert.throws(() => parseLocalDanmaku(input))
  assert.throws(() => parseLocalDanmaku('x'.repeat(5 * 1024 * 1024 + 1)), /5 MB/)
})
test('over-limit input is sorted before taking the earliest 20000 comments', () => {
  const result = parseLocalDanmaku(JSON.stringify(Array.from({ length: 20002 }, (_, i) => ({ time: 20002 - i, content: 'ok' }))))
  assert.equal(result.items.length, 20000)
  assert.equal(result.items[0].time, 1)
  assert.equal(result.truncated, 2)
})
