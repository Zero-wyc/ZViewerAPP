/**
 * 访问地址分类。
 *
 * 分享房间链接时，若当前页面是通过本机 / 局域网地址打开的，
 * 复制出的链接对其他用户不可达，需要先提示用户改用公网地址或内网穿透。
 */

export type AddressScope = 'loopback' | 'lan' | 'public'

/** 常见的局域网域名后缀（mDNS / 家用网关） */
const LAN_SUFFIXES = [
  '.local',
  '.lan',
  '.internal',
  '.localdomain',
  '.home.arpa',
]

/** 解析点分 IPv4，非法返回 null */
function classifyIpv4(host: string): AddressScope | null {
  const parts = host.split('.')
  if (parts.length !== 4) return null
  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    nums.push(n)
  }
  const [a, b] = nums
  if (a === 0 || a === 127) return 'loopback'
  if (a === 10) return 'lan'
  if (a === 192 && b === 168) return 'lan'
  if (a === 172 && b >= 16 && b <= 31) return 'lan'
  if (a === 169 && b === 254) return 'lan' // link-local
  if (a === 100 && b >= 64 && b <= 127) return 'lan' // CGNAT（运营商级 NAT）
  return 'public'
}

/** 解析 IPv6（已去掉方括号），非法/非 IPv6 返回 null */
function classifyIpv6(host: string): AddressScope | null {
  if (!host.includes(':')) return null

  // IPv4-mapped / IPv4-compatible：::ffff:192.168.1.2
  const mapped = /:(?:\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (mapped) {
    const v4 = classifyIpv4(mapped[0].slice(1))
    if (v4) return v4
  }

  if (host === '::' || host === '::1') return 'loopback'
  // fc00::/7 唯一本地地址（fc / fd 开头）
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return 'lan'
  // fe80::/10 链路本地地址
  if (/^fe[89ab][0-9a-f]{0,2}:/.test(host)) return 'lan'
  return 'public'
}

/**
 * 判断主机名的可达范围。
 * - `loopback`：本机地址（localhost / 127.0.0.0/8 / ::1）
 * - `lan`：局域网地址（10/8、172.16/12、192.168/16、169.254/16、
 *   100.64/10、fc00::/7、fe80::/10、单标签机器名、.local 等）
 * - `public`：公网可达
 */
export function getAddressScope(hostname: string): AddressScope {
  let host = hostname.trim().toLowerCase()
  // URL 规范化展开写法及 IPv4-mapped IPv6，确保与真实分享链接的 hostname 一致。
  try {
    host = new URL(`http://${host.includes(':') && !host.startsWith('[') ? `[${host}]` : host}`).hostname
  } catch { /* 无效主机名继续按本地提示规则判断 */ }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  host = host.replace(/\.$/, '')

  // 空主机名（file:// 等）按不可对外访问处理
  if (!host) return 'loopback'
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback'

  const v4 = classifyIpv4(host)
  if (v4) return v4
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16), low = parseInt(mappedHex[2], 16)
    return classifyIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)!
  }
  const v6 = classifyIpv6(host)
  if (v6) return v6

  if (LAN_SUFFIXES.some((suffix) => host.endsWith(suffix))) return 'lan'
  // 不含点的主机名＝局域网机器名，如 http://nas:3000
  if (!host.includes('.')) return 'lan'
  return 'public'
}

/** 主机名是否本机或仅局域网可达 */
export function isIntranetHost(hostname: string): boolean {
  return getAddressScope(hostname) !== 'public'
}

/** 当前页面是否通过本机 / 局域网地址打开 */
export function isIntranetLocation(): boolean {
  if (typeof window === 'undefined') return false
  return isIntranetHost(window.location.hostname)
}
