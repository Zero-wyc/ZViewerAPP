/**
 * 判断主机名是否为内网/回环地址。
 *
 * 内网范围（RFC 1918 / RFC 4193 / loopback / link-local）：
 * - IPv4: 127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、169.254.0.0/16
 * - IPv6: ::1、fc00::/7（唯一本地地址）、fe80::/10（链路本地）
 * - 主机名: localhost
 *
 * 与后端 backend/src/services/openlist-errors.ts 的 isInternalNetworkHost 逻辑保持一致。
 *
 * @param hostname 已解析的主机名（不含端口、不含协议）
 */
export function isInternalNetworkHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return false

  // 主机名 localhost
  if (host === 'localhost' || host.endsWith('.localhost')) return true

  // IPv4 回环 127.x.x.x
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true

  // IPv4 私有：10.x.x.x
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true

  // IPv4 私有：192.168.x.x
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true

  // IPv4 私有：172.16.x.x ~ 172.31.x.x
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host)
  if (m172) {
    const second = Number(m172[1])
    if (second >= 16 && second <= 31) return true
  }

  // IPv4 链路本地 169.254.x.x
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true

  // IPv6 环回
  if (host === '::1') return true

  // IPv6 唯一本地地址 fc00::/7（fcxx 或 fdxx 开头）
  if (/^f[cd][0-9a-f]{2}(?::|$)/.test(host)) return true

  // IPv6 链路本地 fe80::/10
  if (/^fe[89ab][0-9a-f]?(?::|$)/.test(host)) return true

  // IPv4 映射的 IPv6 ::ffff:127.0.0.1 等
  const v4Mapped = /^::ffff:([0-9.]+)$/i.exec(host)
  if (v4Mapped) return isInternalNetworkHost(v4Mapped[1])

  return false
}

/**
 * 判断 OpenList 服务器 URL 是否指向内网。
 *
 * 解析 URL 的 hostname（自动处理 IPv6 方括号），委托给 isInternalNetworkHost。
 * URL 解析失败时返回 false（保守策略，不强制中转）。
 *
 * 与后端 backend/src/services/openlist-errors.ts 的 isInternalOpenListServer 逻辑保持一致。
 *
 * @param serverUrl OpenList 服务器地址（可含协议、端口、路径）
 */
export function isInternalOpenListServer(serverUrl: string): boolean {
  let url = serverUrl.trim()
  if (!url) return false
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `http://${url}`
  }
  try {
    const parsed = new URL(url)
    return isInternalNetworkHost(parsed.hostname)
  } catch {
    return false
  }
}
