interface FrameProcessor { readable: ReadableStream<{ close(): void; displayWidth?: number; displayHeight?: number }> }

/** Count native VideoFrames without reading pixels, encoding another stream, or touching the sending track. */
export function createScreenShareFrameMeter(track: MediaStreamTrack) {
  const Processor = (globalThis as unknown as { MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack }) => FrameProcessor }).MediaStreamTrackProcessor
  if (!Processor) return undefined
  const clone = track.clone()
  let reader: ReadableStreamDefaultReader<{ close(): void; displayWidth?: number; displayHeight?: number }>
  try { reader = new Processor({ track: clone }).readable.getReader() }
  catch { clone.stop(); return undefined }
  let active = true, frames = 0, lastFrames = 0, sampled = false, rate = 0, lastTime = performance.now()
  let dimensions: { width: number; height: number } | undefined
  const stop = () => {
    if (!active) return
    active = false
    clone.stop()
    void reader.cancel().catch(() => {})
  }
  void (async () => {
    try {
      while (active) {
        const result = await reader.read()
        if (result.done) break
        try {
          if (active) {
            frames++
            const { displayWidth: width, displayHeight: height } = result.value
            if (width && height) dimensions = { width, height }
          }
        } finally { result.value.close() }
      }
    } catch { /* An unavailable meter never interrupts capture. */ }
    finally { stop() }
  })()
  return {
    sample() {
      const now = performance.now(), elapsed = now - lastTime
      if (!active) return undefined
      if (elapsed >= 500) { rate = Math.round((frames - lastFrames) * 10000 / elapsed) / 10; lastFrames = frames; lastTime = now; sampled = true }
      return sampled ? rate : undefined
    },
    stop,
    dimensions: () => active ? dimensions : undefined,
  }
}
