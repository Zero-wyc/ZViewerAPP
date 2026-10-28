/**
 * 播放页「喜欢 / 收藏」双子红心能力。
 *
 * 网易云与 B站 两套完全不同的红心语义，原先都内联在 ListenTogetherPanel：
 *
 * **网易云喜欢（likeSong）**
 * - 可用条件：已登录 + 有效 songId
 * - 初始态由 `/account` 取 uid 再 `/likelist` 取 ids 判定，失败静默（按钮
 *   仍可点，走乐观更新）
 * - 点击乐观更新，失败回滚
 * - 切歌重置乐观态（render 期派生，替代 effect 内同步 setState）
 *
 * **B站 收藏（歌词页工具栏红心）**
 * - 目标夹来自设置「红心收藏夹」，一键收藏/取消收藏
 * - 回显走官方 fav/folder/created/list-all：任意夹命中即点亮，**不限于设置
 *   的目标夹**（视频可能已被 B站 端收进别的夹 / 夹改名）
 * - 取消收藏时带「实际命中的夹 id」回传，避免按标题解析到别的夹
 * - 本地会话记忆 biliCollectedMark 与官方查询结果对齐
 */
import { useCallback, useEffect, useState } from 'react'
import { create } from 'zustand'
import { useMusicStore } from '../store'
import { useAuthStore } from '@/store/authStore'
import { getApiUrl } from '@/lib/api'
import { apiGet, apiPost } from '../musicApi'
import { message } from '@/components/ui/message'
import {
  useMusicSettingsStore,
  normalizeBiliLikeFavTitle,
} from '../store-settings'
import type { NcmAccountResponse, NcmLikelistResponse } from '../types'

type Favorite = { liked: boolean; busy: boolean; loaded: boolean; revision: number }
const empty: Favorite = { liked: false, busy: false, loaded: false, revision: 0 }
const useFavorites = create<{ items: Record<string, Favorite> }>(() => ({ items: {} }))
let generation = 0
const inflight = new Map<string, Promise<void>>()
const update = (key: string, values: Partial<Favorite>) => useFavorites.setState(s => ({ items: { ...s.items, [key]: { ...(s.items[key] ?? empty), ...values } } }))
// Switching NCM/App accounts invalidates status without retaining credentials.
useMusicStore.subscribe((s, prev) => { if (s.loginStatus !== prev.loginStatus) { generation++; inflight.clear(); useFavorites.setState({ items: {} }) } })
useAuthStore.subscribe((s, prev) => { if (s.user?.id !== prev.user?.id) { generation++; inflight.clear(); useFavorites.setState({ items: {} }) } })

export interface UseSongFavoriteOptions {
  /** 网易云曲目 ID（B站 曲目为 null/undefined） */
  songId: number | undefined
  /** B站 视频 BV 号（无则为 null） */
  biliBvid: string | null
  /** 网易云是否已登录（未登录则整「喜欢」能力不可用） */
  ncmLoggedIn: boolean
}

