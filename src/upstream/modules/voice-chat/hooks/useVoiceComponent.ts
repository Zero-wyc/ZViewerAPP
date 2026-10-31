import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, getApiUrl, safeJson } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface VoiceComponentStatus {
  available: boolean
  state: 'idle' | 'downloading' | 'installing' | 'ready' | 'error' | 'external'
  progress: number
  received: number
  total: number
  message: string
  version: string
  external: boolean
}

const UNKNOWN: VoiceComponentStatus = {
  available: true,
  state: 'ready',
  progress: 0,
  received: 0,
  total: 0,
  message: '',
  version: '',
  external: false,
}

function readStatus(value: Partial<VoiceComponentStatus>): VoiceComponentStatus {
  const progress = Number(value.progress)
  return {
    ...UNKNOWN,
    ...value,
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0,
  }
}

export function useVoiceComponent(enabled = true, scope = '') {
  const user = useAuthStore(state => state.user)
  const server = getApiUrl()
  const [status, setStatus] = useState<VoiceComponentStatus>(UNKNOWN)
  const [requesting, setRequesting] = useState(false)
  const lifecycle = useRef({
    revision: 0,
    controller: new AbortController(),
    refreshing: false,
    installing: false,
  })

  const request = useCallback(async (install: boolean) => {
    const current = lifecycle.current
    if (!enabled || current.controller.signal.aborted ||
      (install ? current.installing : current.refreshing || current.installing)) return
    if (install) ++current.revision
    const revision = current.revision
    const active = () => lifecycle.current === current &&
      !current.controller.signal.aborted && getApiUrl() === server &&
      useAuthStore.getState().user === user
    if (install) {
      current.installing = true
      setRequesting(true)
    } else current.refreshing = true
    try {
      const response = await apiFetch(install ? '/api/voice/install' : '/api/voice/status', {
        method: install ? 'POST' : 'GET',
        signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(15000)]),
        refreshAuth: 'unauthorized',
      })
      const data = await safeJson<{
        success?: boolean
        status?: Partial<VoiceComponentStatus>
        message?: string
      }>(response, {})
      if (!active() || revision !== current.revision) return
      if (response.ok && data.success && data.status) {
        setStatus(readStatus(data.status))
      } else if (install) {
        setStatus(previous => ({
          ...previous, available: false, state: 'error',
          message: data.message || '下载请求失败，请稍后重试',
        }))
      }
      // Older servers have no status endpoint; their existing join flow remains available.
    } catch {
      if (install && active()) {
        setStatus(previous => ({
          ...previous, available: false, state: 'error',
          message: '下载请求失败，请检查网络后重试',
        }))
      }
    } finally {
      if (install) current.installing = false
      else current.refreshing = false
      if (install && active()) setRequesting(false)
    }
  }, [enabled, scope, server, user])

  const refresh = useCallback(() => request(false), [request])
  const install = useCallback(() => request(true), [request])

  useEffect(() => {
    lifecycle.current.controller.abort()
    const current = {
      revision: 0,
      controller: new AbortController(),
      refreshing: false,
      installing: false,
    }
    lifecycle.current = current
    setStatus(UNKNOWN)
    setRequesting(false)
    if (enabled) void refresh()
    return () => current.controller.abort()
  }, [enabled, refresh])

  const busy = status.state === 'downloading' || status.state === 'installing'
  useEffect(() => {
    if (!enabled || !busy) return
    const timer = setInterval(() => void refresh(), 1000)
    return () => clearInterval(timer)
  }, [enabled, busy, refresh])

  return { status, busy, requesting, install, refresh }
}
