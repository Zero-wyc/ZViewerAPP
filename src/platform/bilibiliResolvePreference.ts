import { useSyncExternalStore } from 'react'
import { useCliAgentStore } from '@/store/cliAgentStore'
import { useSystemSettingsStore } from '@/store/systemSettingsStore'
import { getEmbeddedProxyStatus, isEmbeddedBilibiliHost } from './bilibiliProxy'

export type BilibiliResolveSource = 'host' | 'local'

const STORAGE_KEY = 'zviewer:bilibili-resolve-source'
const CHANGE_EVENT = 'zviewer:bilibili-resolve-source-change'

function normalizeSource(value: unknown): BilibiliResolveSource {
  return value === 'local' ? 'local' : 'host'
}

export function getBilibiliResolvePreference(): BilibiliResolveSource {
  try {
    return normalizeSource(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'host'
  }
}

export function setBilibiliResolvePreference(source: BilibiliResolveSource): void {
  try {
    localStorage.setItem(STORAGE_KEY, normalizeSource(source))
  } catch {
    // Storage may be unavailable in restricted WebViews.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribePreference(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function useBilibiliResolvePreference(): BilibiliResolveSource {
  return useSyncExternalStore(subscribePreference, getBilibiliResolvePreference, () => 'host')
}

/** Embedded CLI preference is stored by the app; desktop CLI reports its source at registration. */
export function getBilibiliResolveSource(): BilibiliResolveSource {
  if (useSystemSettingsStore.getState().allowCliHostResolve === false) return 'local'
  if (isEmbeddedBilibiliHost()) return getBilibiliResolvePreference()
  const agent = useCliAgentStore.getState().agents[0]
  // Older CLI agents omit the field and retain their historical local-cookie behavior.
  return agent?.resolveSource === 'host' ? 'host' : 'local'
}

/** Build an ephemeral local forwarding URL; callers must keep it out of room state. */
export function buildBilibiliLiveProxyUrl(streamUrl: string, proxyUrl: string): string {
  const query = new URLSearchParams({ url: streamUrl, ref: 'live' })
  return `${proxyUrl.replace(/\/$/, '')}/proxy?${query.toString()}`
}

export async function getBilibiliLiveProxyUrl(streamUrl: string): Promise<string | null> {
  let proxyUrl: string | null = null
  let sessionVersion: number | null = null
  if (isEmbeddedBilibiliHost()) {
    const status = getEmbeddedProxyStatus()
    if (status.ready && status.proxyUrl) proxyUrl = status.proxyUrl
    sessionVersion = status.sessionVersion
  } else {
    const agent = useCliAgentStore.getState().agents[0]
    if (agent?.proxyUrl) {
      try {
        const url = new URL(agent.proxyUrl)
        url.hostname = '127.0.0.1'
        proxyUrl = url.toString().replace(/\/$/, '')
      } catch {
        proxyUrl = agent.proxyUrl.replace(/\/$/, '')
      }
    }
  }
  if (!proxyUrl) return null
  if (!isEmbeddedBilibiliHost()) return buildBilibiliLiveProxyUrl(streamUrl, proxyUrl)

  try {
    const response = await fetch(`${proxyUrl}/authorize-live?url=${encodeURIComponent(streamUrl)}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok || getEmbeddedProxyStatus().sessionVersion !== sessionVersion) return null
    return buildBilibiliLiveProxyUrl(streamUrl, proxyUrl)
  } catch {
    return null
  }
}
