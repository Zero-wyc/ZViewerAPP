import { registerPlugin } from '@capacitor/core'
import type { PlayerDisplayPort } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

interface CapacitorPlayerDisplay {
  toggleOrientation(options: { isLandscape: boolean }): Promise<void>
  setImmersive(options: { enabled: boolean }): Promise<void>
  unlockOrientation(): Promise<void>
  setSystemBarStyle(options: { dark: boolean }): Promise<void>
}

const capacitorDisplay = registerPlugin<CapacitorPlayerDisplay>('PlayerDisplay')

let orientationLocked = false
export const getOrientationLocked = () => orientationLocked
export function subscribeOrientationLock(listener: () => void): () => void {
  window.addEventListener('zviewer:orientation-lock', listener)
  return () => window.removeEventListener('zviewer:orientation-lock', listener)
}
function setOrientationLocked(locked: boolean) {
  orientationLocked = locked
  window.dispatchEvent(new Event('zviewer:orientation-lock'))
}

export async function setSystemBarStyle(dark: boolean): Promise<void> {
  if (getRuntimePlatform() === 'harmony') await getHarmonyBridge()?.setSystemBarStyle?.(dark)
  else if (getRuntimePlatform() === 'android') await capacitorDisplay.setSystemBarStyle({ dark })
}

async function toggleWebOrientation(isLandscape: boolean): Promise<void> {
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (value: 'portrait' | 'landscape') => Promise<void>
  }
  if (!orientation.lock) throw new Error('Screen orientation locking is unavailable')
  await orientation.lock(isLandscape ? 'landscape' : 'portrait')
}

export const playerDisplay: PlayerDisplayPort = {
  async toggleOrientation(isLandscape) {
    const platform = getRuntimePlatform()
    if (platform === 'harmony') {
      const toggle = getHarmonyBridge()?.toggleOrientation
      if (!toggle) throw new Error('Harmony orientation bridge is unavailable')
      await toggle.call(getHarmonyBridge(), isLandscape)
      setOrientationLocked(true)
      return
    }
    if (platform === 'android' || platform === 'ios') {
      await capacitorDisplay.toggleOrientation({ isLandscape })
      setOrientationLocked(true)
      return
    }
    await toggleWebOrientation(isLandscape)
    setOrientationLocked(true)
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
    setOrientationLocked(false)
  },
}

// Native display calls can resolve after a rapid exit or room teardown. Serialize
// transitions and skip superseded requests so the last requested state wins.
let fullscreenRevision = 0
let fullscreenQueue: Promise<void> = Promise.resolve()
export function getVideoFullscreenLandscape(video?: { videoWidth: number; videoHeight: number } | null): boolean {
  return !video || video.videoWidth <= 0 || video.videoHeight <= 0 || video.videoWidth >= video.videoHeight
}

function queueDisplayTransition(apply: () => Promise<void>): Promise<void> {
  const revision = ++fullscreenRevision
  const transition = fullscreenQueue.then(async () => {
    if (revision !== fullscreenRevision) return
    await apply()
  })
  fullscreenQueue = transition.catch(() => {})
  return transition
}

/** Hide only system bars; a stale owner must not restore over a newer player. */
export function acquirePlayerImmersive(): { ready: Promise<void>; release: () => Promise<void> } {
  const ready = queueDisplayTransition(() => playerDisplay.setImmersive(true))
  const revision = fullscreenRevision
  let released = false
  return {
    ready,
    release() {
      if (released || revision !== fullscreenRevision) return Promise.resolve()
      released = true
      return queueDisplayTransition(() => playerDisplay.setImmersive(false))
    },
  }
}

export function setPlayerFullscreen(enabled: boolean, isLandscape = true): Promise<void> {
  return queueDisplayTransition(async () => {
    const operations = [playerDisplay.setImmersive(enabled)]
    const platform = getRuntimePlatform()
    if (!enabled) operations.push(playerDisplay.unlockOrientation())
    else if (platform === 'android' || platform === 'harmony') {
      operations.push(playerDisplay.toggleOrientation(isLandscape))
    }
    const results = await Promise.allSettled(operations)
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  })
}

export async function restorePlayerDisplay(): Promise<void> {
  await setPlayerFullscreen(false)
}
