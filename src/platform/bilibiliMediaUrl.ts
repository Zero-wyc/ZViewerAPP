/**
 * 将任意 URL 包装为 CLI 本地代理 URL。
 * CLI 代理会注入正确的 Referer/Origin/User-Agent 头，绕过 B站 CDN 防盗链。
 *
 * 若 targetUrl 本身已是该 CLI 代理地址，则直接返回避免双重包装。
 */
export function buildCliProxyUrl(proxyUrl: string, targetUrl: string): string {
  const base = proxyUrl.replace(/\/$/, '')
  const proxyPrefix = `${base}/proxy?url=`
  if (targetUrl.startsWith(proxyPrefix)) {
    return targetUrl
  }
  return `${proxyPrefix}${encodeURIComponent(targetUrl)}`
}
