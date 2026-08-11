/**
 * P2P 传输统计信息 store。
 *
 * 由 DashPlayer 中的 P2pEngineDash 实例通过 `engine.on('stats', cb)` 回调写入，
 * BilibiliParseSettings UI 订阅读取以显示实时统计。
 *
 * 字段单位均为 KB（千字节），与 @swarmcloud/dashjs 的 stats 回调契约一致。
 * UI 层负责格式化显示（如转换为 MB/GB）。
 */
import { create } from 'zustand'

export interface P2PStats {
  /** HTTP 下载总量（KB） */
  totalHTTPDownloaded: number
  /** P2P 下载总量（KB） */
  totalP2PDownloaded: number
  /** P2P 上传总量（KB） */
  totalP2PUploaded: number
  /** P2P 下载速度（KB/s） */
  p2pDownloadSpeed: number
}

interface P2PStatsState extends P2PStats {
  /** P2P 引擎是否已实例化（用于 UI 判断是否显示统计面板） */
  engineActive: boolean
  /** 写入最新统计数据（由 DashPlayer 调用） */
  updateStats: (stats: P2PStats) => void
  /** 标记引擎激活状态（attach 时置 true，cleanup 时置 false） */
  setEngineActive: (active: boolean) => void
  /** 重置所有统计（引擎销毁时调用） */
  reset: () => void
}

const INITIAL_STATS: P2PStats = {
  totalHTTPDownloaded: 0,
  totalP2PDownloaded: 0,
  totalP2PUploaded: 0,
  p2pDownloadSpeed: 0,
}

export const useP2PStatsStore = create<P2PStatsState>((set) => ({
  ...INITIAL_STATS,
  engineActive: false,
  updateStats: (stats) => set(stats),
  setEngineActive: (active) => set({ engineActive: active }),
  reset: () => set({ ...INITIAL_STATS, engineActive: false }),
}))

/**
 * 格式化 KB 数值为人类可读字符串。
 *
 * @param kb 千字节数（来自 @swarmcloud/dashjs stats 回调）
 * @returns 形如 "1.23 MB" / "456 KB" / "1.5 GB"
 */
export function formatKBytes(kb: number): string {
  if (!kb || kb <= 0) return '0 KB'
  const units = ['KB', 'MB', 'GB', 'TB']
  const i = Math.min(
    Math.floor(Math.log(kb) / Math.log(1024)),
    units.length - 1
  )
  const value = kb / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}
