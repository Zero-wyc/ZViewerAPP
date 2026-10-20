import type { ScreenShareVideoOptions } from './contracts'

/** The capture canvas may remain at its initial aspect ratio after the physical display rotates. */
export function screenShareFrameGeometry(width: number, height: number, screenWidth: number, screenHeight: number, quality: ScreenShareVideoOptions) {
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  let cropWidth = even(width), cropHeight = even(height)
  const aspect = screenWidth > 0 && screenHeight > 0 ? screenWidth / screenHeight : width / height
  // Ignore subpixel/encoder rounding. Remove only the system canvas padding,
  // retaining padding belonging to the app/video within the physical screen.
  if (Math.abs(width / height / aspect - 1) > .02) {
    if (width / height < aspect) cropHeight = even(width / aspect)
    else cropWidth = even(height * aspect)
  }
  const bounds = quality.resolution === 'native' ? undefined : { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160] }[quality.resolution]
  const scale = bounds ? Math.min(1, bounds[0] / Math.max(cropWidth, cropHeight), bounds[1] / Math.min(cropWidth, cropHeight)) : 1
  return {
    x: Math.floor((width - cropWidth) / 4) * 2, y: Math.floor((height - cropHeight) / 4) * 2,
    cropWidth, cropHeight, width: even(cropWidth * scale), height: even(cropHeight * scale),
  }
}

interface VideoProcessor { readable: ReadableStream<VideoFrame> }
interface VideoGenerator extends MediaStreamTrack { writable: WritableStream<VideoFrame> }
type VideoGlobals = {
  MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack; maxBufferSize: number }) => VideoProcessor
  MediaStreamTrackGenerator?: new (options: { kind: 'video' }) => VideoGenerator
}

export function screenShareVideoTransformSupported() {
  const native = globalThis as unknown as VideoGlobals
  return !!native.MediaStreamTrackProcessor && !!native.MediaStreamTrackGenerator && typeof VideoFrame === 'function'
}

/** Forward native frames with a visible rectangle; no canvas timer, pixel readback or second capture. */
export function createScreenShareVideoTransform(source: MediaStreamTrack, options: {
  quality: ScreenShareVideoOptions
  width: number
  height: number
  current: () => boolean
  applied: () => void
  failed: () => void
}) {
  const native = globalThis as unknown as VideoGlobals
  if (!screenShareVideoTransformSupported()) throw new Error('当前系统不支持屏幕共享视频帧处理')
  const clone = source.clone()
  let reader: ReadableStreamDefaultReader<VideoFrame> | undefined
  let output: VideoGenerator | undefined
  let writer: WritableStreamDefaultWriter<VideoFrame> | undefined
  let active = true, width = options.width, height = options.height, lastSize = ''
  const stop = () => {
    if (!active) return
    active = false
    clone.stop()
    output?.stop()
    void reader?.cancel().catch(() => {})
    void writer?.abort().catch(() => {})
  }
  try {
    reader = new native.MediaStreamTrackProcessor!({ track: clone, maxBufferSize: 1 }).readable.getReader()
    output = new native.MediaStreamTrackGenerator!({ kind: 'video' })
    writer = output.writable.getWriter()
  } catch (error) { stop(); throw error }
  const track = output
  void (async () => {
    try {
      while (active && options.current()) {
        const result = await reader!.read()
        if (result.done) break
        const frame = result.value
        let converted: VideoFrame | undefined
        try {
          if (!active || !options.current()) break
          const visible = frame.visibleRect!
          const size = screenShareFrameGeometry(visible.width, visible.height, width, height, options.quality)
          converted = new VideoFrame(frame, {
            visibleRect: { x: visible.x + size.x, y: visible.y + size.y, width: size.cropWidth, height: size.cropHeight },
            displayWidth: size.width, displayHeight: size.height,
          })
          await writer!.write(converted)
          const key = `${size.width}x${size.height}`
          if (active && options.current() && key !== lastSize) { lastSize = key; options.applied() }
        } finally { converted?.close(); frame.close() }
      }
      if (active && options.current()) options.failed()
    } catch { if (active && options.current()) options.failed() }
    finally { stop() }
  })()
  return {
    track,
    resize(w: number, h: number) {
      if (active && options.current() && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) { width = w; height = h }
    },
    stop,
  }
}
