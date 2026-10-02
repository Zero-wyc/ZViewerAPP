/** CDN avatars can arrive over HTTP, which secure native Web origins block. */
export function neteaseImageUrl(source: string | null | undefined, size: number): string {
  if (!source) return ''
  try {
    const url = new URL(source.startsWith('//') ? `https:${source}` : source)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (url.protocol === 'http:' && (url.hostname === 'music.126.net' || url.hostname.endsWith('.music.126.net'))) url.protocol = 'https:'
    url.searchParams.set('param', `${size}y${size}`)
    return url.href
  } catch { return '' }
}

export const NCM_AVATAR_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="#dce4ea"/><circle cx="20" cy="14" r="7" fill="#71808e"/><path d="M7 38v-4a13 13 0 0 1 26 0v4" fill="#71808e"/></svg>')}`

export function fallbackNcmAvatar(event: { currentTarget: HTMLImageElement }): void {
  if (event.currentTarget.getAttribute('src') !== NCM_AVATAR_FALLBACK) event.currentTarget.src = NCM_AVATAR_FALLBACK
}
