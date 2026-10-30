interface NativeStallRecoveryOptions {
  video: HTMLVideoElement
  read: () => { key: string; eligible: boolean }
  recover: (error: Error) => Promise<void>
  onError: (error: Error) => void
}

/** Recover silent native stalls once per stopped-progress episode. */
export function attachNativeStallRecovery({
  video,
  read,
  recover,
  onError,
}: NativeStallRecoveryOptions): () => void {
  const frames = () => video.getVideoPlaybackQuality?.().totalVideoFrames ??
    (video as HTMLVideoElement & { webkitDecodedFrameCount?: number }).webkitDecodedFrameCount ?? 0
  let key = read().key
  let lastTime = video.currentTime
  let lastFrames = frames()
  let progressAt = Date.now()
  let attempted = false
  let running = false
  let disposed = false

  const interval = setInterval(() => {
    const state = read()
    const time = video.currentTime
    const decodedFrames = frames()
    const progressed = time > lastTime + 0.05 || decodedFrames > lastFrames
    if (state.key !== key || progressed) {
      key = state.key
      progressAt = Date.now()
      attempted = false
    }
    lastTime = time
    lastFrames = decodedFrames
    if (!state.eligible || !video.isConnected || video.paused || video.ended || video.seeking || running) {
      progressAt = Date.now()
      return
    }
    if (attempted || Date.now() - progressAt < 20000) return
    attempted = true
    running = true
    const recoveryKey = key
    void Promise.resolve().then(() => {
      if (disposed || read().key !== recoveryKey || !read().eligible) return
      return recover(new Error('B站视频持续缓冲，正在重新解析播放地址'))
    }).catch(error => {
      if (!disposed && read().key === recoveryKey) onError(error instanceof Error ? error : new Error(String(error)))
    }).finally(() => { running = false })
  }, 1000)

  return () => {
    disposed = true
    clearInterval(interval)
  }
}
