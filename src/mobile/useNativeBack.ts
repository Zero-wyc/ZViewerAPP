import { useEffect, useRef } from 'react'
import { appLifecycle } from '../platform/lifecycle'

export function useNativeBack(handler: () => void, intercept: boolean) {
  const latest = useRef({ handler, intercept })
  latest.current = { handler, intercept }

  useEffect(() => {
    let disposed = false
    let remove = () => {}
    void appLifecycle.addBackListener(() => {
      if (document.querySelector('[data-mobile-appearance]')) {
        window.dispatchEvent(new Event('mobile-appearance-close'))
        return
      }
      // 设置弹层优先处理返回：先返回上一级，再关闭，不退出全屏或房间。
      const settingsDialog = document.querySelector<HTMLDialogElement>('dialog[data-player-settings][open]')
      if (settingsDialog) {
        settingsDialog.dispatchEvent(new Event('cancel', { cancelable: true }))
        return
      }
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
