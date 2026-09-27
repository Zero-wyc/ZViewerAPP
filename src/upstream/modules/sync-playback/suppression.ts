/**
 * 计数式事件抑制 ref。
 *
 * 背景：suppressEventsRef 是跨 hook 共享的"事件抑制"标记——房主/观众在
 * attach、恢复、seek、缓冲下载等异步流程期间抑制 video 事件广播，避免
 * 中间态被广播给观众/写入服务器播放记忆。
 *
 * 旧实现为单布尔，存在"先完成者提前释放抑制窗口"问题：
 * 流程 A（观众加入的缓冲下载，可持续数分钟）与流程 B（一次普通状态同步）
 * 重叠时，B 完成后把 suppress 置 false，A 仍在下载中事件抑制即失效，
 * 后续 attach/error/seeking 事件泄漏广播。
 *
 * 实现：写入 true = 获取一次抑制（计数 +1），写入 false = 释放一次（-1），
 * 读取 current = 计数 > 0。每个异步流程应保证 true/false 成对出现
 * （try/finally）；resetSuppression 供"新加载代际"等全局重置点强制清零
 * （旧流程的抑制作废，避免悬挂计数导致永久抑制）。
 *
 * 租约安全阀：每次获取记录时间戳，超过 SUPPRESS_LEASE_MS 未释放的抑制
 * 自动过期——防御未来新增的非配对路径（+1 无 -1）导致的永久抑制
 * （症状：心跳校正/事件处理被永久拦截，观众不再跟随房主）。
 */
import type { MutableRefObject } from 'react'

/** 单次抑制租约上限。合法长持有（缓冲模式整片下载）通常在数分钟内完成。 */
const SUPPRESS_LEASE_MS = 5 * 60 * 1000

/** 计数式抑制 ref 的内部结构。 */
interface CountedSuppressRef extends MutableRefObject<boolean> {
  __suppressStamps: number[]
}

/** 创建计数式事件抑制 ref（接口与普通 useRef(boolean) 完全兼容）。 */
export function createSuppressRef(): MutableRefObject<boolean> {
  const holder = {
    __suppressStamps: [] as number[],
  } as CountedSuppressRef
  Object.defineProperty(holder, 'current', {
    get: () => {
      const now = Date.now()
      // 租约安全阀：清理超过上限未释放的获取（异常泄漏自愈）
      while (
        holder.__suppressStamps.length > 0 &&
        now - holder.__suppressStamps[0] > SUPPRESS_LEASE_MS
      ) {
        holder.__suppressStamps.shift()
        console.warn(
          '[suppression] 检测到超时未释放的抑制（可能存在 acquire/release 不配对），已自动过期'
        )
      }
      return holder.__suppressStamps.length > 0
    },
    set: (v: boolean) => {
      if (v) {
        holder.__suppressStamps.push(Date.now())
      } else if (holder.__suppressStamps.length > 0) {
        // 释放最早的一次获取（FIFO 与 acquire 顺序对应）
        holder.__suppressStamps.shift()
      }
    },
  })
  return holder
}

/**
 * 强制清零抑制计数。
 *
 * 仅在"新加载代际"等全局重置点调用（loadMovie / reloadBilibili / previewPlay
 * 启动时）：此时所有旧流程的抑制语义已作废，清零可避免异常路径漏释放导致
 * 的悬挂计数（永久抑制）。对非计数式 ref 退化为直接置 false。
 */
export function resetSuppression(ref: MutableRefObject<boolean>): void {
  const holder = ref as CountedSuppressRef
  if (Array.isArray(holder.__suppressStamps)) {
    holder.__suppressStamps.length = 0
  } else {
    ref.current = false
  }
}
