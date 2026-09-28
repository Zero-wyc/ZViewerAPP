import { registerPlugin } from '@capacitor/core'
import type { PlayerDisplayPort } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

interface CapacitorPlayerDisplay {
  toggleOrientation(): Promise<void>
  setImmersive(options: { enabled: boolean }): Promise<void>
  unlockOrientation(): Promise<void>
}

const capacitorDisplay = registerPlugin<CapacitorPlayerDisplay>('PlayerDisplay')

async function toggleWebOrientation(isLandscape: boolean): Promise<void> {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (value: 'portrait' | 'landscape') => Promise<void>
  }
  if (!orientation.lock) throw new Error('Screen orientation locking is unavailable')
  await orientation.lock(isLandscape ? 'portrait' : 'landscape')
}

export const playerDisplay: PlayerDisplayPort = {
  async toggleOrientation(isLandscape) {
    const platform = getRuntimePlatform()
    if (platform === 'harmony') {
      const toggle = getHarmonyBridge()?.toggleOrientation
      if (!toggle) throw new Error('Harmony orientation bridge is unavailable')
      await toggle.call(getHarmonyBridge(), isLandscape)
      return
    }
    if (platform === 'android' || platform === 'ios') {
      await capacitorDisplay.toggleOrientation()
      return
    }
    await toggleWebOrientation(isLandscape)
  },

  async setImmersive(enabled) {
    const platform = getRuntimePlatform()
    if (platform === 'harmony') {
      const setImmersive = getHarmonyBridge()?.setImmersive
      if (!setImmersive) throw new Error('Harmony immersive bridge is unavailable')
      await setImmersive.call(getHarmonyBridge(), enabled)
    } else if (platform === 'android' || platform === 'ios') {
      await capacitorDisplay.setImmersive({ enabled })
    }
  },

  async unlockOrientation() {
    const platform = getRuntimePlatform()
    if (platform === 'harmony') {
      const unlock = getHarmonyBridge()?.unlockOrientation
      if (!unlock) throw new Error('Harmony orientation bridge is unavailable')
      await unlock.call(getHarmonyBridge())
    } else if (platform === 'android' || platform === 'ios') {
      await capacitorDisplay.unlockOrientation()
    } else {
      screen.orientation?.unlock?.()
    }
  },
}

export async function restorePlayerDisplay(): Promise<void> {
  await playerDisplay.setImmersive(false)
  await playerDisplay.unlockOrientation()
}
