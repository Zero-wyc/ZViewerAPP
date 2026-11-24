import type { ResolvedSource } from './types'

export interface CliCandidateItem {
  primaryUrl: string
  backupUrls: string[]
}

type CandidateSource = Pick<ResolvedSource, 'videoUrl' | 'audioUrl' | 'videoBackupUrls' | 'audioBackupUrls'>

const registeredCandidateKeys = new Set<string>()
const REGISTERED_CANDIDATE_LIMIT = 512

export function unwrapCliProxyUrl(proxyPrefix: string, raw: string): string {
  if (!raw.startsWith(proxyPrefix)) return raw
  const encoded = raw.slice(proxyPrefix.length).split('&', 1)[0]
  try {
    return decodeURIComponent(encoded)
  } catch {
    return raw
  }
}

export function buildCandidateItems(proxyUrl: string, resolved: CandidateSource): CliCandidateItem[] {
  const base = proxyUrl.replace(/\/$/, '')
  const prefix = `${base}/proxy?url=`
  const items: CliCandidateItem[] = []
  const collect = (primary?: string, backups?: string[]) => {
    if (typeof primary !== 'string' || !primary || !Array.isArray(backups) || backups.length === 0) return
    const primaryUrl = unwrapCliProxyUrl(prefix, primary)
    if (!primaryUrl) return
    const backupUrls = [
      ...new Set(
        backups
          .filter((url): url is string => typeof url === 'string' && url.length > 0)
          .map(url => unwrapCliProxyUrl(prefix, url))
          .filter(Boolean)
      ),
    ]
    if (!backupUrls.some(url => url !== primaryUrl)) return
    const key = `${base}|${primaryUrl}`
    if (registeredCandidateKeys.has(key)) return
    if (registeredCandidateKeys.size >= REGISTERED_CANDIDATE_LIMIT) registeredCandidateKeys.clear()
    registeredCandidateKeys.add(key)
    items.push({ primaryUrl, backupUrls })
  }

  collect(resolved.videoUrl, resolved.videoBackupUrls)
  collect(resolved.audioUrl, resolved.audioBackupUrls)
  return items
}

/** 仅供单测重置登记状态。 */
export function resetRegisteredCandidates(): void {
  registeredCandidateKeys.clear()
}

export function registerCliCandidates(proxyUrl: string, resolved: CandidateSource): void {
  const base = typeof proxyUrl === 'string' ? proxyUrl.replace(/\/$/, '') : ''
  if (!base) return
  let items: CliCandidateItem[]
  try {
    items = buildCandidateItems(base, resolved)
  } catch (err) {
    console.debug('[cliCandidates] 候选地址登记失败（不影响播放）:', err)
    return
  }
  if (items.length === 0) return

  void (async () => {
    try {
      const res = await fetch(`${base}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      for (const item of items) registeredCandidateKeys.delete(`${base}|${item.primaryUrl}`)
      console.debug('[cliCandidates] 候选地址登记失败（不影响播放）:', err)
    }
  })()
}
