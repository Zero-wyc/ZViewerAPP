import { useEffect } from 'react'
import type Artplayer from 'artplayer'
import { getFullscreenElement } from '@/lib/fullscreen-utils'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'
import { attachVideoGestures } from '../../../../mobile/videoGestures'

/** Native touch gestures are captured before ArtPlayer's click/play and double/fullscreen handlers. */
export function useWatchGestures({ art, video, stage, fullscreen, canControl, requestPlay, requestPause, requestSeek }: {
  art: Artplayer; video: HTMLVideoElement; stage: React.RefObject<HTMLDivElement>
  fullscreen: boolean; canControl: boolean
  requestPlay(): void; requestPause(): void; requestSeek(position: number): void
}) {
  useEffect(() => {
    const element = stage.current
    if (!element || !isGlobalAppearanceRuntime()) return
    return attachVideoGestures(element, {
      surface: event => event.target === video || event.target === art.template.$player ||
        (event.target instanceof Node && art.template.$state.contains(event.target)),
      onSingleTap: () => { art.controls.show = true },
      onDoubleTap: region => {
        if (region === 0) {
          if (canControl) {
            if (video.paused) void video.play().catch(() => {})
            else video.pause()
          } else if (video.paused) requestPlay()
          else requestPause()
        } else if (fullscreen || getFullscreenElement()) {
          if (!Number.isFinite(video.duration) || video.duration <= 0) return
          const position = Math.max(0, Math.min(video.duration, video.currentTime + region * 15))
          if (canControl) video.currentTime = position
          else requestSeek(position)
          art.notice.show = region < 0 ? '后退 15 秒' : '前进 15 秒'
        }
      },
    })
  }, [art, video, stage, fullscreen, canControl, requestPlay, requestPause, requestSeek])
}
