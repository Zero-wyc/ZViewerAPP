import type { ResolvedLiveSource, ResolvedSource } from './types'

/**
 * B站 直播间链接识别。
 *
 * 直播间地址形态（实测 2026-11）：
 * - https://live.bilibili.com/32153039
 * - https://live.bilibili.com/blanc/21452505（网页全屏）
 * - https://live.bilibili.com/h5/1234（移动端）
 * - https://live.bilibili.com/1234?broadcast_type=0&is_room_feed=1
 *
 * 只认「路径首段就是房间号」以及 blanc / h5 / blackboard 三个已知前缀。
 * 不做「任意数字」兜底：www.bilibili.com/video/123 之类会被误判。
 * 与后端 internal/bilibili/live.go 的 liveRoomPattern 保持同一套规则。
 */
const LIVE_ROOM_PATH = /^\/(?:(?:blanc|h5|blackboard)\/)?(\d{1,10})(?:\/|$)/i

/** 从直播间链接提取房间号；非直播间链接返回 0。 */
export function extractLiveRoomId(input: string): number {
  const trimmed = (input || '').trim()
  if (!trimmed) return 0
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 0
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 0
  const host = url.hostname.toLowerCase()
  if (host !== 'live.bilibili.com' && !host.endsWith('.live.bilibili.com')) {
    return 0
  }
  const match = LIVE_ROOM_PATH.exec(url.pathname)
  if (!match) return 0
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? id : 0
}

/** 是否为 B站 直播间链接。 */
export function isBilibiliLiveUrl(input: string): boolean {
  return extractLiveRoomId(input) > 0
}

/** 房间号对应的规范链接（添加影片时落库用，去掉 query 与短链）。 */
export function bilibiliLiveRoomUrl(roomId: number): string {
  return `https://live.bilibili.com/${roomId}`
}

/** Keep preview, quality changes and playback on the same live-source contract. */
export function mapBilibiliLiveSource(live: ResolvedLiveSource): ResolvedSource {
  return { title: live.title || `B站直播 ${live.roomId}`, videoUrl: live.videoUrl,
    format: live.format, duration: 0, currentQn: live.currentQn, acceptQuality: live.qualities,
    resolvedUrl: live.resolvedUrl || bilibiliLiveRoomUrl(live.roomId), isLive: true,
    roomId: live.roomId, uname: live.uname, cover: live.cover,
    liveStatus: live.liveStatus, expiresAt: live.expiresAt }
}
