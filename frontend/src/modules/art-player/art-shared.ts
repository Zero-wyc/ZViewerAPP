/**
 * ArtPlayer 共享基础设施。
 *
 * 包含：
 * - configureArtStatics：全局静态配置（禁用内置右键菜单等）
 * - installViewerGuards：观众端只读拦截（capture 阶段阻断播放切换 / 进度条交互）
 * - createSlot：控制栏 / 图层插槽元素工厂（供 React Portal 挂载）
 *
 * 设计要点：
 * - ArtPlayer 的 click-toggle / dblclick-fullscreen / 进度条交互均绑定在其内部元素上，
 *   通过在祖先容器 ($player) 的 capture 阶段 stopPropagation 可在事件到达目标前拦截，
 *   不影响项目自身绑定在 video 元素上的监听器（stalled/error 等）。
 * - ArtPlayer 内置的 video:error 自动重连使用 option.url，本项目始终保持 option.url 为空
 *   （源加载由引擎层驱动），重连退化为无害的 loading 显示，不会覆盖引擎管理的 src。
 */
import Artplayer from 'artplayer'

/** 全局静态配置只执行一次 */
let staticsConfigured = false
export function configureArtStatics(): void {
  if (staticsConfigured) return
  staticsConfigured = true
  // 禁用 ArtPlayer 内置右键菜单：项目使用自有 VideoStatsMenu（绑定 video contextmenu）
  Artplayer.CONTEXTMENU = false
}

/**
 * 创建插槽元素：作为 ArtPlayer control/layer 的 html 内容，
 * 后续通过 React createPortal 往里渲染交互组件。
 */
export function createSlot(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}

export interface ViewerGuardOptions {
  /**
   * 观众进度条交互（pointerdown 命中进度条区域时调用）。
   * 返回值表示是否消费该事件（消费后阻断 ArtPlayer 自身的进度条拖拽）。
   */
  onProgressPointerDown?: (
    e: PointerEvent,
    progressEl: HTMLDivElement
  ) => boolean
  /**
   * 视频区域双击回调（观众双击全屏：ArtPlayer 内置双击被阻断后由该回调接管）。
   */
  onVideoDblClick?: () => void
}

/**
 * 观众端只读守卫：
 * 1. 阻断视频元素的 click / dblclick（禁止观众单击切换播放、双击全屏由我们手动接管）
 * 2. 阻断进度条区域的 pointerdown / mousedown / touchstart / click
 *    （ArtPlayer 进度条交互全部失效，由 onProgressPointerDown 转为「申请跳转」）
 *
 * 返回清理函数（art destroy 时调用，防止元素复用时重复绑定）。
 */
export function installViewerGuards(
  art: Artplayer,
  options: ViewerGuardOptions
): () => void {
  const { $player, $video, $progress } = art.template
  const disposers: (() => void)[] = []

  const on = (el: HTMLElement, type: string, fn: (e: Event) => void): void => {
    el.addEventListener(type, fn, true)
    disposers.push(() => el.removeEventListener(type, fn, true))
  }

  // 1. 阻断视频点击（ArtPlayer 在 $video 上绑定 click → art.toggle()）
  const blockVideoClick = (e: Event) => {
    if (e.target === $video) {
      e.stopPropagation()
    }
  }
  on($player, 'click', blockVideoClick)
  const blockVideoDblClick = (e: Event) => {
    if (e.target === $video) {
      e.stopPropagation()
      options.onVideoDblClick?.()
    }
  }
  on($player, 'dblclick', blockVideoDblClick)

  // 1b. 阻断大播放按钮（ArtPlayer 在 $state 上绑定 click → art.play()，
  // 观众点击会在本地播放导致与房主脱同步）
  const { $state } = art.template
  const blockStateClick = (e: Event) => {
    if (e.target instanceof Node && $state.contains(e.target)) {
      e.stopPropagation()
    }
  }
  on($player, 'click', blockStateClick)

  // 2. 进度条交互拦截
  const isOnProgress = (e: Event) =>
    e.target instanceof Node && $progress.contains(e.target)

  const pointerHandler = (e: Event) => {
    if (!isOnProgress(e)) return
    const consumed = options.onProgressPointerDown?.(
      e as PointerEvent,
      $progress
    )
    // 无论是否消费都阻断 ArtPlayer 进度条行为（观众进度条永远只读）
    e.stopPropagation()
    e.preventDefault()
    void consumed
  }
  on($player, 'pointerdown', pointerHandler)

  const blockProgress = (e: Event) => {
    if (isOnProgress(e)) {
      e.stopPropagation()
    }
  }
  on($player, 'mousedown', blockProgress)
  on($player, 'touchstart', blockProgress)
  on($player, 'click', blockProgress)

  return () => {
    disposers.forEach((d) => d())
  }
}

/**
 * 计算指针在进度条上对应的时间（秒）。
 */
export function timeFromProgressEvent(
  clientX: number,
  progressEl: HTMLDivElement,
  duration: number
): number {
  const rect = progressEl.getBoundingClientRect()
  if (rect.width <= 0 || !Number.isFinite(duration) || duration <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return ratio * duration
}
