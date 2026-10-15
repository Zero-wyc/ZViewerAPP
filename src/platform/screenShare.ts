import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { ScreenShareCapabilities, ScreenShareEvent, ScreenShareNativePort } from './contracts'
import { getRuntimePlatform } from './runtime'
import { createHarmonyScreenShare } from './harmonyScreenShare'

interface AndroidScreenShare extends ScreenShareNativePort {
  addListener(name: 'screenShareEvent', callback: (event: ScreenShareEvent) => void): Promise<PluginListenerHandle>
}
const android = registerPlugin<AndroidScreenShare>('ScreenShare')
let harmony: ScreenShareNativePort | undefined
const unsupported: ScreenShareCapabilities = {
  video: false, microphone: false, systemAudio: false, background: false, experimental: true,
  reason: '此安装包尚未提供原生屏幕共享，请使用已支持的电脑房主共享。',
}

export function getScreenShareNative(): ScreenShareNativePort | undefined {
  if (getRuntimePlatform() === 'android') return android
  if (getRuntimePlatform() === 'harmony') return harmony ??= createHarmonyScreenShare()
  return undefined
}

export async function getScreenShareCapabilities(): Promise<ScreenShareCapabilities> {
  try { return await getScreenShareNative()?.getCapabilities() ?? unsupported }
  catch { return unsupported }
}

export async function subscribeScreenShare(listener: (event: ScreenShareEvent) => void): Promise<() => void> {
  if (getRuntimePlatform() === 'android') {
    const handle = await android.addListener('screenShareEvent', listener)
    return () => { void handle.remove().catch(() => {}) }
  }
  const receive = (event: Event) => listener((event as CustomEvent<ScreenShareEvent>).detail)
  window.addEventListener('zviewer:screen-share', receive)
  return () => window.removeEventListener('zviewer:screen-share', receive)
}
