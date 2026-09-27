import { useEffect } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const AudioRouting = registerPlugin<{
  setMediaOnly(options: { enabled: boolean }): Promise<void>
}>('AudioRouting')

export function useMusicAudioRouting(music: boolean, voiceActive: boolean) {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return
    const enabled = music && !voiceActive
    const apply = () => {
      void AudioRouting.setMediaOnly({ enabled }).catch(error => {
        console.warn('[audio-routing] Unable to apply media policy', error)
      })
    }
    apply()
    // Media events do not bubble; capture also covers preloaded replacement audio.
    document.addEventListener('playing', apply, true)
    return () => {
      document.removeEventListener('playing', apply, true)
      void AudioRouting.setMediaOnly({ enabled: false }).catch(() => {})
    }
  }, [music, voiceActive])
}
