import {
  ALL_FORMATS, BufferSource, BufferTarget, EncodedAudioPacketSource,
  EncodedPacketSink, Input, Mp4OutputFormat, Output,
} from 'mediabunny'

export async function remuxFlac(data) {
  const input = new Input({ source: new BufferSource(data), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    const config = await track.getDecoderConfig()
    const target = new BufferTarget()
    const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: 'fragmented' }) })
    const source = new EncodedAudioPacketSource('flac')
    output.addAudioTrack(source)
    await output.start()
    for await (const packet of new EncodedPacketSink(track).packets()) {
      await source.add(packet, { decoderConfig: config })
    }
    await output.finalize()
    return target.buffer
  } finally {
    input.dispose()
  }
}
