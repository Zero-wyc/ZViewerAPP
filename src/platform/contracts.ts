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

/** The platform backend owns capture, tracks, codecs and every PeerConnection. UI only relays signaling. */
export type ScreenShareState = 'idle' | 'requesting-permission' | 'starting' | 'sharing' | 'paused' | 'stopping' | 'stopped' | 'error'
export type ScreenShareErrorCode = 'unsupported' | 'permission-denied' | 'capture-start-failed' | 'capture-ended' | 'encoder-failed' | 'transport-failed' | 'cancelled'
export interface ScreenShareCapabilities {
  video: boolean
  microphone: boolean
  systemAudio: boolean
  background: boolean
  experimental: boolean
  reason?: string
}
export interface ScreenShareSession { sessionId: string }
export interface ScreenSharePeer extends ScreenShareSession { peerId: string }
export interface ScreenShareStart extends ScreenShareSession { iceServers: RTCIceServer[] }
export interface ScreenShareSettings {
  width: number
  height: number
  /** Measured capture rate; zero until measured. Never report the requested rate as measured. */
  frameRate: number
  audio: boolean
}
export interface ScreenShareEvent extends ScreenShareSession {
  type: 'state' | 'capture-ended' | 'error' | 'ice' | 'peer-state' | 'stats'
  state?: ScreenShareState
  code?: ScreenShareErrorCode
  peerId?: string
  candidate?: RTCIceCandidateInit
  connectionState?: RTCPeerConnectionState
  settings?: ScreenShareSettings
}
export interface ScreenShareNativePort {
  getCapabilities(): Promise<ScreenShareCapabilities>
  start(options: ScreenShareStart): Promise<ScreenShareSettings>
  stop(options: ScreenShareSession): Promise<void>
  pause(options: ScreenShareSession): Promise<void>
  resume(options: ScreenShareSession): Promise<void>
  createOffer(options: ScreenSharePeer): Promise<RTCSessionDescriptionInit>
  setAnswer(options: ScreenSharePeer & { description: RTCSessionDescriptionInit }): Promise<void>
  addIceCandidate(options: ScreenSharePeer & { candidate: RTCIceCandidateInit }): Promise<void>
  removePeer(options: ScreenSharePeer): Promise<void>
}

export interface HarmonyNativeBridge {
  getScreenShareCaptureSupport?(): Promise<{ supported: boolean }>
  armScreenShareCapture?(options: ScreenShareSession): Promise<void>
  cancelScreenShareCapture?(options: ScreenShareSession): Promise<void>
  getAppInfo?(): Promise<{ version: string; build: string }>
  openExternalUrl?(url: string): Promise<void>
  configureServerConnection?(policy: { url: string; allowUntrustedCertificate: boolean }): Promise<{ url: string }>
  probeServerConnection?(options: { url: string }): Promise<{ ok: boolean; code: string; status?: number }>
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
