/** Only dedicated resources on the selected server may retain member credentials. */
export function readLibraryHlsRoute(raw: string, apiBase: string): URL | null {
  const base = new URL(apiBase), url = new URL(raw, apiBase)
  const prefix = base.pathname.replace(/\/$/, '')
  return url.origin === base.origin && url.pathname.startsWith(prefix + '/') &&
    /^\/api\/(emby|jellyfin)\/(stream|proxy)$/.test(url.pathname.slice(prefix.length)) ? url : null
}

/** v4.6.4 rewrites every child URI; retain the selected server's deployment prefix. */
export function normalizeLibraryHlsManifest(text: string, manifest: string, apiBase: string): string {
  const parent = readLibraryHlsRoute(manifest, apiBase)
  if (!parent) throw new Error('无效的媒体库清单地址')
  const base = new URL(apiBase), prefix = base.pathname.replace(/\/$/, '')
  let resources = 0, rewritten = 0
  const normalize = (uri: string) => {
    resources++
    const url = new URL(uri, parent)
    // The server emits root-relative /api/ even behind a deployment prefix.
    if (url.origin === base.origin && /^\/api\/(emby|jellyfin)\/(stream|proxy)$/.test(url.pathname)) url.pathname = prefix + url.pathname
    if (!readLibraryHlsRoute(url.href, apiBase) || !url.searchParams.has('resource') || url.pathname !== parent.pathname) return uri
    const identity = parent.searchParams.has('movieId') ? ['movieId'] : ['mountId', 'path']
    if (identity.some(key => url.searchParams.get(key) !== parent.searchParams.get(key))) return uri
    for (const key of ['ms', 'at']) {
      const value = parent.searchParams.get(key)
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value)
    }
    rewritten++
    return url.href
  }
  const normalized = text.split(/\r?\n/).map(line => {
    if (!line.trim()) return line
    if (!line.startsWith('#')) return normalize(line.trim())
    return line.replace(/\bURI="([^"]+)"/g, (_, uri: string) => `URI="${normalize(uri)}"`)
  }).join('\n')
  if (rewritten !== resources) throw new Error('媒体库 HLS 资源未由服务端重写，请升级服务端至 v4.6.4 或更新版本')
  return normalized
}
