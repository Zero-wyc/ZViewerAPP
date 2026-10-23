import { useEffect, useState } from 'react'
import { App } from '@capacitor/app'
import { getRuntimePlatform } from '../platform/runtime'

/** Native playback WebViews can stay active while their application is hidden. */
export function useAppVisibility(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    let disposed = false
    let removeNative: (() => void) | undefined
    let nativeVisible: boolean | undefined
    const update = () => setVisible(nativeVisible ?? !document.hidden)
    const nativeVisibility = (event: Event) => {
      const active = (event as CustomEvent<{ active?: boolean }>).detail?.active
      if (typeof active === 'boolean') { nativeVisible = active; update() }
    }
    document.addEventListener('visibilitychange', update)
    window.addEventListener('zviewer:app-visibility', nativeVisibility)
    if (getRuntimePlatform() === 'android') {
      void App.addListener('appStateChange', ({ isActive }) => {
        if (!disposed) { nativeVisible = isActive; update() }
      }).then(listener => {
        if (disposed) void listener.remove()
        else removeNative = () => { void listener.remove() }
      }).catch(() => {})
      void App.getState().then(({ isActive }) => {
        if (!disposed && nativeVisible === undefined) { nativeVisible = isActive; update() }
      }).catch(() => {})
    }
    return () => {
      disposed = true
      removeNative?.()
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('zviewer:app-visibility', nativeVisibility)
    }
  }, [])
  return visible
}
