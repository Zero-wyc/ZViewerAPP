import { type CSSProperties, type ReactNode } from 'react'

/**
 * 独立动画侧面板组件。
 *
 * 设计目标：
 * 1. 副面板 absolute 脱离文档流，不占据 flex 空间 → 主面板位置永远固定，
 *    控制栏内的播放进度条不会因副面板展开/收起而跳动。
 * 2. 仅使用 transform + opacity 做动画（GPU 合成层），避免 layout / paint。
 * 3. 与内容解耦：children 由外部传入，本组件只负责动画与定位。
 *
 * 动画细节：
 * - 位移：从右侧（被主面板遮住的位置）向左滑入 / 反向滑出
 * - 可见性：收起时 opacity:0 + visibility:hidden 完全不可见；
 *   展开时立即 visibility:visible + opacity:1 渐显
 * - 缓动：展开 ease-out，收起 ease-in，视觉更连贯
 */

export interface AnimatedSidePanelProps {
  /** 是否展开 */
  open: boolean
  /** 副面板内容宽度（固定值，不参与动画） */
  width: number
  /** 距主面板的间距 */
  gap?: number
  /** 主面板宽度（用于定位副面板在主面板左侧） */
  mainPanelWidth: number
  /** 最大高度 */
  maxHeight?: number
  /** 内容 */
  children: ReactNode
  /** 额外类名（应用到内容容器） */
  className?: string
  /** 额外样式 */
  style?: CSSProperties
}

const ENTER_DURATION = 220 // ms
const EXIT_DURATION = 180 // ms

export function AnimatedSidePanel({
  open,
  width,
  gap = 8,
  mainPanelWidth,
  maxHeight = 460,
  children,
  className,
  style,
}: AnimatedSidePanelProps) {
  // 副面板右边缘距外层容器右边的距离 = 主面板宽度 + 间距
  const rightOffset = mainPanelWidth + gap

  return (
    <div
      className="glass-strong absolute bottom-0 overflow-hidden rounded-xl border border-[var(--glass-border)] shadow-lg"
      style={{
        right: rightOffset,
        width,
        maxHeight,
        transform: open ? 'translateX(0)' : `translateX(${width + gap}px)`,
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        // visibility 延迟切换：展开时立即显示，收起时等 opacity 动画结束后隐藏
        transition: open
          ? `transform ${ENTER_DURATION}ms var(--ease-out-expo), opacity ${ENTER_DURATION}ms var(--ease-out-expo), visibility 0s`
          : `transform ${EXIT_DURATION}ms var(--ease-in-expo), opacity ${EXIT_DURATION}ms var(--ease-in-expo), visibility 0s ${EXIT_DURATION}ms`,
        pointerEvents: open ? 'auto' : 'none',
        willChange: 'transform, opacity',
        boxShadow:
          '0 8px 24px -8px color-mix(in srgb, var(--md-sys-color-shadow) 40%, transparent)',
        ...style,
      }}
    >
      <div
        className={`relative overflow-y-auto p-3 ${className ?? ''}`}
        style={{ width, maxHeight }}
      >
        {children}
      </div>
    </div>
  )
}
