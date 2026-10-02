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

export interface HarmonyBilibiliQrSession {
  qrcodeKey: string
  qrUrl: string
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
  updateMediaSession?(state: SystemMediaState): Promise<void>
  clearMediaSession?(sessionId: string): Promise<void>
  toggleOrientation?(isLandscape: boolean): void | Promise<void>
  setImmersive?(enabled: boolean): void | Promise<void>
  setSystemBarStyle?(dark: boolean): void | Promise<void>
  unlockOrientation?(): void | Promise<void>
  setMediaPlaybackPreferred?(enabled: boolean): void | Promise<void>
  minimizeApp?(): void | Promise<void>
  requestMicrophonePermission?(): boolean | Promise<boolean>
  bilibiliStart?(): Promise<BilibiliProxyStatus>
  bilibiliStatus?(): Promise<BilibiliProxyStatus>
  bilibiliCreateQr?(): Promise<HarmonyBilibiliQrSession>
  bilibiliPollQr?(key: string): Promise<{ status: number; message?: string; loggedIn?: boolean; proxyStatus?: BilibiliProxyStatus }>
  bilibiliCancelQr?(): Promise<void>
  bilibiliLogout?(): Promise<BilibiliProxyStatus>
}

export type SystemMediaAction = 'play' | 'pause' | 'stop' | 'previoustrack' | 'nexttrack' | 'seekto'
export interface SystemMediaState {
  sessionId: string
  mediaId: string
  kind: 'audio' | 'video'
  title: string
  artist: string
  album: string
  artwork: string
  /** Standard LRC and the current line; absent for video/no-lyric tracks. */
  lyric?: string
  lyricLine?: string
  playing: boolean
  position: number
  duration: number
  playbackRate: number
  actions: SystemMediaAction[]
}
export interface SystemMediaCommand {
  sessionId: string
  action: SystemMediaAction
  position?: number
}

declare global {
  interface Window {
    zviewerNative?: HarmonyNativeBridge
  }
}
