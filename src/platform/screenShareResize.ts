import type { ScreenShareVideoOptions } from './contracts'
import { screenShareVideoConstraints } from './screenShareQuality'

/** Resize the existing track; serialize native requests and discard obsolete rotations. */
export function createScreenShareResizer(options: {
  track: Pick<MediaStreamTrack, 'applyConstraints' | 'readyState'>
  quality: ScreenShareVideoOptions
  current: () => boolean
  applied: () => void
  failed: () => void
}) {
  let stopped = false, revision = 0, desired = ''
  let task = Promise.resolve()
  return {
    update(width: number, height: number): Promise<void> {
      if (stopped || !options.current() || options.track.readyState !== 'live' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return Promise.resolve()
      width = Math.round(width); height = Math.round(height)
      const key = `${width}x${height}`
      if (key === desired) return task
      desired = key
      const version = ++revision
      const current = () => !stopped && version === revision && options.current() && options.track.readyState === 'live'
      task = task.then(async () => {
        if (!current()) return
        await options.track.applyConstraints(screenShareVideoConstraints(options.quality, width, height))
        if (current()) options.applied()
      }).catch(() => {
        if (current()) { desired = ''; options.failed() }
      })
      return task
    },
    stop() { stopped = true; revision++ },
  }
}
