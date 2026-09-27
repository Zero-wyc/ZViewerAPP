import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './controls.css'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 图标节点（lucide 等），尺寸由 .vc-icon-btn 自动缩放 */
  icon: ReactNode
  /** 无障碍标签，同时作为 tooltip 显示 */
  label?: string
  /** 选中态：高亮背景 */
  active?: boolean
  /** 视觉变体：ghost 透明底、tonal 半透明底、primary 主色底 */
  variant?: 'ghost' | 'tonal' | 'primary'
  /** 尺寸：默认 md，紧凑场景用 sm */
  size?: 'sm' | 'md'
}

/**
 * 视频控制栏统一的方形图标按钮。
 * - 尺寸通过 CSS 容器查询单位（cqw）随父容器宽度自由缩放；
 * - 取代原先各控制栏各自实现的原始 <button>，消除重复代码。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      active,
      variant = 'ghost',
      size = 'md',
      className,
      title,
      ...props
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        type="button"
        title={title ?? label}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'vc-icon-btn inline-flex shrink-0 items-center justify-center rounded-lg',
          'outline-none transition-all duration-200',
          'text-[var(--md-sys-color-on-surface)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--md-sys-color-surface)]',
          'hover:-translate-y-0.5 hover:bg-[var(--md-sys-color-surface-container-highest)] hover:shadow-sm',
          'active:translate-y-0 active:scale-95',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none',
          size === 'sm' && 'vc-icon-btn-sm',
          variant === 'tonal' &&
            'bg-[var(--md-sys-color-surface-container-high)] hover:bg-[var(--md-sys-color-surface-container-highest)]',
          variant === 'primary' &&
            'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] hover:bg-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-on-primary)]',
          active &&
            'bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]',
          className
        )}
        {...props}
      >
        {icon}
      </button>
    )
  }
)
