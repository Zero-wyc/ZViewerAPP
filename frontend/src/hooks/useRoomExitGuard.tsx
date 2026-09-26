/**
 * 离开房间确认守卫。
 *
 * 当用户在房间内（activeRoomId 存在且当前路由为 /room/:roomId）时，
 * 拦截导航操作并弹出确认对话框，防止误触离开房间。
 *
 * 用法：
 * ```tsx
 * const { guardNavigate, confirmModal } = useRoomExitGuard()
 *
 * // 拦截导航
 * <button onClick={() => guardNavigate('/profile')}>个人中心</button>
 *
 * // 渲染确认对话框（放在组件树中）
 * return <>{confirmModal}{children}</>
 * ```
 */
import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useRoomStore } from '@/store/roomStore'
import { useSocket } from '@/hooks/useSocket'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { LogOut } from 'lucide-react'

export function useRoomExitGuard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { socket } = useSocket()
  const activeRoomId = useRoomStore((state) => state.activeRoomId)
  const exitRoom = useRoomStore((state) => state.exitRoom)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  /** 当前是否在房间路由内 */
  const isInRoomRoute =
    location.pathname === '/room' || location.pathname.startsWith('/room/')

  /** 是否需要守卫：有活跃房间且当前在房间路由 */
  const needsGuard = !!activeRoomId && isInRoomRoute

  /**
   * 守卫导航：如果当前在房间内，弹出确认对话框；否则直接导航。
   *
   * @param targetPath 目标路由路径
   */
  const guardNavigate = useCallback(
    (targetPath: string) => {
      if (!needsGuard) {
        navigate(targetPath)
        return
      }
      setPendingPath(targetPath)
      setConfirmOpen(true)
    },
    [needsGuard, navigate],
  )

  /** 确认离开：房主关闭房间，清除房间状态，导航到目标路径 */
  const confirmExit = useCallback(() => {
    setConfirmOpen(false)
    // 房主离开时关闭房间（与 RoomLayout.defaultBack 逻辑一致）
    if (socket && activeRoomId) {
      // 通过 sessionStorage 判断是否为房主
      try {
        const isHost = sessionStorage.getItem('zcontrol-host-room') === activeRoomId
        if (isHost) {
          socket.emit('close-room', () => {
            /* ack */
          })
        }
      } catch {
        // ignore
      }
    }
    exitRoom()
    const target = pendingPath ?? '/'
    setPendingPath(null)
    navigate(target)
  }, [socket, activeRoomId, exitRoom, pendingPath, navigate])

  /** 取消离开 */
  const cancelExit = useCallback(() => {
    setConfirmOpen(false)
    setPendingPath(null)
  }, [])

  /** 确认对话框 JSX（调用方需渲染） */
  const confirmModal = (
    <Modal
      open={confirmOpen}
      onClose={cancelExit}
      title="离开房间"
      footer={
        <>
          <Button variant="secondary" onClick={cancelExit}>
            取消
          </Button>
          <Button variant="primary" onClick={confirmExit}>
            确认离开
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 py-2">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--md-sys-color-primary-container)',
          }}
        >
          <LogOut
            className="h-5 w-5"
            style={{ color: 'var(--md-sys-color-on-primary-container)' }}
          />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
            确定要离开当前房间吗？
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
            离开后将断开与房间的连接，房主离开会关闭房间。如需再次进入需要重新加入。
          </p>
        </div>
      </div>
    </Modal>
  )

  return {
    /** 守卫导航：在房间内时弹出确认，否则直接导航 */
    guardNavigate,
    /** 确认对话框 JSX，需在组件树中渲染 */
    confirmModal,
    /** 是否需要守卫（当前在房间内） */
    needsGuard,
  }
}
