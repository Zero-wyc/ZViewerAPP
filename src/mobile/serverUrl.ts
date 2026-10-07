import { connectionUrl } from '../platform/connectionTransport'
export type ServerAddressMode = 'auto' | 'custom'

export function normalizeServerUrl(value: string): string {
  let candidate = value.trim().replace(/\/+$/, '')
  if (!candidate) throw new Error('请输入服务端地址')
  if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate) || /^[^/:]+:\d+(\/|$)/.test(candidate)) candidate = `https://${candidate}`
  const url = new URL(candidate)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 地址')
  if (url.username || url.password || url.search || url.hash) throw new Error('服务端地址不能包含账号、查询参数或片段')
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export function serverCandidates(value: string, mode: ServerAddressMode = 'auto'): string[] {
  const explicit = /^https?:\/\//i.test(value.trim())
  if (mode === 'custom' && !explicit) throw new Error('自定义模式请输入完整 HTTP 或 HTTPS 地址')
  const normalized = normalizeServerUrl(value)
  if (explicit || mode === 'custom') return [normalized]
  return [normalized, normalized.replace(/^https:/, 'http:')]
}

export function serverResource(server: string, value: string): string {
  if (value.startsWith('/') && !value.startsWith('//')) return connectionUrl(server.replace(/\/+$/, '') + value)
  return connectionUrl(value)
}

export function authenticatedMediaUrl(server: string, value: string, token: string): string {
  const absolute = value.startsWith('/') && !value.startsWith('//') ? server.replace(/\/+$/, '') + value : value
  try {
    const base = new URL(server)
    const url = new URL(absolute)
    const apiPrefix = base.pathname.replace(/\/+$/, '') + '/api/'
    if (url.origin !== base.origin || !url.pathname.startsWith(apiPrefix)) return absolute
    if (token && !url.searchParams.has('token')) url.searchParams.set('token', token)
    return connectionUrl(url.toString())
  } catch {
    return connectionUrl(absolute)
  }
}
