import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDefaultSubtitleFontSize } from '../src/upstream/modules/subtitles/defaults.ts'

test('phones use 12px in both orientations', () => {
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [599, 960]]) {
    assert.equal(getDefaultSubtitleFontSize(width, height), 12)
    assert.equal(getDefaultSubtitleFontSize(height, width), 12)
  }
})

test('tablets use 15px in both orientations', () => {
  for (const [width, height] of [[600, 960], [768, 1024], [800, 1280]]) {
    assert.equal(getDefaultSubtitleFontSize(width, height), 15)
    assert.equal(getDefaultSubtitleFontSize(height, width), 15)
  }
})
