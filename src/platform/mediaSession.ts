import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import type { SystemMediaCommand, SystemMediaState } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

interface NativeMediaSession {
  update(options: SystemMediaState): Promise<void>
  clear(options: { sessionId: string }): Promise<void>
  addListener(event: 'mediaCommand', callback: (command: SystemMediaCommand) => void): Promise<PluginListenerHandle>
}
const nativeMedia = registerPlugin<NativeMediaSession>('SystemMediaSession')

export async function updateSystemMedia(state: SystemMediaState): Promise<void> {
  if (getRuntimePlatform() === 'android') await nativeMedia.update(state)
  else if (getRuntimePlatform() === 'harmony') {
    const update = getHarmonyBridge()?.updateMediaSession
    if (!update) throw new Error('Harmony media session bridge is unavailable')
    await update(state)
  }
}

export async function clearSystemMedia(sessionId: string): Promise<void> {
  if (getRuntimePlatform() === 'android') await nativeMedia.clear({ sessionId })
  else if (getRuntimePlatform() === 'harmony') await getHarmonyBridge()?.clearMediaSession?.(sessionId)
}

export async function listenSystemMedia(callback: (command: SystemMediaCommand) => void): Promise<() => void> {
  if (getRuntimePlatform() === 'android') {
    const listener = await nativeMedia.addListener('mediaCommand', callback)
    return () => { void listener.remove() }
  }
  const listener = (event: Event) => callback((event as CustomEvent<SystemMediaCommand>).detail)
  window.addEventListener('zviewer:media-command', listener)
  return () => window.removeEventListener('zviewer:media-command', listener)
}
