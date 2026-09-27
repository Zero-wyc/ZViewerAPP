import { useEffect } from 'react'
import { audioRouting } from '../platform/audioRouting'

export function useMusicAudioRouting(music: boolean, voiceActive: boolean) {
  useEffect(() => {
    const enabled = music && !voiceActive
    const apply = () => {
      void audioRouting.setMediaPlaybackPreferred(enabled).catch(error => {
        console.warn('[audio-routing] Unable to apply media policy', error)
      })
    }
    apply()
    // Media events do not bubble; capture also covers preloaded replacement audio.
    document.addEventListener('playing', apply, true)
    return () => {
      document.removeEventListener('playing', apply, true)
      void audioRouting.setMediaPlaybackPreferred(false).catch(() => {})
    }
  }, [music, voiceActive])
}
