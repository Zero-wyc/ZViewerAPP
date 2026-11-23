/**
 * 房间内显示名（昵称）的本地存储与校验。
 *
 * 昵称只对「当前房间」生效，保存在 localStorage 里（按 roomId 分开），
 * 后端不落库：重连/换设备时前端重新上报即可。
 */
const STORAGE_PREFIX = 'zviewer.room-display-name:'

/** 昵称长度上限（与后端 name_handlers.go 的 displayNameMaxLen 保持一致） */
export const DISPLAY_NAME_MAX = 20

export interface RoomDisplayNameScope {
  logicalServer: string
  identityKey: string
}

export function roomDisplayNameScope(
  logicalServer: string,
  user?: { id?: string | number | null; role?: string } | null
): RoomDisplayNameScope {
  return {
    logicalServer,
    identityKey: user && user.role !== 'guest' && user.id ? `u:${user.id}` : 'guest',
  }
}

export function roomDisplayNameKey(roomId: string, scope?: RoomDisplayNameScope): string {
  return scope ? `${scope.logicalServer}|${scope.identityKey}|${roomId}` : roomId
}

function storageKey(roomId: string, scope?: RoomDisplayNameScope): string {
  return `${STORAGE_PREFIX}${roomDisplayNameKey(roomId, scope)}`
}

/** 昵称是否合法：去空白后非空且不超过 20 个字符（按 Unicode 字符计）。 */
export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  return Array.from(trimmed).length <= DISPLAY_NAME_MAX
}

export function readRoomDisplayName(roomId: string, scope?: RoomDisplayNameScope): string | null {
  if (!roomId) return null
  try {
    const value = window.localStorage.getItem(storageKey(roomId, scope))
    return value && value.trim() ? value : null
  } catch {
    return null
  }
}

export function writeRoomDisplayName(roomId: string, name: string, scope?: RoomDisplayNameScope): void {
  if (!roomId) return
  try {
    window.localStorage.setItem(storageKey(roomId, scope), name)
  } catch {
    // 隐私模式下 localStorage 可能不可写：昵称只在本次会话生效即可。
  }
}

/** 游客默认昵称：游客 + 4 位大写字母/数字。 */
export function guestDefaultDisplayName(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let suffix = ''
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `游客${suffix}`
}

/**
 * 取本房间显示名：已保存过就用保存的；否则用账号名（登录用户）；
 * 游客则生成「游客XXXX」并写入 localStorage。
 */
export function ensureRoomDisplayName(
  roomId: string,
  accountName?: string | null,
  scope?: RoomDisplayNameScope
): string {
  const stored = readRoomDisplayName(roomId, scope)
  if (stored) return stored
  const fallback = (accountName ?? '').trim()
  const name = fallback || guestDefaultDisplayName()
  writeRoomDisplayName(roomId, name, scope)
  return name
}
