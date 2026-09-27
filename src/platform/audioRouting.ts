import { registerPlugin } from '@capacitor/core'
import type { AudioRoutingPort } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

interface CapacitorAudioRouting {
  setMediaOnly(options: { enabled: boolean }): Promise<void>
}

const capacitorAudioRouting = registerPlugin<CapacitorAudioRouting>('AudioRouting')

export const audioRouting: AudioRoutingPort = {
  async setMediaPlaybackPreferred(enabled) {
    const platform = getRuntimePlatform()
    if (platform === 'android') {
      await capacitorAudioRouting.setMediaOnly({ enabled })
    } else if (platform === 'harmony') {
      await getHarmonyBridge()?.setMediaPlaybackPreferred?.(enabled)
    }
    // WKWebView already uses the media route by default. An iOS-specific
    // AVAudioSession adapter can be added here without changing callers.
  },
}
