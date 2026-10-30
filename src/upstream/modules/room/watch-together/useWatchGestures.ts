import { useEffect, useLayoutEffect, useRef } from 'react'
import type Artplayer from 'artplayer'
import { formatDuration } from '@/lib/utils'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'
import { attachWatchVideoGestures, type WatchDrag } from '../../../../mobile/watchVideoGestures'
import { createBrightnessGesture } from '../../../../mobile/playerBrightness'

/** Commands keep the room's existing host/guest authorization and synchronization path. */
export function useWatchGestures({ art, video, stage, mediaKey, canControl, isPlaying, togglePlayback, toggleControls, requestPlay, requestPause, requestSeek }: {
  art: Artplayer; video: HTMLVideoElement; stage: React.RefObject<HTMLDivElement>
  mediaKey: string; canControl: boolean; toggleControls(): void
  isPlaying: boolean; togglePlayback(): void
  requestPlay(): void; requestPause(): void; requestSeek(position: number): void
}) {
  const commands = useRef({ canControl, isPlaying, togglePlayback, toggleControls, requestPlay, requestPause, requestSeek })
  useLayoutEffect(() => { commands.current = { canControl, isPlaying, togglePlayback, toggleControls, requestPlay, requestPause, requestSeek } },
    [canControl, isPlaying, togglePlayback, toggleControls, requestPlay, requestPause, requestSeek])
  useEffect(() => {
    const element = stage.current
    if (!element || !isGlobalAppearanceRuntime()) return
    const brightness = createBrightnessGesture(text => { art.notice.show = text })
    let drag: { kind: WatchDrag; time: number; duration: number; volume: number; target: number | null } | null = null
    const seek = (position: number) => {
      if (commands.current.canControl) video.currentTime = position
      else commands.current.requestSeek(position)
    }
    const remove = attachWatchVideoGestures(element, {
      touchSurfaces: [video, art.template.$state],
      surface: event => event.target === video || event.target === art.template.$player ||
        (event.target instanceof Node && art.template.$state.contains(event.target)),
      onSingleTap: () => commands.current.toggleControls(),
      onDoubleTap: region => {
        if (region === 0) {
          if (commands.current.canControl) {
            commands.current.togglePlayback()
          } else if (commands.current.isPlaying) commands.current.requestPause()
          else commands.current.requestPlay()
        } else {
          if (!Number.isFinite(video.duration) || video.duration <= 0 || !Number.isFinite(video.currentTime)) return
          seek(Math.max(0, Math.min(video.duration, video.currentTime + region * 15)))
          art.notice.show = `${commands.current.canControl ? '' : '申请'}${region < 0 ? '后退' : '前进'} 15 秒`
        }
      },
      onDragStart: kind => {
        if (kind === 'brightness') brightness.begin()
        drag = { kind, time: video.currentTime, duration: video.duration,
          volume: video.muted ? 0 : video.volume, target: null }
      },
      onDrag: (kind, fraction) => {
        if (!drag || drag.kind !== kind) return
        if (kind === 'brightness') brightness.move(fraction)
        else if (kind === 'volume') {
          const volume = Math.max(0, Math.min(1, drag.volume + fraction))
          video.volume = volume
          video.muted = volume === 0
          art.notice.show = `音量 ${Math.round(volume * 100)}%`
        } else if (Number.isFinite(drag.duration) && drag.duration > 0 && Number.isFinite(drag.time)) {
          // One screen width covers at most three minutes; commit once, on release.
          drag.target = Math.max(0, Math.min(drag.duration, drag.time + fraction * Math.min(180, drag.duration)))
          art.notice.show = `${commands.current.canControl ? '跳转' : '申请跳转'} ${formatDuration(drag.target)} / ${formatDuration(drag.duration)}`
        }
      },
      onDragEnd: (kind, cancelled) => {
        if (kind === 'brightness') brightness.end(cancelled)
        if (!cancelled && drag?.target != null) seek(drag.target)
        drag = null
        art.notice.show = ''
      },
    })
    video.addEventListener('emptied', remove.cancel)
    return () => { video.removeEventListener('emptied', remove.cancel); remove(); brightness.dispose() }
  }, [art, video, stage, mediaKey, canControl])
}
