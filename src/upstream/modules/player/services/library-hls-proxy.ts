import type { HlsProxySource } from './hls-proxy'

/** Only the selected server's room-movie stream can request private playback metadata. */
export async function resolveLibraryHlsProxySource(
  raw: string,
  apiBase: string,
  resolve: (api: 'emby' | 'jellyfin', movieId: number, version?: string) => Promise<{ directUrl?: string; mediaSourceId: string }>
): Promise<HlsProxySource | null> {
  const base = new URL(apiBase)
  const stream = new URL(raw, apiBase)
  const prefix = base.pathname.replace(/\/$/, '')
  if (stream.origin !== base.origin) return null
  const match = stream.pathname.slice(prefix.length).match(/^\/api\/(emby|jellyfin)\/stream$/)
  if (!stream.pathname.startsWith(prefix + '/') || !match) return null
  const movieId = Number(stream.searchParams.get('movieId'))
  if (!Number.isSafeInteger(movieId) || movieId <= 0) return null
  const result = await resolve(match[1] as 'emby' | 'jellyfin', movieId, stream.searchParams.get('ms') || undefined)
  if (!result.directUrl) throw new Error('媒体库转码缺少清单地址，请重新解析影片')
  const upstream = new URL(result.directUrl)
  if (!['http:', 'https:'].includes(upstream.protocol)) throw new Error('无效的媒体库转码地址')
  // The stream route translates ms; an upstream Emby URI uses MediaSourceId.
  upstream.searchParams.delete('ms')
  if (result.mediaSourceId) upstream.searchParams.set('MediaSourceId', result.mediaSourceId)
  return { url: upstream.href, endpoint: base.origin + prefix + '/api/stream/proxy', parameters: {} }
}

/** Relative segments/keys may omit the media token. Never send it to another origin. */
export function inheritLibraryHlsQuery(raw: string, manifest: string): string {
  const url = new URL(raw, manifest), base = new URL(manifest)
  if (url.origin === base.origin) {
    for (const key of ['api_key', 'MediaSourceId']) {
      const value = base.searchParams.get(key)
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value)
    }
  }
  return url.href
}
