import { useEffect, useState } from 'react'
import type { ScreenShareCapabilities } from '../platform/contracts'
import { getScreenShareCapabilities } from '../platform/screenShare'

export function useScreenShareCapabilities() {
  const [capability, setCapability] = useState<ScreenShareCapabilities>()
  useEffect(() => {
    let mounted = true
    void getScreenShareCapabilities().then(value => { if (mounted) setCapability(value) })
    return () => { mounted = false }
  }, [])
  return capability
}
