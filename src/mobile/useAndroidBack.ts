import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

export function useAndroidBack(handler: () => void, intercept: boolean) {
  const latest = useRef({ handler, intercept })
  latest.current = { handler, intercept }
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let disposed = false
    const subscription = App.addListener('backButton', () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else if (latest.current.intercept) {
        latest.current.handler()
      } else {
        void App.minimizeApp()
      }
    })
    void subscription.then(listener => { if (disposed) void listener.remove() })
    return () => {
      disposed = true
      void subscription.then(listener => listener.remove())
    }
  }, [])
}
