import { registerPlugin } from '@capacitor/core'
import { getRuntimePlatform } from './runtime'

interface RoomMicrophoneCoordination {
  setRoomMicrophoneActive(options: { active: boolean }): Promise<void>
  setMicrophonePolicy(options: { adminMuted: boolean; voicePublishing: boolean }): Promise<void>
}

const android = registerPlugin<RoomMicrophoneCoordination>('ScreenShare')
let operation: Promise<void> = Promise.resolve()

function enqueue(task: () => Promise<void>): Promise<void> {
  if (getRuntimePlatform() !== 'android') return Promise.resolve()
  const next = operation.catch(() => {}).then(task)
  operation = next
  return next
}

/** Android's native screen sender must release its recorder before WebView opens one. */
export function coordinateRoomMicrophone(active: boolean): Promise<void> {
  return enqueue(() => android.setRoomMicrophoneActive({ active }))
}

/** Keep known moderation in the native sender even after room voice releases its recorder. */
export function coordinateMicrophonePolicy(policy: { adminMuted: boolean; voicePublishing: boolean }): Promise<void> {
  return enqueue(() => android.setMicrophonePolicy(policy))
}
