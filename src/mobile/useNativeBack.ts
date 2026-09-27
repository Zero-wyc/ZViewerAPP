import { useEffect, useRef } from 'react'
import { appLifecycle } from '../platform/lifecycle'

export function useNativeBack(handler: () => void, intercept: boolean) {
  const latest = useRef({ handler, intercept })
  latest.current = { handler, intercept }

  useEffect(() => {
    let disposed = false
    let remove = () => {}
    void appLifecycle.addBackListener(() => {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else if (latest.current.intercept) {
        latest.current.handler()
      } else {
        void appLifecycle.minimize()
      }
    }).then(unsubscribe => {
      if (disposed) unsubscribe()
      else remove = unsubscribe
    })
    return () => {
      disposed = true
      remove()
    }
  }, [])
}
