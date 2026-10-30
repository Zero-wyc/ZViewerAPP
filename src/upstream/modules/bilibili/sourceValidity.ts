/** Leave enough time to attach and start fetching before a signed URL expires. */
export function isBilibiliUrlFresh(raw: string, now = Date.now()): boolean {
  try {
    let url = new URL(raw)
    for (let depth = 0; depth < 4 && url.pathname.endsWith('/proxy'); depth++) {
      const target = url.searchParams.get('url')
      if (!target) return false
      url = new URL(target)
    }
    if (!['https:', 'http:'].includes(url.protocol)) return false
    if (!url.searchParams.has('deadline')) return true
    const deadline = Number(url.searchParams.get('deadline'))
    return Number.isFinite(deadline) && deadline * 1000 > now + 60_000
  } catch {
    return false
  }
}

export function hasFreshBilibiliSource(source: { videoUrl: string; audioUrl?: string }): boolean {
  return isBilibiliUrlFresh(source.videoUrl) && (!source.audioUrl || isBilibiliUrlFresh(source.audioUrl))
}
