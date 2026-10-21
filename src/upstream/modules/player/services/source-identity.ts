import type { PlayerSource } from '../types'

/** Progress and callbacks do not identify a loader; routing and engine inputs do. */
export function isSamePlayerSource(a: PlayerSource | null, b: PlayerSource): boolean {
  if (!a) return false
  const fields = ['url', 'audioUrl', 'format', 'videoCodec', 'audioCodec', 'isLive',
    'videoBlob', 'audioBlob', 'playsvideoEnabled', 'noProxyFallback'] as const
  if (fields.some(key => a[key] !== b[key])) return false
  const keys = Object.keys(a.headers ?? {})
  return keys.length === Object.keys(b.headers ?? {}).length &&
    keys.every(key => a.headers?.[key] === b.headers?.[key])
}
