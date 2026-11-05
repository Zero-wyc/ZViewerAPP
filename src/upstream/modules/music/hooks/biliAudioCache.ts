import { getBilibiliUrlDeadline } from '@/modules/playback-memory/services/url-expiry'

interface StreamEntry {
  url: string
  at: number
}
const streams = new Map<string, StreamEntry>()
const standby = new Map<string, StreamEntry>()
const generations = new Map<string, number>()
const videoSources = new Map<string, { source: Record<string, unknown>; at: number }>()

function usable(entry: StreamEntry, ttl: number): boolean {
  const deadline = getBilibiliUrlDeadline(entry.url)
  return deadline != null ? Date.now() < deadline - 60_000 : Date.now() - entry.at < ttl
}

export function getCachedBiliAudioUrl(key: string): string | null {
  const entry = streams.get(key)
  if (!entry) return null
  if (usable(entry, 2 * 60 * 60_000)) return entry.url
  streams.delete(key)
  return null
}

export function isBiliAudioStale(key: string): boolean {
  const entry = streams.get(key)
  if (!entry) return false
  const deadline = getBilibiliUrlDeadline(entry.url)
  return deadline != null ? Date.now() >= deadline - 15 * 60_000 : Date.now() - entry.at >= 40 * 60_000
}

export function setCachedBiliAudioUrl(key: string, url: string): void {
  streams.set(key, { url, at: Date.now() })
}

export function beginBiliResolve(key: string): number {
  const generation = (generations.get(key) ?? 0) + 1
  generations.set(key, generation)
  return generation
}

export function commitBiliResolve(key: string, generation: number, url: string): boolean {
  if (generations.get(key) !== generation) return false
  setCachedBiliAudioUrl(key, url)
  return true
}

export function invalidateBiliAudioUrl(key: string): void {
  beginBiliResolve(key)
  streams.delete(key)
  standby.delete(key)
}

export function setBiliStandbyUrl(key: string, url: string): void {
  standby.set(key, { url, at: Date.now() })
}

export function takeBiliStandbyUrl(key: string): string | null {
  const entry = standby.get(key)
  standby.delete(key)
  return entry && usable(entry, 40 * 60_000) ? entry.url : null
}

export function getCachedBiliVideoSource<T>(key: string): T | null {
  const entry = videoSources.get(key)
  const source = entry?.source
  if (!entry || !source || Date.now() - entry.at >= 10 * 60_000 ||
    !usable({ url: String(source.url), at: entry.at }, 10 * 60_000) ||
    (source.audioUrl && !usable({ url: String(source.audioUrl), at: entry.at }, 10 * 60_000))) return null
  return source as T
}

export function setCachedBiliVideoSource(key: string, source: Record<string, unknown>): void {
  videoSources.set(key, { source, at: Date.now() })
}

export function clearBiliAudioCache(): void {
  // Keep generations monotonic so a parse started before logout cannot commit.
  for (const key of generations.keys()) beginBiliResolve(key)
  streams.clear()
  standby.clear()
  videoSources.clear()
}
