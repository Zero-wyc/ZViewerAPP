/**
 * 一起看「允许成员点片」房间级权限（前端共享模型 + REST 封装）。
 *
 * 形状与音乐的 musicPermission 一致，但多了游客名单（游客没有 userId，
 * 只能按 guestId 记账）：
 *   { allowMembers, allowedUserIds[], deniedUserIds[], allowedGuestIds[], deniedGuestIds[] }
 * 区别：影片属于敏感操作，缺省（{} / 解析失败）按 allowMembers=false 处理，
 * 必须由房主显式打开。
 */
import { apiFetch, safeJson } from '@/lib/api'

export interface MoviePermission {
  allowMembers: boolean
  allowedUserIds: number[]
  deniedUserIds: number[]
  allowedGuestIds: string[]
  deniedGuestIds: string[]
}

export const DEFAULT_MOVIE_PERMISSION: MoviePermission = {
  allowMembers: false,
  allowedUserIds: [],
  deniedUserIds: [],
  allowedGuestIds: [],
  deniedGuestIds: [],
}

function toGuestList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}

function toIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const out: number[] = []
  for (const item of value) {
    const id = typeof item === 'number' ? item : Number(item)
    if (Number.isFinite(id) && id > 0 && !out.includes(id)) out.push(id)
  }
  return out
}

/** 归一化任意服务端/本地结构；缺省值按「不允许成员点片」处理 */
export function normalizeMoviePermission(raw: unknown): MoviePermission {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MOVIE_PERMISSION }
  const record = raw as Record<string, unknown>
  return {
    allowMembers: record.allowMembers === true,
    allowedUserIds: toIdList(record.allowedUserIds),
    deniedUserIds: toIdList(record.deniedUserIds),
    allowedGuestIds: toGuestList(record.allowedGuestIds),
    deniedGuestIds: toGuestList(record.deniedGuestIds),
  }
}

/** 房主和 root 直接放行。调用方另外叠加入房身份的 addMovie 矩阵。 */
export function canRequestMovie(
  permission: MoviePermission,
  opts: { isHost: boolean; role?: string; userId?: number | null; guestId?: string | null }
): boolean {
  if (opts.isHost || opts.role === 'root') return true
  return memberCanRequestMovie(permission, Number(opts.userId ?? 0), opts.guestId)
}

/** 房主面板：某成员当前是否被允许（白名单/黑名单/总开关） */
export function memberCanRequestMovie(
  permission: MoviePermission,
  userId: number,
  guestId?: string | null
): boolean {
  if (userId > 0) {
    if (permission.deniedUserIds.includes(userId)) return false
    if (permission.allowedUserIds.includes(userId)) return true
    return permission.allowMembers
  }
  const gid = (guestId ?? '').trim()
  if (gid) {
    if (permission.deniedGuestIds.includes(gid)) return false
    if (permission.allowedGuestIds.includes(gid)) return true
  }
  return permission.allowMembers
}

interface MoviePermissionResponse {
  success?: boolean
  message?: string
  permission?: unknown
}

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' }
}

/** 读取房间点片权限（房间可读即可，观众也调用） */
export async function fetchMoviePermission(
  roomId: string
): Promise<MoviePermission> {
  const res = await apiFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/movie-permission`,
    { headers: authHeaders() }
  )
  const data = await safeJson<MoviePermissionResponse>(res, {})
  if (!res.ok || data.success === false) {
    throw new Error(data.message || '获取点片权限失败')
  }
  return normalizeMoviePermission(data.permission)
}

export interface MoviePermissionPatch {
  allowMembers?: boolean
  userId?: number
  /** 游客：没有 userId，用 guestId 指定具体的人 */
  guestId?: string
  allowed?: boolean
}

/** 更新点片权限（仅房主/root，后端二次校验） */
export async function updateMoviePermission(
  roomId: string,
  patch: MoviePermissionPatch
): Promise<MoviePermission> {
  const res = await apiFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/movie-permission`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(patch),
    }
  )
  const data = await safeJson<MoviePermissionResponse>(res, {})
  if (!res.ok || data.success === false) {
    throw new Error(data.message || '更新点片权限失败')
  }
  return normalizeMoviePermission(data.permission)
}
