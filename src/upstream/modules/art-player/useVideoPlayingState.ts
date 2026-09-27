/**
 * 轻量 video 播放状态订阅 Hook。
 *
 * 供 Portal 到 ArtPlayer 控制栏中的 React 组件使用
 * （观众端申请暂停/继续按钮需要感知当前播放状态）。
 */
import { useEffect, useState } from 'react'

export function useVideoPlayingState(video: HTMLVideoElement | null): boolean {
  const [isPlaying, setIsPlaying] = useState(() => !!video && !video.paused)

  useEffect(() => {
    if (!video) return
    const update = () => setIsPlaying(!video.paused)
    update()
    video.addEventListener('play', update)
    video.addEventListener('pause', update)
    return () => {
      video.removeEventListener('play', update)
      video.removeEventListener('pause', update)
    }
  }, [video])

  return isPlaying
}
