/** Upstream resolve currently calls a direct MediaSource parameter ms; Emby expects MediaSourceId. */
export function normalizeMediaLibraryDirectUrl(raw?: string): string | undefined {
  if (!raw) return raw
  try {
    const url = new URL(raw)
    const source = url.searchParams.get('ms')
    if (source) {
      if (!url.searchParams.has('MediaSourceId')) url.searchParams.set('MediaSourceId', source)
      url.searchParams.delete('ms')
    }
    return url.href
  } catch { return raw }
}