export function useSongFavorite({
  songId,
  biliBvid,
  ncmLoggedIn,
}: UseSongFavoriteOptions) {
  // ===== 网易云喜欢：可用条件 = 已登录 + 有效 songId =====
  const canLike = ncmLoggedIn && songId != null && songId > 0
  const account = useMusicStore(s => s.loginStatus.nickname)
  const key = `${getApiUrl()}:${useAuthStore(s => s.user?.id) ?? ''}:${account ?? ''}:ncm:${songId}`
  const state = useFavorites(s => s.items[key] ?? empty)
  const { liked, busy: likeBusy } = state
  useEffect(() => {
    if (!canLike || songId == null || useFavorites.getState().items[key]?.loaded || inflight.has(key)) return
    const original = useFavorites.getState().items
    const revision = original[key]?.revision ?? 0
    let request: Promise<void>
    request = Promise.resolve().then(async () => {
      try {
        const acc = await apiGet<NcmAccountResponse>(`/api/music/ncm/user/account?timestamp=${Date.now()}`)
        const uid = acc.data?.account?.id ?? acc.data?.profile?.userId
        if (!uid) return
        const result = await apiGet<NcmLikelistResponse>(`/api/music/ncm/likelist?uid=${uid}&timestamp=${Date.now()}`)
        const latest = useFavorites.getState().items[key]
        if (inflight.get(key) !== request || (latest?.revision ?? 0) !== revision) return
        update(key, { liked: result.data?.ids?.includes(songId) ?? false, loaded: true })
      } catch { /* Keep the button available for retry. */ }
      finally { if (inflight.get(key) === request) inflight.delete(key) }
    })
    inflight.set(key, request)
  }, [canLike, songId, key])
  const toggleLike = useCallback(async () => {
    const current = useFavorites.getState().items[key] ?? empty
    if (!canLike || songId == null || current.busy) return
    const session = generation
    const revision = current.revision + 1
    update(key, { liked: !current.liked, busy: true, loaded: true, revision })
    try {
      const response = await apiGet(`/api/music/ncm/like?id=${songId}&like=${!current.liked}&timestamp=${Date.now()}`)
      if (!response.ok) throw new Error('收藏失败')
    } catch {
      if (session === generation && useFavorites.getState().items[key]?.revision === revision) update(key, { liked: current.liked })
      message.error('喜欢状态更新失败，请重试')
    } finally {
      if (session === generation && useFavorites.getState().items[key]?.revision === revision) update(key, { busy: false })
    }
  }, [canLike, songId, key])

  // ===== B站 收藏：直接收藏到「红心收藏夹」+ 打开收藏夹选择弹窗 =====
  const biliLikeFavTitle = normalizeBiliLikeFavTitle(
    useMusicSettingsStore((s) => s.biliLikeFavTitle)
  )
  const [biliFavModalOpen, setBiliFavModalOpen] = useState(false)
  const [biliCollecting, setBiliCollecting] = useState(false)
  /** 红心收藏标记：folder/folderId 为**实际命中**的收藏夹（官方接口查得，
   *  可能不是设置的目标夹——视频可能被在 B站 端收进别的夹/夹改名） */
  const [biliCollectedMark, setBiliCollectedMark] = useState<{
    bvid: string
    folder: string
    folderId?: number
  } | null>(null)
  const biliCollected = biliBvid != null && biliCollectedMark?.bvid === biliBvid

  /** 收藏/取消收藏开关：已收藏（该视频在任意收藏夹中）时点击即取消收藏
   *  （后端 resource/deal del_media_ids，定向到实际命中的收藏夹 id），
   *  否则一键收藏到设置的目标夹 */
  const toggleBiliCollect = useCallback(async () => {
    if (!biliBvid || biliCollecting) return
    const collected = biliCollectedMark?.bvid === biliBvid
    setBiliCollecting(true)
    try {
      const { data, ok } = await apiPost<{
        success?: boolean
        message?: string
        folderTitle?: string
        folderId?: number
      }>('/api/stream/bilibili/fav/collect', {
        bvid: biliBvid,
        folderTitle: biliLikeFavTitle,
        action: collected ? 'remove' : 'add',
        // 取消收藏时带实际命中夹的 id，避免按标题解析到别的夹
        ...(collected && biliCollectedMark?.folderId
          ? { mediaId: biliCollectedMark.folderId }
          : {}),
      })
      if (!ok || data?.success === false) {
        throw new Error(
          data?.message || (collected ? '取消收藏失败' : '收藏失败')
        )
      }
      if (collected) {
        setBiliCollectedMark(null)
        message.success(
          `已取消收藏「${
            data?.folderTitle || biliCollectedMark?.folder || biliLikeFavTitle
          }」`
        )
      } else {
        setBiliCollectedMark({
          bvid: biliBvid,
          folder: data?.folderTitle || biliLikeFavTitle,
          folderId: data?.folderId,
        })
        message.success(`已收藏到「${data?.folderTitle || biliLikeFavTitle}」`)
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败')
    } finally {
      setBiliCollecting(false)
    }
  }, [biliBvid, biliCollecting, biliCollectedMark, biliLikeFavTitle])

  // 红心回显：切到 B站 歌曲时用 B站 官方接口查询该视频是否已在收藏夹里
  // （fav/folder/created/list-all 带 rid → fav_state，任意夹命中即点亮，
  //  不限于设置的目标夹；未登录/失败静默，回显是辅助能力不弹错误——
  //  本地会话内的 mark 仍以此查询结果对齐）
  useEffect(() => {
    if (!biliBvid) return
    let cancelled = false
    void (async () => {
      try {
        const { data, ok } = await apiGet<{
          success?: boolean
          collected?: boolean
          folderId?: number
          folderTitle?: string
        }>(
          `/api/stream/bilibili/fav/status?bvid=${biliBvid}&timestamp=${Date.now()}`
        )
        if (cancelled || !ok || data?.success === false) return
        setBiliCollectedMark(
          data?.collected
            ? {
                bvid: biliBvid,
                folder: data.folderTitle ?? biliLikeFavTitle,
                folderId: data.folderId,
              }
            : null
        )
      } catch (err) {
        console.error('[useSongFavorite] B站 收藏状态查询失败:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [biliBvid, biliLikeFavTitle])

  return {
    /** 网易云喜欢能力是否可用 */
    canLike,
    /** 当前是否已喜欢（乐观状态） */
    liked,
    /** 喜欢请求进行中 */
    likeBusy,
    /** 点击网易云红心 */
    toggleLike,
    /** 设置的 B站 红心收藏夹名 */
    biliLikeFavTitle,
    /** 收藏夹选择弹窗开关 */
    biliFavModalOpen,
    setBiliFavModalOpen,
    /** 当前 B站 视频是否已在收藏夹中 */
    biliCollected,
    /** 本地会话收藏标记（含实际命中的收藏夹名/id；弹窗收藏成功后回写） */
    biliCollectedMark,
    setBiliCollectedMark,
    /** 收藏请求进行中 */
    biliCollecting,
    /** 点击 B站 红心（收藏/取消收藏） */
    toggleBiliCollect,
  }
}
