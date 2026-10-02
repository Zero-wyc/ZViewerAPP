import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isGlobalAppearanceRuntime } from '../../../../platform/runtime'
import { attachVideoGestures } from '../../../../mobile/videoGestures'

/** The muted video follows the audio; all gesture commands target the music player. */
export function useMusicVideoGestures({ fullscreen, getAudio, onTogglePlayback, onSeek }: {
  fullscreen: boolean
  getAudio(): HTMLAudioElement | null
  onTogglePlayback(): void
  onSeek(position: number): void
}) {
  const surfaceRef = useRef<HTMLButtonElement>(null)
  const commands = useRef({ getAudio, onTogglePlayback, onSeek })
  useLayoutEffect(() => { commands.current = { getAudio, onTogglePlayback, onSeek } }, [getAudio, onTogglePlayback, onSeek])
  const [controlsVisible, setControlsVisible] = useState(false)
  useEffect(() => {
    const element = surfaceRef.current
    if (!fullscreen || !element || !isGlobalAppearanceRuntime()) return
    let timer: ReturnType<typeof setTimeout>
    const showControls = () => {
      setControlsVisible(true)
      clearTimeout(timer)
      timer = setTimeout(() => setControlsVisible(false), 3000)
    }
    showControls()
    const remove = attachVideoGestures(element, {
      surface: event => event.target === element,
      onSingleTap: showControls,
      onDoubleTap: region => {
        if (region === 0) { commands.current.onTogglePlayback(); return }
        const audio = commands.current.getAudio()
        if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
        commands.current.onSeek(Math.max(0, Math.min(audio.duration, audio.currentTime + region * 15)))
      },
    })
    return () => { clearTimeout(timer); remove() }
  }, [fullscreen])
  return { surfaceRef, controlsVisible: fullscreen && controlsVisible }
}
