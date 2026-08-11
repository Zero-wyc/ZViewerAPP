/**
 * Jellyfin 挂载类型定义
 *
 * Jellyfin 是 Emby 开源分支，同为媒体库型（itemId 树形结构）。
 * 认证方式二选一：API Key 或 账号密码。
 */
import type { MediaFormat } from '@/lib/mediaFormat'

export interface JellyfinMount {
  id: number
  type: 'jellyfin'
  name: string
  serverUrl: string | null
  apiKey: string | null
  username: string | null
  embyUserId: string | null
  directLink: boolean
  createdAt: string
  updatedAt: string
}

export interface JellyfinMountFormPayload {
  name: string
  serverUrl: string | null
  apiKey: string | null
  username: string | null
  password: string | null
  directLink: boolean
}

export interface JellyfinTestResult {
  success: boolean
  userId?: string
  userName?: string
  serverId?: string
}

export interface JellyfinDirectoryEntry {
  name: string
  path: string
  /** file = 可播放条目（电影/单集），directory = 可继续浏览（媒体库/剧集/季） */
  type: 'file' | 'directory'
  /** Jellyfin 条目类型（CollectionFolder/Series/Season/Movie/Episode/Video） */
  embyType?: string
  childCount?: number
}

export interface JellyfinResolvedSource {
  title: string
  videoUrl: string
  /** 直连 URL（浏览器可直连 Jellyfin 时使用） */
  directUrl?: string
  format: MediaFormat
  duration: number
}
