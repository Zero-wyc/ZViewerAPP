/**
 * useArtPlayer Hook：在 React 中管理 ArtPlayer 实例的生命周期。
 *
 * - 挂载时创建实例（ArtPlayer 模板在构造函数中同步生成，art.video 立即可用）
 * - 卸载时销毁实例（destroy 清理 DOM 与事件）
 * - 通过 state 暴露 art / video，下游组件在两者就绪后再挂载，
 *   保证依赖 videoRef 的业务 hooks（同步/引擎/弹幕）挂载时 video 元素已存在
 */
import { useEffect, useRef, useState } from 'react'
import Artplayer from 'artplayer'
import type { Option } from 'artplayer'
import { configureArtStatics } from './art-shared'

export interface UseArtPlayerResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  art: Artplayer | null
  video: HTMLVideoElement | null
}

export function useArtPlayer(
  buildOption: (container: HTMLDivElement) => Option
): UseArtPlayerResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<{
    art: Artplayer
    video: HTMLVideoElement
  } | null>(null)
  // latest ref pattern：构建函数始终读取最新闭包，但实例只创建一次
  const buildOptionRef = useRef(buildOption)
  useEffect(() => {
    buildOptionRef.current = buildOption
  }, [buildOption])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    configureArtStatics()
    const art = new Artplayer(buildOptionRef.current(container))
    const video = art.video
    setState({ art, video })
    return () => {
      try {
        art.destroy(false)
      } catch (err) {
        console.warn('[useArtPlayer] destroy error:', err)
      }
      setState(null)
    }
  }, [])

  return {
    containerRef,
    art: state?.art ?? null,
    video: state?.video ?? null,
  }
}
