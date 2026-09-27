/**
 * ArtPlayer 控制栏通用图标按钮。
 *
 * 视觉对齐 ArtPlayer 内置控件（透明白色图标、悬停高亮），
 * 通过 Portal 挂载到控制栏插槽中使用。
 */
import type { ReactNode } from 'react'

interface ArtControlButtonProps {
  icon: ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
  /** 激活态（如弹幕开关开启中） */
  active?: boolean
}

export function ArtControlButton({
  icon,
  label,
  onClick,
  disabled = false,
  active = false,
}: ArtControlButtonProps) {
  return (
    <button
      type="button"
      className="zart-btn"
      title={label}
      aria-label={label}
      disabled={disabled}
      data-active={active || undefined}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      {icon}
    </button>
  )
}
