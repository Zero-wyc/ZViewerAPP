import { apiFetch, getApiUrl, getLogicalApiUrl, getAuthSessionEpoch } from '@/lib/api'
import { connectionUrl } from '../../../platform/connectionTransport'
import { SIGNALING_PROTOCOL, type PiikIceConfig } from './protocol.ts'

export interface PiikCredentials {
  roomId: string
  role: 'host' | 'viewer'
  token?: string
  viewerGrant?: string
  protocol: string
  signalPath: string
  iceConfig: PiikIceConfig
}

export function sessionScope(): string {
  return JSON.stringify([getLogicalApiUrl(), getApiUrl(), getAuthSessionEpoch()])
}

export function signalConnectionUrl(path = '/signal'): string {
  // The signal path belongs to the service, including when deployed under /edge.
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path) ||
      path.split('/').some(segment => segment === '..' || segment === '.')) {
    throw new Error('服务端信令路径无效')
  }
  const base = new URL(getLogicalApiUrl())
  const prefix = base.pathname.replace(/\/$/, '')
  base.pathname = prefix && path.startsWith(prefix + '/') ? path : prefix + path
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  return connectionUrl(base.href)
}

export class PiikCredentialsError extends Error {
  readonly code: string
  readonly retriable: boolean
  constructor(message: string, code: string, retriable = false) {
    super(message)
    this.name = 'PiikCredentialsError'
    this.code = code
    this.retriable = retriable
  }
}

export async function requestCredentials(roomId: string, purpose: 'share' | 'voice'): Promise<PiikCredentials> {
  const scope = sessionScope()
  const response = await apiFetch(`/api/${purpose}/piik/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId }), signal: AbortSignal.timeout(15000),
  })
  const payload = await response.json().catch(() => ({}))
  if (scope !== sessionScope()) throw new DOMException('房间身份已改变', 'AbortError')
  if (!response.ok || payload.success !== true) {
    const waiting = response.status === 409 && (
      purpose === 'share' ? payload.code === 'HOST_NOT_SHARING'
        : payload.message === '房主还没有进入语音')
    throw new PiikCredentialsError(
      response.status === 404 ? '服务端未提供 Piik 接口，请升级至 5.2.1 或更新版本'
        : response.status === 503 ? '服务端 Piik 信令暂不可用，请稍后重试'
          : payload.message || payload.error || '无法获取房间信令凭证',
      String(payload.code ?? response.status), waiting)
  }
  if (payload.protocol !== SIGNALING_PROTOCOL || !payload.roomId ||
      !['host', 'viewer'].includes(payload.role) ||
      !Array.isArray(payload.iceConfig?.iceServers) ||
      typeof payload.signalPath !== 'string' ||
      !(payload.role === 'host' ? payload.token : payload.viewerGrant)) {
    throw new PiikCredentialsError('服务端 Piik 协议或凭证结构不受支持', 'PROTOCOL')
  }
  signalConnectionUrl(payload.signalPath)
  return payload as PiikCredentials
}
