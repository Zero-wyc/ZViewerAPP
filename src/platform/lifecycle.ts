import { App } from '@capacitor/app'
import type { AppLifecyclePort } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

const HARMONY_BACK_EVENT = 'zviewer:native-back'

export const appLifecycle: AppLifecyclePort = {
  async addBackListener(listener) {
    const platform = getRuntimePlatform()
    if (platform === 'android') {
      const handle = await App.addListener('backButton', listener)
      return () => { void handle.remove() }
    }
    if (platform === 'harmony') {
      window.addEventListener(HARMONY_BACK_EVENT, listener)
      return () => window.removeEventListener(HARMONY_BACK_EVENT, listener)
    }
    return () => {}
  },

  async minimize() {
    const platform = getRuntimePlatform()
    if (platform === 'android') {
      await App.minimizeApp()
    } else if (platform === 'harmony') {
      await getHarmonyBridge()?.minimizeApp?.()
    }
  },
}
