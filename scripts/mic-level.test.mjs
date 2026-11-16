import test from 'node:test'
import assert from 'node:assert/strict'
import { publishMicAnalyser, hasMicLevel, readMicLevel } from '../src/upstream/modules/voice-chat/lib/mic-level.ts'

test('voice lip sync uses the active analyser and stops immediately when muted or released', () => {
  publishMicAnalyser(null)
  assert.equal(hasMicLevel(), false)
  assert.equal(readMicLevel(), 0)
  let reads = 0
  const analyser = { fftSize: 4, getByteTimeDomainData: buffer => { reads++; buffer.fill(160) } }
  publishMicAnalyser(analyser)
  assert.equal(hasMicLevel(), true)
  assert.equal(readMicLevel(), 1)
  assert.equal(reads, 1)
  publishMicAnalyser(null)
  assert.equal(hasMicLevel(), false)
  assert.equal(readMicLevel(), 0)
  assert.equal(reads, 1)
})

test('changing capture format replaces the sample buffer and silence produces zero', () => {
  const sizes = []
  const analyser = { fftSize: 4, getByteTimeDomainData: buffer => { sizes.push(buffer.length); buffer.fill(128) } }
  publishMicAnalyser(analyser)
  assert.equal(readMicLevel(), 0)
  analyser.fftSize = 16
  assert.equal(readMicLevel(), 0)
  assert.deepEqual(sizes, [4, 16])
  publishMicAnalyser(null)
})
