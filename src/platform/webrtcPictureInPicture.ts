import { registerPlugin } from '@capacitor/core'
import { getRuntimePlatform } from './runtime'

interface NativePictureInPicture {
  getPictureInPictureSupport(): Promise<{ supported: boolean }>
  enterPictureInPicture(options: { width: number; height: number }): Promise<void>
  exitPictureInPicture(): Promise<void>
}

const nativePiP = registerPlugin<NativePictureInPicture>('PlayerDisplay')

export async function supportsNativePictureInPicture(): Promise<boolean> {
  if (getRuntimePlatform() !== 'android') return false
  try { return (await nativePiP.getPictureInPictureSupport()).supported }
  catch { return false }
}

export function hasPictureInPictureFrame(video: HTMLVideoElement | null): video is HTMLVideoElement {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return false
  const stream = video.srcObject
  return stream instanceof MediaStream && stream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted)
}

/** Keep the original WebRTC video/decoder in the Activity. Never hand srcObject
 * to a host's URL-based media player or move/recreate the video DOM node. */
export async function enterNativePictureInPicture(
  stage: HTMLElement,
  video: HTMLVideoElement,
  onLeave: () => void,
  signal?: AbortSignal,
): Promise<(() => void) | null> {
  signal?.throwIfAborted()
  const ancestors: HTMLElement[] = []
  for (let node = stage.parentElement; node; node = node.parentElement) {
    node.setAttribute('data-native-pip-ancestor', '')
    ancestors.push(node)
  }
  stage.setAttribute('data-native-pip-player', '')
  document.documentElement.setAttribute('data-webrtc-native-pip', '')
  let disposed = false
  const restore = () => {
    if (disposed) return
    disposed = true
    signal?.removeEventListener('abort', restore)
    window.removeEventListener('zviewer:native-pip', onState)
    stage.removeAttribute('data-native-pip-player')
    ancestors.forEach(node => node.removeAttribute('data-native-pip-ancestor'))
    document.documentElement.removeAttribute('data-webrtc-native-pip')
  }
  const onState = (event: Event) => {
    if (!(event as CustomEvent<{ active: boolean }>).detail?.active) {
      restore()
      onLeave()
    }
  }
  window.addEventListener('zviewer:native-pip', onState)
  signal?.addEventListener('abort', restore, { once: true })
  try {
    // Paint the video-only layout before Android captures the transition frame.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    signal?.throwIfAborted()
    if (!stage.isConnected || !hasPictureInPictureFrame(video)) throw new Error('画面尚未就绪')
    await nativePiP.enterPictureInPicture({ width: video.videoWidth, height: video.videoHeight })
    if (disposed || !stage.isConnected) {
      restore()
      void nativePiP.exitPictureInPicture().catch(() => {})
      return null
    }
  } catch (error) {
    restore()
    throw error
  }
  return () => {
    if (disposed) return
    restore()
    void nativePiP.exitPictureInPicture().catch(() => {})
  }
}
