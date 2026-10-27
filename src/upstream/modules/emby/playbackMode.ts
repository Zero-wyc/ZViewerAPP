import { isIntranetHost } from '@/lib/netAddress'
import type { EmbyMovieSourceResult } from './embyApi'

/** Match the mounted-library policy; public HTTP and untested hosts remain selectable. */
export function canSwitchEmbyPlayback(movie: { sourceType: string; serverUrl?: string | null }): boolean {
  if (movie.sourceType !== 'emby' && movie.sourceType !== 'jellyfin') return false
  if (!movie.serverUrl) return true
  try {
    const address = /^[a-z][a-z\d+.-]*:\/\//i.test(movie.serverUrl) ? movie.serverUrl : `http://${movie.serverUrl}`
    return !isIntranetHost(new URL(address).hostname)
  } catch { return true }
}

export function getEmbyMediaSourceId(url: string): string | undefined {
  try {
    const query = new URL(url, 'http://local.invalid').searchParams
    return query.get('ms') || query.get('MediaSourceId') || undefined
  } catch { return undefined }
}

/** Persist the stable item/version URL, never the expiring CDN address. */
export function embyPlaybackUpdate(source: EmbyMovieSourceResult, directLink: boolean) {
  const url = directLink ? source.directUrl : source.streamUrl
  if (!url) throw new Error('未取得影片播放地址')
  return { directLink, url, format: source.format, audioCodec: source.audioCodec || '',
    multiVersion: source.multiVersion }
}
