import { useEffect } from 'react'
import { acquirePlayerImmersive } from '../platform/playerDisplay'
import { isGlobalAppearanceRuntime } from '../platform/runtime'

/** Expanded music keeps the user's orientation and restores bars after collapse. */
export function useMusicOverlayImmersive(open: boolean): void {
  useEffect(() => {
    if (!open || !isGlobalAppearanceRuntime()) return
    const display = acquirePlayerImmersive()
    void display.ready.catch(() => {})
    return () => { void display.release().catch(() => {}) }
  }, [open])
}
