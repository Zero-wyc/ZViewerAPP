export const RELEASES_URL = 'https://github.com/Zero-wyc/ZViewerAPP/releases'
export const RELEASES_API = 'https://api.github.com/repos/Zero-wyc/ZViewerAPP/releases?per_page=30'
export type UpdatePlatform = 'android' | 'harmony'
type Release = { tag_name: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean; html_url: string; assets?: { name: string; browser_download_url: string; size: number }[] }
export type AppUpdate = { version: string; title: string; notes: string; releaseUrl: string; downloadUrl: string; size: number; assetName: string }
function parts(version: string) { const match = /^(?:client-v|v)?(\d+)\.(\d+)\.(\d+)$/.exec(version); return match ? match.slice(1).map(Number) : null }
export function compareVersions(left: string, right: string) {
  const a = parts(left), b = parts(right); if (!a || !b) return 0
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1
  return 0
}
export function trustedReleaseUrl(value: string, download = false) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.search && !url.hash && (download ? /^\/Zero-wyc\/ZViewerAPP\/releases\/download\/[^/]+\/[^/]+$/ : /^\/Zero-wyc\/ZViewerAPP\/releases(?:\/tag\/[^/]+)?$/).test(url.pathname) } catch { return false }
}
export function selectUpdate(releases: unknown, platform: UpdatePlatform, currentVersion: string): AppUpdate | null {
  if (!Array.isArray(releases)) throw new Error('更新服务返回了无效数据')
  const extension = platform === 'android' ? '.apk' : '.hap'
  const candidates: AppUpdate[] = []
  for (const raw of releases) {
    if (!raw || typeof raw !== 'object') continue
    const release = raw as Release
    if (release.draft || release.prerelease || typeof release.tag_name !== 'string' || !/^client-v\d+\.\d+\.\d+$/.test(release.tag_name) || !trustedReleaseUrl(release.html_url)) continue
    const version = release.tag_name.slice(8)
    if (compareVersions(version, currentVersion.replace(/-debug$/, '')) <= 0) continue
    const asset = Array.isArray(release.assets) ? release.assets.find(item => item && typeof item.name === 'string' && item.name.toLowerCase().endsWith(extension) && !/unsigned|debug|simulator/i.test(item.name) && item.size > 0 && trustedReleaseUrl(item.browser_download_url, true)) : undefined
    if (!asset) continue
    candidates.push({ version, title: release.name || `ZViewer-Client V${version}`, notes: (release.body || '').slice(0, 12000), releaseUrl: release.html_url, downloadUrl: asset.browser_download_url, size: asset.size, assetName: asset.name })
  }
  return candidates.sort((a, b) => compareVersions(b.version, a.version))[0] || null
}
export async function checkAppUpdate(platform: UpdatePlatform, currentVersion: string, signal?: AbortSignal) {
  const response = await fetch(RELEASES_API, { signal, headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? '检查过于频繁，请稍后重试' : '暂时无法检查更新，请稍后重试')
  return selectUpdate(await response.json(), platform, currentVersion)
}
