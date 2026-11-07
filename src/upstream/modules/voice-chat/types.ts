export interface VoiceMember { id: string; username: string }
export interface UseVoiceChatOptions { roomId: string | undefined; username?: string }
export type VoiceTransport = 'udp' | 'tcp'
export type VoiceMediaStatus = 'idle' | 'connecting' | 'connected' | 'recovering' | 'timeout'
export interface VoiceChatController {
  joined: boolean
  joining: boolean
  micEnabled: boolean
  mediaConnected: boolean
  mediaStatus: VoiceMediaStatus
  selfId: string | null
  members: VoiceMember[]
  transport: VoiceTransport | null
  globalVolume: number
  peerVolumes: Map<string, number>
  micVolume: number
  monitorEnabled: boolean
  audioLevels: Map<string, number>
  voiceMutedIds: Set<string>
  audioBlocked: boolean
  resumeAudio(): Promise<void>
  join(): Promise<void>
  leave(): void
  toggleMic(): void
  toggleMonitor(): void
  setGlobalVolume(value: number): void
  setPeerVolume(id: string, value: number): void
  setMicVolume(value: number): void
  muteVoiceMember(id: string, muted: boolean): Promise<{ success: boolean; message?: string }>
  kickVoiceMember(id: string): Promise<{ success: boolean; message?: string }>
}
