import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DoorOpen, X } from 'lucide-react'
import { useRoomStore } from '@/store/roomStore'
import { cn } from '@/lib/utils'

/**
 * "回到房间"浮动入口。
 *
 * 当用户进入过房间后导航到其他页面（如个人中心、房间列表）时，
 * 在右上角显示一个浮动按钮，点击即可快速回到房间。
 *
 * 工作原理：
 * - RoomPage 挂载时设置 roomStore.activeRoomId
 * - 用户导航到非 /room/:roomId 页面时，RoomPage 卸载但 activeRoomId 保留
 * - 此组件检测到 activeRoomId 存在且当前不在房间路由，显示浮动入口
 * - 用户点击"回到房间"导航回 /room/:activeRoomId
 * - 用户点击关闭按钮调用 exitRoom() 清除房间状态（等同于退出房间）
 */
export function ReturnToRoomButton() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeRoomId = useRoomStore((state) => state.activeRoomId)
  const roomName = useRoomStore((state) => state.roomName)
  const exitRoom = useRoomStore((state) => state.exitRoom)

  // 当前路由是否为房间页面。
  // 注意：不能用 startsWith('/room')，否则 /rooms（房间列表）会被误判。
  // 房间路由只有两种形式：/room（无 roomId）和 /room/:roomId
  const isInRoomRoute =
    location.pathname === '/room' || location.pathname.startsWith('/room/')

  // 是否应该显示：有活跃房间且不在房间页面
  const shouldShow = !!activeRoomId && !isInRoomRoute

  // 渲染状态：配合退场动画，shouldShow=false 时延迟卸载
  const [render, setRender] = useState(false)
  const [exiting, setExiting] = useState(false)

  // React Compiler 严格规则误报：render/exiting 仅用于入场/退场动画状态同步。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (shouldShow) {
      setRender(true)
      setExiting(false)
    } else if (render) {
      // 播放退场动画后卸载
      setExiting(true)
      const timer = setTimeout(() => {
        setRender(false)
        setExiting(false)
      }, 280)
      return () => clearTimeout(timer)
    }
  }, [shouldShow, render])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!render || !activeRoomId) return null

  const handleReturn = () => {
    navigate(`/room/${activeRoomId}`)
  }

  const handleExit = (e: React.MouseEvent) => {
    e.stopPropagation()
    exitRoom()
  }

  return (
    <div
      className={cn(
        'fixed top-20 right-4 z-40',
        exiting ? 'zen-toast-exit' : 'zen-toast-enter'
      )}
    >
      <button
        onClick={handleReturn}
        className={cn(
          'group flex items-center gap-2.5 rounded-[var(--md-sys-shape-corner)] border border-[var(--glass-border)] px-4 py-2.5 shadow-lg transition-all duration-200',
          'hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]'
        )}
        style={{
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur-strong))',
          WebkitBackdropFilter: 'blur(var(--glass-blur-strong))',
          boxShadow:
            '0 8px 24px -8px color-mix(in srgb, var(--md-sys-color-primary) 25%, transparent)',
        }}
        title="回到房间"
      >
        {/* 图标容器：Material 3 container 纯色背景 */}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-corner)]"
          style={{
            backgroundColor: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
          }}
        >
          <DoorOpen className="h-4 w-4" />
        </span>

        <div className="flex flex-col items-start">
          <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
            回到房间
          </span>
          {roomName ? (
            <span className="text-[10px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
              {roomName}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-[var(--md-sys-color-on-surface-variant)]">
              {activeRoomId}
            </span>
          )}
        </div>

        {/* 关闭按钮：点击退出房间（清除活跃房间标记） */}
        <span
          onClick={handleExit}
          role="button"
          tabIndex={0}
          className="ml-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full opacity-50 transition-all hover:scale-110 hover:opacity-100"
          title="退出房间"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent)',
          }}
        >
          <X className="h-3 w-3 text-[var(--md-sys-color-on-surface)]" />
        </span>
      </button>
    </div>
  )
}
