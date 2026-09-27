import { useSyncExternalStore } from 'react'
import { getEmbeddedProxyStatus, subscribeEmbeddedProxy } from '../../../platform/bilibiliProxy'

export type NativeQualityPolicy = { mode: 'autoMax' | 'manual'; qn?: number; fallbackQn?: number }
const selections = new Map<number, NativeQualityPolicy>()
const revisions = new Map<number, number>()
export function getQualitySelectionRevision(movieId: number) { return revisions.get(movieId) ?? 0 }
const listeners = new Set<() => void>()
const automatic: NativeQualityPolicy = Object.freeze({ mode: 'autoMax' })
let version = 0
function changed() { version++; for (const listener of listeners) listener() }
export function getNativeQualityPolicy(movieId: number): NativeQualityPolicy { return selections.get(movieId) ?? automatic }
export function selectNativeQuality(movieId: number, qn?: number) {
  selections.set(movieId, qn ? { mode: 'manual', qn } : automatic)
  revisions.set(movieId, getQualitySelectionRevision(movieId) + 1)
  changed()
}
export function restoreNativeQuality(movieId: number, policy: NativeQualityPolicy) { selections.set(movieId, policy); changed() }
export function fallbackNativeQuality(movieId: number, qn = 64) {
  if (getNativeQualityPolicy(movieId).mode !== 'autoMax') return
  selections.set(movieId, { mode: 'autoMax', fallbackQn: qn }); changed()
}
const actual = new Map<number, { qn: number; qualities: Array<{ id: number; label: string; resolution?: string }> }>()
export function recordNativeQuality(movieId: number, qn: number, qualities: Array<{ id: number; label: string; resolution?: string }>) {
  const next = { qn, qualities }
  if (JSON.stringify(actual.get(movieId)) === JSON.stringify(next)) return
  actual.set(movieId, next); changed()
}
export function getActualNativeQuality(movieId: number) { return actual.get(movieId) }
export function useNativeQualityPolicy(movieId: number) {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => version, () => version)
  return getNativeQualityPolicy(movieId)
}
export function nativeQualityCacheKey(movieId: number) {
  const proxy = getEmbeddedProxyStatus(), policy = getNativeQualityPolicy(movieId)
  return `${proxy.sessionVersion}|${policy.mode}|${policy.qn ?? ''}|${policy.fallbackQn ?? ''}`
}
// Session policy never survives an account switch or logout.
let previousSession = getEmbeddedProxyStatus().sessionVersion
let wasLoggedIn = getEmbeddedProxyStatus().loggedIn
subscribeEmbeddedProxy(() => {
  const status = getEmbeddedProxyStatus()
  const next = status.sessionVersion
  if (next !== previousSession) {
    previousSession = next; actual.clear()
    if (wasLoggedIn || !status.loggedIn) { selections.clear(); revisions.clear() }
    changed()
  }
  wasLoggedIn = status.loggedIn
})

export interface VideoCapability { codec: string; maxWidth: number; maxHeight: number; maxFrameRate: number }
let capabilities: Promise<VideoCapability[]> | null = null
export function getWebViewCapabilities(): Promise<VideoCapability[]> {
  if (!capabilities) capabilities = probeCapabilities()
  return capabilities
}
async function probeCapabilities(): Promise<VideoCapability[]> {
  const result: VideoCapability[] = []
  const codecs = [{ name: 'avc', mime: 'avc1.640033' }, { name: 'hevc', mime: 'hvc1.1.6.L153.B0' }, { name: 'av1', mime: 'av01.0.12M.08' }]
  for (const codec of codecs) {
    const contentType = `video/mp4; codecs="${codec.mime}"`
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(contentType)) continue
    for (const [width, height] of [[1920,1080],[3840,2160],[7680,4320]]) {
      for (const framerate of [30,60]) {
        let supported = false
        try {
          if (navigator.mediaCapabilities?.decodingInfo) {
            const info = await navigator.mediaCapabilities.decodingInfo({ type: 'media-source', video: { contentType, width, height, bitrate: width * height * 6, framerate } })
            supported = info.supported && info.smooth
          } else supported = codec.name === 'avc' && width === 1920 && framerate === 30
        } catch { supported = codec.name === 'avc' && width === 1920 && framerate === 30 }
        if (supported) result.push({ codec: codec.name, maxWidth: width, maxHeight: height, maxFrameRate: framerate })
      }
    }
  }
  return result
}
