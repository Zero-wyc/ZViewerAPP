/**
 * 推流模式（OBS RTMP + HTTP-FLV）API 层
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch, getApiUrl, getRtmpHost, getRtmpPort } from '@/lib/api'

/** A room admission grants viewing only. Publishing secrets never build FLV URLs. */
export async function getWatchPlaybackUrl(roomId: string, signal?: AbortSignal): Promise<string> {
  const server = getApiUrl().replace(/\/$/, '')
  const res = await apiFetch(`/api/stream-push/watch/${encodeURIComponent(roomId)}`, { signal })
  const data = await res.json().catch(() => null) as { success?: boolean; url?: string; message?: string } | null
  if (!res.ok || !data?.success || typeof data.url !== 'string') {
    throw new Error(data?.message || '无法获取观看权限，请确认客户端与服务端均已更新')
  }
  const path = `/live/${encodeURIComponent(roomId)}.flv`
  const parsed = new URL(data.url, 'https://watch.invalid')
  if (!data.url.startsWith(path + '?') || parsed.pathname !== path || !parsed.searchParams.get('ticket')) {
    throw new Error('服务器返回了无效的观看地址')
  }
  if (signal?.aborted || getApiUrl().replace(/\/$/, '') !== server) {
    throw new Error('服务器连接已变更，请重新连接直播')
  }
  return `${server}${data.url}`
}

export function useWatchPlayback(roomId: string, enabled = true): { url: string; error: string; retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const server = getApiUrl()
  const [state, setState] = useState({ room: roomId, server, attempt, url: '', error: '' })
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setState({ room: roomId, server, attempt, url: '', error: '' })
    if (!enabled || !roomId) return () => controller.abort()
    void getWatchPlaybackUrl(roomId, controller.signal).then(url => {
      if (!controller.signal.aborted) setState({ room: roomId, server, attempt, url, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setState({ room: roomId, server, attempt, url: '', error: error instanceof Error ? error.message : '获取观看权限失败' })
    })
    return () => controller.abort()
  }, [roomId, enabled, server, attempt])
  return { ...(state.room === roomId && state.server === server && state.attempt === attempt && enabled ? state : { url: '', error: '' }), retry }
}

/**
 * 构建推流地址（仅用于显示）。
 * 主机名从自定义后端地址提取（getRtmpHost），未自定义时回退到当前页面 hostname。
 * 端口来自 RTMP_PORT（支持用户自定义或环境变量 VITE_RTMP_PORT，默认 3334）。
 */
export function getRtmpPushUrl(): string {
  return `rtmp://${getRtmpHost()}:${getRtmpPort()}/live`
}

/**
 * 下载 OBS 场景集合配置文件。
 * 后端返回 JSON 文件，浏览器直接下载。
 */
export async function downloadObsConfig(roomId: string): Promise<void> {
  const url = `/api/stream-push/obs-config/${encodeURIComponent(roomId)}`
  const response = await apiFetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`下载 OBS 配置失败: ${response.status} ${text}`)
  }
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = 'zviewer-obs-config.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 释放 object URL
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
