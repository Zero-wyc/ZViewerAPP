import { useCallback, useEffect, useState } from 'react'
import { apiFetch, getApiUrl, getAuthSessionEpoch } from '@/lib/api'

export interface VoiceComponentStatus {
  available: boolean
  backend: 'piik' | 'sfu' | 'unknown'
  state: 'loading' | 'ready' | 'error'
  message: string
}
const UNKNOWN: VoiceComponentStatus = {
  available: false, backend: 'unknown', state: 'loading', message: '正在查询语音服务',
}

export function parseVoiceStatus(value: unknown): VoiceComponentStatus {
  const data = value as { success?: boolean; available?: boolean; backend?: string } | null
  if (data?.success !== true || typeof data.available !== 'boolean' || !['piik', 'sfu'].includes(data.backend ?? '')) {
    return { available: false, backend: 'unknown', state: 'error', message: '服务端语音协议不受支持，请升级至 5.2.1 或更新版本' }
  }
  const backend = data.backend as 'piik' | 'sfu'
  return {
    available: backend === 'piik' && data.available,
    backend,
    state: backend === 'piik' && data.available ? 'ready' : 'error',
    message: backend === 'sfu' ? '当前客户端需要服务端启用 Piik 语音' : data.available ? '' : '服务器语音服务暂不可用',
  }
}

export function useVoiceComponent(enabled = true, scope = '') {
  const [status, setStatus] = useState(UNKNOWN)
  const [revision, setRevision] = useState(0)
  const server = getApiUrl(), identity = getAuthSessionEpoch()
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  useEffect(() => {
    const abort = new AbortController()
    setStatus(UNKNOWN)
    if (enabled) void apiFetch('/api/voice/status', {
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    }).then(async response => {
      const data = await response.json().catch(() => null)
      if (!abort.signal.aborted && server === getApiUrl() && identity === getAuthSessionEpoch()) {
        setStatus(response.ok ? parseVoiceStatus(data) : { available: false, backend: 'unknown', state: 'error', message: response.status === 401 ? '请重新登录后加入语音' : '无法查询语音服务，请重试' })
      }
    }).catch(() => {
      if (!abort.signal.aborted) setStatus({ available: false, backend: 'unknown', state: 'error', message: '无法查询语音服务，请检查网络后重试' })
    })
    return () => abort.abort()
  }, [enabled, scope, server, identity, revision])
  return { status, busy: status.state === 'loading', refresh }
}
