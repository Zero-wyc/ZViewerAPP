import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, MkvOutputFormat, Output } from 'mediabunny'
import { demuxBlob, getKeyframeIndex, pickPlayableAudioTrack } from '../vendor/playsvideo/dist/pipeline/demux.js'
import { buildSegmentPlan, synthesizeSegmentBoundaries } from '../vendor/playsvideo/dist/pipeline/segment-plan.js'
import { processSegmentWithAbort } from '../vendor/playsvideo/dist/pipeline/segment-processor.js'

async function loadSource(path) {
  return stripTypeScriptTypes(await readFile(new URL(`../src/upstream/${path}`, import.meta.url), 'utf8'))
}

test('AVI and WMV with a reported audio codec still fail preflight; TS retains its opt-in remux path', async () => {
  const selector = new SourceTextModule(await loadSource('modules/player/engine-selector.ts'))
  const audioCodecs = new SourceTextModule(await loadSource('lib/audioCodecs.ts'))
  const mediaFormat = new SourceTextModule(await loadSource('lib/mediaFormat.ts'))
  const engines = new Map([
    ['./engines/hls-engine', 'hlsEngine'],
    ['./engines/flv-engine', 'flvEngine'],
    ['./engines/direct-engine', 'directEngine'],
    ['./engines/videojs10-engine', 'videojs10Engine'],
    ['./engines/videojs10-dash-engine', 'videojs10DashEngine'],
  ])
  await selector.link(specifier => {
    if (specifier === '@/lib/audioCodecs') return audioCodecs
    if (specifier === './engines/playsvideo-engine') {
      return new SyntheticModule(['isPlaysVideoSupported', 'playsVideoEngine'], function () {
        this.setExport('isPlaysVideoSupported', () => true)
        this.setExport('playsVideoEngine', {})
      })
    }
    const name = engines.get(specifier)
    return new SyntheticModule([name], function () { this.setExport(name, {}) })
  })
  await selector.evaluate()
  await mediaFormat.link(() => { throw new Error('Unexpected media format dependency') })
  await mediaFormat.evaluate()
  const { shouldUsePlaysVideo } = selector.namespace
  const { getUnsupportedFormatMessage, isBrowserPlayableFormat } = mediaFormat.namespace
  for (const format of ['avi', 'wmv']) {
    assert.equal(isBrowserPlayableFormat(format), false)
    assert.equal(shouldUsePlaysVideo({ format, audioCodec: 'dts' }), false)
    assert.match(getUnsupportedFormatMessage(format), /MP4 或 MKV/)
  }
  assert.equal(shouldUsePlaysVideo({ format: 'ts' }), true)
  assert.equal(shouldUsePlaysVideo({ format: 'ts', playsvideoEnabled: false }), false)
})

test('TrueHD falls back to a compatible audio track and reports its codec ID when none is available', async () => {
  const truehd = { codec: 'truehd', internalCodecId: 'A_TRUEHD', getDecoderConfig: async () => ({ codec: 'mlpa' }) }
  const ac3 = { codec: 'ac3', internalCodecId: 'A_AC3', getDecoderConfig: async () => ({ codec: 'ac-3' }) }
  const fallback = await pickPlayableAudioTrack([truehd, ac3])
  assert.equal(fallback.track, ac3)
  const silent = await pickPlayableAudioTrack([truehd])
  assert.equal(silent.track, null)
  assert.deepEqual(silent.unsupportedCodecIds, ['A_TRUEHD'])
})

test('audio-only MKV demuxes and remuxes a later segment into an audio-only MP4', async () => {
  const target = new BufferTarget()
  const output = new Output({ format: new MkvOutputFormat(), target })
  const aac = new EncodedAudioPacketSource('aac')
  output.addAudioTrack(aac)
  await output.start()
  const decoderConfig = { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, description: new Uint8Array([0x11, 0x90]) }
  const frameDuration = 1024 / 48_000
  for (let frame = 0; frame < 120; frame++) {
    const packet = new EncodedPacket(new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]), 'key', frame * frameDuration, frameDuration)
    await aac.add(packet, frame === 0 ? { decoderConfig } : undefined)
  }
  await output.finalize()
  const demux = await demuxBlob(new Blob([target.buffer]))
  try {
    assert.equal(demux.videoTrack, null)
    assert.equal(demux.audioCodec, 'aac')
    const { duration } = await getKeyframeIndex(demux.videoSink, demux.duration)
    const plan = buildSegmentPlan({ durationSec: duration, targetSegmentDurationSec: 1, keyframeTimestampsSec: synthesizeSegmentBoundaries(duration, 1) })
    assert.equal(plan.length, 3)
    const { initSegment, mediaData } = await processSegmentWithAbort({ ...demux, plan, doTranscode: false }, 1)
    const remux = await demuxBlob(new Blob([initSegment, mediaData]))
    try {
      assert.equal(remux.videoTrack, null)
      assert.equal(remux.audioCodec, 'aac')
      assert.ok(await remux.audioSink.getFirstPacket())
    } finally {
      remux.dispose()
    }
  } finally {
    demux.dispose()
  }
})
