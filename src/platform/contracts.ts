export type RuntimePlatform = 'web' | 'android' | 'ios' | 'harmony'

export interface BilibiliProxyStatus {
  supported: boolean
  ready: boolean
  loggedIn: boolean
  proxyUrl: string
  sessionVersion: number
  user?: { name?: string; vipStatus?: number; valid?: boolean }
  error?: string
}

export interface BilibiliQrSession {
  qrcodeKey: string
  qrDataUrl: string
}

export interface PlayerDisplayPort {
  toggleOrientation(isLandscape: boolean): Promise<void>
  setImmersive(enabled: boolean): Promise<void>
  unlockOrientation(): Promise<void>
}

export interface AudioRoutingPort {
  setMediaPlaybackPreferred(enabled: boolean): Promise<void>
}

export interface AppLifecyclePort {
  addBackListener(listener: () => void): Promise<() => void>
  minimize(): Promise<void>
}

export interface PermissionsPort {
  supportsMicrophoneCapture(): boolean
  requestMicrophoneStream(constraints: MediaStreamConstraints): Promise<MediaStream>
}

export interface HarmonyNativeBridge {
  platform?: 'harmony'
  toggleOrientation?(isLandscape: boolean): void | Promise<void>
  setImmersive?(enabled: boolean): void | Promise<void>
  unlockOrientation?(): void | Promise<void>
  setMediaPlaybackPreferred?(enabled: boolean): void | Promise<void>
  minimizeApp?(): void | Promise<void>
  requestMicrophonePermission?(): boolean | Promise<boolean>
}

declare global {
  interface Window {
    zviewerNative?: HarmonyNativeBridge
  }
}
