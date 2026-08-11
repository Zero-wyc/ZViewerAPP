/**
 * useControlBarAutoHide —— 控制栏自动隐藏 Hook。
 *
 * 逻辑仿照 WatchTogetherCore 的控制栏显隐行为：
 * - 桌面端：控制栏默认显示，鼠标 2s 内无移动自动隐藏，鼠标移动时恢复显示。
 * - 移动端：控制栏默认隐藏，手指触摸屏幕时显示，松开 3s 后自动隐藏。
 * - 鼠标离开播放区域时立即隐藏（桌面端）。
 *
 * 使用方式：
 *   const stageRef = useRef<HTMLDivElement>(null)
 *   const controlBarVisible = useControlBarAutoHide(stageRef)
 *   // 根据 controlBarVisible 控制 UI 显隐
 */
import { useEffect, useRef, useState } from 'react'

export interface UseControlBarAutoHideOptions {
  /** 桌面端自动隐藏延迟 (ms)，默认 2000 */
  desktopDelay?: number
  /** 移动端自动隐藏延迟 (ms)，默认 3000 */
  mobileDelay?: number
  /** 是否禁用自动隐藏（始终显示），默认 false */
  disabled?: boolean
}

export function useControlBarAutoHide(
  stageRef: React.RefObject<HTMLElement | null>,
  options: UseControlBarAutoHideOptions = {}
): boolean {
  const { desktopDelay = 2000, mobileDelay = 3000, disabled = false } = options

  // 移动端检测（与 WatchTogetherCore 一致）
  const [isMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
  )

  // 控制栏可见性：移动端默认隐藏，桌面端默认显示
  const [controlBarVisible, setControlBarVisible] = useState(!isMobile)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (disabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 禁用时需确保控制栏可见
      setControlBarVisible(true)
      return
    }

    const stage = stageRef.current
    if (!stage) return

    const HIDE_DELAY = isMobile ? mobileDelay : desktopDelay

    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }

    const scheduleIdleHide = () => {
      clearIdleTimer()
      idleTimerRef.current = setTimeout(() => {
        setControlBarVisible(false)
      }, HIDE_DELAY)
    }

    // ── PointerEvent 处理 ──────────────────────────────
    const handlePointerMove = (e: PointerEvent) => {
      setControlBarVisible(true)
      // 触摸滑动：手指按住期间一直显示，不启动隐藏计时，松开后再计时
      if (e.pointerType === 'touch') {
        clearIdleTimer()
        return
      }
      scheduleIdleHide()
    }

    const handlePointerLeave = (e: PointerEvent) => {
      // 触摸场景不因 pointerleave 隐藏
      if (e.pointerType === 'touch') return
      setControlBarVisible(false)
      clearIdleTimer()
    }

    const handlePointerDown = (e: PointerEvent) => {
      setControlBarVisible(true)
      // 移动端触摸：按住期间一直显示，松开后再计时隐藏
      if (e.pointerType === 'touch') {
        clearIdleTimer()
        return
      }
      handlePointerMove(e)
    }

    const handlePointerUp = (e: PointerEvent) => {
      // 触摸松开：开始隐藏倒计时
      if (e.pointerType === 'touch') {
        scheduleIdleHide()
      }
    }

    // ── touch 事件兜底（旧设备 / 不支持 PointerEvent 的浏览器）────
    const handleTouchStart = () => {
      setControlBarVisible(true)
      clearIdleTimer()
    }
    const handleTouchMove = () => {
      setControlBarVisible(true)
      clearIdleTimer()
    }
    const handleTouchEnd = () => {
      scheduleIdleHide()
    }

    stage.addEventListener('pointermove', handlePointerMove)
    stage.addEventListener('pointerleave', handlePointerLeave)
    stage.addEventListener('pointerdown', handlePointerDown)
    // pointerup 绑到 window：确保手指在任意位置松开都能触发隐藏计时
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    // touch 兜底
    stage.addEventListener('touchstart', handleTouchStart, { passive: true })
    stage.addEventListener('touchmove', handleTouchMove, { passive: true })
    stage.addEventListener('touchend', handleTouchEnd, { passive: true })
    stage.addEventListener('touchcancel', handleTouchEnd, { passive: true })

    if (!isMobile) {
      // 桌面端：初始默认显示，随后按空闲逻辑自动隐藏
      scheduleIdleHide()
    }
    // 移动端：初始已隐藏，触摸屏幕时显示并 3s 后自动隐藏

    return () => {
      stage.removeEventListener('pointermove', handlePointerMove)
      stage.removeEventListener('pointerleave', handlePointerLeave)
      stage.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      stage.removeEventListener('touchstart', handleTouchStart)
      stage.removeEventListener('touchmove', handleTouchMove)
      stage.removeEventListener('touchend', handleTouchEnd)
      stage.removeEventListener('touchcancel', handleTouchEnd)
      clearIdleTimer()
    }
  }, [stageRef, isMobile, desktopDelay, mobileDelay, disabled])

  return controlBarVisible
}
