import { create } from 'zustand'
import {
  ensureRoomDisplayName,
  isValidDisplayName,
  writeRoomDisplayName,
  roomDisplayNameKey,
  type RoomDisplayNameScope,
} from '@/modules/room/lib/displayName'

interface RoomDisplayNameState {
  /** 服务端 + 身份 + 房间 → 本房间昵称 */
  names: Record<string, string>
  ensure: (roomId: string, accountName?: string | null, scope?: RoomDisplayNameScope) => void
  rename: (roomId: string, name: string, scope?: RoomDisplayNameScope) => boolean
}

/**
 * 房间昵称的单一来源。
 *
 * 房间页、房间信息和评论区读取同一份状态：localStorage 的 storage 事件不会在同一标签页触发，
 * 因此必须用 store 共享，不能各自读 localStorage。
 */
export const useRoomDisplayNameStore = create<RoomDisplayNameState>()(
  (set, get) => ({
    names: {},
    ensure: (roomId, accountName, scope) => {
      const key = roomDisplayNameKey(roomId, scope)
      if (!roomId || Object.hasOwn(get().names, key)) return
      const name = ensureRoomDisplayName(roomId, accountName, scope)
      set((state) => ({ names: { ...state.names, [key]: name } }))
    },
    rename: (roomId, name, scope) => {
      const trimmed = name.trim()
      if (!roomId || !isValidDisplayName(trimmed)) return false
      writeRoomDisplayName(roomId, trimmed, scope)
      const key = roomDisplayNameKey(roomId, scope)
      set((state) => ({ names: { ...state.names, [key]: trimmed } }))
      return true
    },
  })
)
