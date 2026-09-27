import type { PermissionsPort } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'

function permissionDenied(): DOMException {
  return new DOMException('Microphone permission was denied by the native host', 'NotAllowedError')
}

export const permissions: PermissionsPort = {
  supportsMicrophoneCapture() {
    return Boolean(navigator.mediaDevices?.getUserMedia)
  },

  async requestMicrophoneStream(constraints) {
    if (getRuntimePlatform() === 'harmony') {
      const request = getHarmonyBridge()?.requestMicrophonePermission
      if (request && !await request.call(getHarmonyBridge())) throw permissionDenied()
    }
    if (!this.supportsMicrophoneCapture()) {
      throw new DOMException('Microphone capture is unavailable', 'NotSupportedError')
    }
    return navigator.mediaDevices.getUserMedia(constraints)
  },
}
