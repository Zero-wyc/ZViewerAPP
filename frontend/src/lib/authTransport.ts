/**
 * 鉴权传输层（分离式架构）
 *
 * HTTP 与 HTTPS 使用完全独立的鉴权通道，互不耦合：
 *
 * - HTTPS：httpOnly cookie（同站 SameSite=Lax、跨站 SameSite=None + Secure），
 *   浏览器自动携带，前端无需额外处理，安全性最高。
 * - HTTP ：Bearer token。浏览器拒绝跨站 http cookie（SameSite=None 必须配 Secure，
 *   HTTP 无法设置），因此 HTTP 场景统一走 localStorage token + `Authorization` 头
 *   （socket.io 走握手 `auth.token`），彻底摆脱对 cookie 的依赖。
 *
 * 两侧分离点：
 * - HTTPS 模式不读本地 token（cookie 已自动携带）
 * - HTTP 模式不依赖 cookie（后端 HTTP 请求不写 cookie）
 */

/** Bearer token 存储 key（HTTP 场景；HTTPS 场景使用 httpOnly cookie，不读写此存储） */
const ACCESS_TOKEN_KEY = 'zviewer-access-token'
const REFRESH_TOKEN_KEY = 'zviewer-refresh-token'

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value)
    } else {
      localStorage.removeItem(key)
    }
  } catch {
    // ignore
  }
}

/** 当前页面是否为 HTTPS 上下文（反向代理终止 TLS 后浏览器视角仍为 https） */
export function isHttpsContext(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
}

// ==================== Bearer token（HTTP 通道） ====================

export function getAccessToken(): string {
  return readStored(ACCESS_TOKEN_KEY) || ''
}

export function getRefreshToken(): string {
  return readStored(REFRESH_TOKEN_KEY) || ''
}

/** 保存登录/刷新返回的 token（HTTP 场景使用；HTTPS 场景调用无副作用） */
export function saveAuthTokens(
  accessToken?: string,
  refreshToken?: string
): void {
  if (accessToken) writeStored(ACCESS_TOKEN_KEY, accessToken)
  if (refreshToken) writeStored(REFRESH_TOKEN_KEY, refreshToken)
}

/** 清除 token（登出时调用） */
export function clearAuthTokens(): void {
  writeStored(ACCESS_TOKEN_KEY, '')
  writeStored(REFRESH_TOKEN_KEY, '')
}

// ==================== 请求鉴权装配 ====================

/**
 * 构建 REST 请求的鉴权头。
 * - HTTPS：返回空（cookie 自动携带）
 * - HTTP ：附加 `Authorization: Bearer <token>`（无 token 时返回空）
 */
export function buildAuthHeaders(): Record<string, string> {
  if (isHttpsContext()) return {}
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * 构建 socket.io 握手鉴权载荷。
 * - HTTPS：返回空（cookie 自动携带，后端从 handshake.headers.cookie 读取）
 * - HTTP ：附加 `{ token }`（后端 socket.io 中间件兼容 auth.token 字段）
 */
export function buildSocketAuth(): Record<string, string> {
  if (isHttpsContext()) return {}
  const token = getAccessToken()
  return token ? { token } : {}
}
