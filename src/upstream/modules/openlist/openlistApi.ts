/**
 * OpenList API 层
 *
 * OpenList（AList）兼容 WebDAV 协议，逻辑与 WebDAV 完全同构，
 * 本文件仅作为薄包装：通过 createMountApi 工厂生成 OpenList 实例，
 * 只保留 basePath / label / module 三个参数（特殊部分）。
 */
import { createMountApi } from '@/modules/webdav/webdavApi'
import type {
  OpenListMount,
  OpenListMountFormPayload,
  OpenListConnectionParams,
  OpenListDirectoryEntry,
  OpenListResolvedSource,
} from './types'

const openlistApi = createMountApi<
  OpenListMount,
  OpenListMountFormPayload,
  OpenListConnectionParams,
  OpenListDirectoryEntry,
  OpenListResolvedSource
>({
  basePath: '/api/openlist',
  label: 'OpenList',
  module: 'openlist',
})

export const getOpenListMounts = openlistApi.getMounts
export const createOpenListMount = openlistApi.createMount
export const updateOpenListMount = openlistApi.updateMount
export const deleteOpenListMount = openlistApi.deleteMount
export const testOpenListMount = openlistApi.testMount
export const browseOpenListMount = openlistApi.browseMount
export const resolveOpenList = openlistApi.resolveMount
export const buildOpenListProxyUrl = openlistApi.buildProxyUrl
export const fetchOpenListDirectUrl = openlistApi.fetchDirectUrl
