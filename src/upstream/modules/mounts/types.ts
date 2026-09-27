// 统一挂载类型：聚合 webdav/openlist/ftp/emby 四种挂载
// 各模块保持独立 CRUD，此类型仅用于统一展示和选择
import type { WebDAVMount } from '@/modules/webdav/types'
import type { OpenListMount } from '@/modules/openlist/types'
import type { FTPMount } from '@/modules/ftp/types'
import type { EmbyMount } from '@/modules/emby/types'
import type { JellyfinMount } from '@/modules/jellyfin/types'

export type MountType = 'webdav' | 'ftp' | 'openlist' | 'emby' | 'jellyfin'

export type UnionMount =
  WebDAVMount | OpenListMount | FTPMount | EmbyMount | JellyfinMount

export interface MountTypeMeta {
  label: string
  color: 'primary' | 'warning' | 'success'
  icon: React.ReactNode
}

// 类型守卫
export function isWebDAVMount(m: UnionMount): m is WebDAVMount {
  return m.type === 'webdav'
}

export function isOpenListMount(m: UnionMount): m is OpenListMount {
  return m.type === 'openlist'
}

export function isFTPMount(m: UnionMount): m is FTPMount {
  return m.type === 'ftp'
}

export function isEmbyMount(m: UnionMount): m is EmbyMount {
  return m.type === 'emby'
}

export function isJellyfinMount(m: UnionMount): m is JellyfinMount {
  return m.type === 'jellyfin'
}
