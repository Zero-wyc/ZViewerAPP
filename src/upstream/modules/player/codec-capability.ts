/** A capability declaration is a preflight, not proof of hardware HDR output. */
export type CodecDecodeSupport = 'supported' | 'unsupported' | 'unknown'

const VIDEO_CODEC = /^(avc[13]|hvc1|hev1|av01|vp09|dvhe|dvh1)\./i

export function getVideoCodecSupport(codec?: string | null, mse = true): CodecDecodeSupport {
  // Old responses and friendly codec names do not identify a decoder profile.
  if (!codec?.trim()) return 'unknown'
  const codecs = codec.split(',').map(value => value.trim()).filter(Boolean)
  if (!codecs.length || !codecs.every(value => VIDEO_CODEC.test(value))) return 'unknown'
  try {
    if (mse) {
      if (typeof MediaSource === 'undefined' || typeof MediaSource.isTypeSupported !== 'function') return 'unknown'
      return codecs.every(value => MediaSource.isTypeSupported(`video/mp4; codecs="${value}"`)) ? 'supported' : 'unsupported'
    }
    if (typeof document === 'undefined') return 'unknown'
    const video = document.createElement('video')
    if (typeof video.canPlayType !== 'function') return 'unknown'
    return codecs.every(value => !!video.canPlayType(`video/mp4; codecs="${value}"`)) ? 'supported' : 'unsupported'
  } catch {
    return 'unknown'
  }
}

export class UnsupportedVideoCodecError extends Error {
  constructor() {
    super('当前设备无法解码该画质，已保持原播放设置')
    this.name = 'UnsupportedVideoCodecError'
  }
}

export function assertVideoCodecSupported(source: { videoCodec?: string; format?: string }, mse = source.format === 'dash'): void {
  if (getVideoCodecSupport(source.videoCodec, mse) === 'unsupported') throw new UnsupportedVideoCodecError()
}
