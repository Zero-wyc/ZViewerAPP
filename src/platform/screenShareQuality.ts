import type { ScreenShareStart, ScreenShareVideoOptions } from './contracts'

export const screenShareResolutions = [
  { value: 'native', label: '本机' },
  { value: '720p', label: '720P' },
  { value: '1080p', label: '1080P' },
  { value: '1440p', label: '2K（1440P）' },
  { value: '2160p', label: '4K（2160P）' },
] as const
export const screenShareFrameRates = [30, 60, 90] as const

export function screenShareVideoOptions(options: Pick<ScreenShareStart, 'resolution' | 'frameRate'>): ScreenShareVideoOptions {
  return {
    resolution: screenShareResolutions.some(value => value.value === options.resolution) ? options.resolution! : '720p',
    frameRate: screenShareFrameRates.includes(options.frameRate!) ? options.frameRate! : 30,
  }
}

/** A bounding box, never a crop or an upscale. Native display capture preserves its source aspect ratio. */
export function screenShareVideoConstraints(options: ScreenShareVideoOptions, screenWidth: number, screenHeight: number): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = { frameRate: { ideal: options.frameRate, max: options.frameRate } }
  if (options.resolution === 'native') {
    // Request the physical display size as an ideal only: single-window capture may be smaller.
    if (screenWidth > 0 && screenHeight > 0) { constraints.width = { ideal: screenWidth }; constraints.height = { ideal: screenHeight } }
    return constraints
  }
  const bounds = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160] }[options.resolution]
  const [width, height] = screenHeight > screenWidth ? [bounds[1], bounds[0]] : bounds
  constraints.width = { ideal: width, max: width }
  constraints.height = { ideal: height, max: height }
  return constraints
}
