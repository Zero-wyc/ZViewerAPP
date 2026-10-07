import { connectionUrl } from '../../../../platform/connectionTransport'
import { detectVoiceTransport, voicePeerConnections, type VoiceTransport } from '../transport'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioPresets, ConnectionState, DisconnectReason, Room, RoomEvent, Track } from 'livekit-client'
import type { RemoteParticipant, RemoteTrack } from 'livekit-client'
import { apiFetch, getApiUrl } from '@/lib/api'
import { message } from '@/components/ui/message'
import { ROOM_MEDIA_TEARDOWN_EVENT } from '@/lib/mediaTeardown'
import { permissions } from '../../../../platform/permissions'

export interface VoiceMember { id: string; username: string }
export interface UseVoiceChatOptions { roomId: string | undefined; username?: string }

function adminMuted(metadata?: string) {
  try { return JSON.parse(metadata || '{}').adminMuted === true } catch { return false }
}

/** LiveKit owns transport/reconnection; native hosts retain permissions and audio routing. */
export function useVoiceChat({ roomId, username }: UseVoiceChatOptions) {
  const [transport, setTransport] = useState<VoiceTransport | null>(null)
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [mediaConnected, setMediaConnected] = useState(false)
  const [micEnabled, setMicEnabled] = useState(true)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [members, setMembers] = useState<VoiceMember[]>([])
  const [globalVolume, setGlobalVolumeState] = useState(1)
  const [peerVolumes, setPeerVolumes] = useState<Map<string, number>>(new Map())
  const [audioLevels, setAudioLevels] = useState<Map<string, number>>(new Map())
  const [voiceMutedIds, setVoiceMutedIds] = useState<Set<string>>(new Set())
  const [monitorEnabled, setMonitorEnabled] = useState(false)
  const [micVolume, setMicVolumeState] = useState(1)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const roomRef = useRef<Room | null>(null)
  const generation = useRef(0)
  const busy = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const localStream = useRef<MediaStream | null>(null)
  const micTrack = useRef<MediaStreamTrack | null>(null)
  const captureCtx = useRef<AudioContext | null>(null)
  const levelsCtx = useRef<AudioContext | null>(null)
  const micGain = useRef<GainNode | null>(null)
  const monitorGain = useRef<GainNode | null>(null)
  const monitorAudio = useRef<HTMLAudioElement | null>(null)
  const localAnalyser = useRef<AnalyserNode | null>(null)
  const micIntent = useRef(true)
  const monitorIntent = useRef(false)
  const micVolumeRef = useRef(1)
  const volumeRef = useRef(1)
  const peerVolumeRef = useRef<Map<string, number>>(new Map())
  const remote = useRef(new Map<string, { audio: HTMLAudioElement; track: RemoteTrack; analyser: AnalyserNode | null; source: MediaStreamAudioSourceNode | null }>())

  const cleanupRemote = useCallback((id: string) => {
    const entry = remote.current.get(id)
    if (!entry) return
    remote.current.delete(id)
    entry.source?.disconnect()
    entry.analyser?.disconnect()
    entry.track.detach(entry.audio)
    entry.audio.pause()
    entry.audio.srcObject = null
    entry.audio.remove()
  }, [])

  const leave = useCallback(() => {
    ++generation.current
    busy.current = false
    abortRef.current?.abort()
    abortRef.current = null
    const room = roomRef.current
    roomRef.current = null
    room?.removeAllListeners()
    if (room) void room.disconnect().catch(() => {})
    micTrack.current?.stop()
    micTrack.current = null
    localStream.current?.getTracks().forEach(track => track.stop())
    localStream.current = null
    for (const id of remote.current.keys()) cleanupRemote(id)
    captureCtx.current?.close().catch(() => {})
    levelsCtx.current?.close().catch(() => {})
    captureCtx.current = null
    levelsCtx.current = null
    micGain.current = null
    monitorGain.current = null
    localAnalyser.current = null
    monitorAudio.current?.pause()
    if (monitorAudio.current) { monitorAudio.current.srcObject = null; monitorAudio.current.remove() }
    monitorAudio.current = null
    peerVolumeRef.current.clear()
    micIntent.current = true
    monitorIntent.current = false
    setTransport(null)
    setJoined(false)
    setJoining(false)
    setMediaConnected(false)
    setMicEnabled(true)
    setSelfId(null)
    setMembers([])
    setVoiceMutedIds(new Set())
    setPeerVolumes(new Map())
    setAudioLevels(new Map())
    setMonitorEnabled(false)
    setAudioBlocked(false)
  }, [cleanupRemote])

  const applyVolume = useCallback((id: string) => {
    const entry = remote.current.get(id)
    if (entry) entry.audio.volume = Math.min(1, (peerVolumeRef.current.get(id) ?? 1) * volumeRef.current)
  }, [])

  const attachRemote = useCallback((participant: RemoteParticipant, track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return
    const id = participant.identity
    if (remote.current.get(id)?.track === track) return
    cleanupRemote(id)
    const audio = document.createElement('audio')
    audio.autoplay = true
    audio.dataset.voiceMember = id
    audio.style.display = 'none'
    document.body.appendChild(audio)
    track.attach(audio)
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    try {
      levelsCtx.current ??= new AudioContext()
      source = levelsCtx.current.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
      analyser = levelsCtx.current.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
    } catch { /* Playback remains available without level analysis. */ }
    remote.current.set(id, { audio, track, source, analyser })
    applyVolume(id)
    const activeRoom = roomRef.current
    void audio.play().catch(() => { if (roomRef.current === activeRoom && remote.current.get(id)?.audio === audio) setAudioBlocked(true) })
  }, [applyVolume, cleanupRemote])

  const refreshMembers = useCallback((room: Room) => {
    if (roomRef.current !== room) return
    setMembers([room.localParticipant, ...room.remoteParticipants.values()].map(p => ({ id: p.identity, username: p.name || '成员' })))
    const muted = new Set<string>()
    for (const p of [room.localParticipant, ...room.remoteParticipants.values()]) if (adminMuted(p.metadata)) muted.add(p.identity)
    setVoiceMutedIds(muted)
    const enabled = micIntent.current && !muted.has(room.localParticipant.identity)
    if (micTrack.current) micTrack.current.enabled = enabled
    setMicEnabled(enabled)
  }, [])

  const join = useCallback(async () => {
    if (!roomId || busy.current || roomRef.current) return
    busy.current = true
    const epoch = ++generation.current
    const server = getApiUrl()
    const active = () => generation.current === epoch && getApiUrl() === server
    const controller = new AbortController()
    abortRef.current = controller
    setJoining(true)
    try {
      const res = await apiFetch('/api/voice/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, username }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), refreshAuth: 'unauthorized',
      })
      if (!active()) return
      const data = await res.json().catch(() => ({})) as { success?: boolean; url?: string; token?: string; message?: string }
      if (!active()) return
      if (!res.ok || !data.success || !data.url || !data.token) {
        throw new Error(res.status === 503 ? '语音服务尚未就绪，请稍后重试' : res.status === 404 ? '语音接口不可用，请检查服务端版本及 /rtc 代理配置' : res.status === 401 ? '请重新登录 ZViewer 后加入语音' : data.message || '获取语音凭证失败')
      }
      const stream = await permissions.requestMicrophoneStream({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      if (!active()) { stream.getTracks().forEach(t => t.stop()); return }
      localStream.current = stream
      const ctx = new AudioContext()
      captureCtx.current = ctx
      const gain = ctx.createGain()
      gain.gain.value = micVolumeRef.current
      micGain.current = gain
      ctx.createMediaStreamSource(stream).connect(gain)
      const dest = ctx.createMediaStreamDestination()
      gain.connect(dest)
      const monitor = ctx.createGain()
      monitor.gain.value = 0
      gain.connect(monitor)
      monitor.connect(ctx.destination)
      monitorGain.current = monitor
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      gain.connect(analyser)
      localAnalyser.current = analyser
      const track = dest.stream.getAudioTracks()[0]
      micTrack.current = track
      track.enabled = micIntent.current
      await ctx.resume()
      if (!active()) return
      const room = new Room()
      roomRef.current = room
      room.on(RoomEvent.TrackSubscribed, (t, _pub, p) => { if (active()) attachRemote(p, t) })
        .on(RoomEvent.TrackUnsubscribed, (t, _pub, p) => { if (active() && remote.current.get(p.identity)?.track === t) cleanupRemote(p.identity) })
        .on(RoomEvent.ParticipantConnected, () => refreshMembers(room))
        .on(RoomEvent.ParticipantDisconnected, p => { if (active()) { cleanupRemote(p.identity); refreshMembers(room) } })
        .on(RoomEvent.ParticipantMetadataChanged, () => refreshMembers(room))
        .on(RoomEvent.ConnectionStateChanged, state => { if (active()) { setMediaConnected(state === ConnectionState.Connected); if (state !== ConnectionState.Connected) setTransport(null) } })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => { if (active()) setAudioBlocked(!room.canPlaybackAudio) })
        .on(RoomEvent.Disconnected, reason => {
          if (!active()) return
          leave()
          message.warning(reason === DisconnectReason.DUPLICATE_IDENTITY ? '同一账号已在另一设备加入语音，本机已断开' : reason === DisconnectReason.PARTICIPANT_REMOVED ? '您已被移出语音聊天' : '语音连接已断开，可重新加入')
        })
      await room.connect(connectionUrl(data.url), data.token)
      if (!active()) { room.removeAllListeners(); void room.disconnect().catch(() => {}); return }
      refreshMembers(room)
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone, audioPreset: AudioPresets.music, dtx: false, red: true })
      if (!active()) { room.removeAllListeners(); void room.disconnect().catch(() => {}); return }
      setSelfId(room.localParticipant.identity)
      refreshMembers(room)
      setJoined(true)
      setMediaConnected(room.state === ConnectionState.Connected)
    } catch (err) {
      if (!active()) return
      leave()
      message.error(err instanceof DOMException && err.name === 'NotAllowedError' ? '麦克风权限被拒绝，请授权后重试' : err instanceof Error ? err.message : '加入语音失败')
    } finally {
      if (generation.current === epoch) {
        if (getApiUrl() !== server) leave()
        else { busy.current = false; abortRef.current = null; setJoining(false) }
      }
    }
  }, [roomId, username, leave, attachRemote, cleanupRemote, refreshMembers])

  const toggleMic = useCallback(() => {
    const room = roomRef.current
    if (!room || !micTrack.current) return
    if (adminMuted(room.localParticipant.metadata)) { message.warning('您已被管理员语音禁言'); return }
    micIntent.current = !micIntent.current
    micTrack.current.enabled = micIntent.current
    setMicEnabled(micIntent.current)
  }, [])
  const toggleMonitor = useCallback(() => {
    monitorIntent.current = !monitorIntent.current
    setMonitorEnabled(monitorIntent.current)
  }, [])
  const setGlobalVolume = useCallback((v: number) => {
    volumeRef.current = Math.max(0, Math.min(1, v))
    setGlobalVolumeState(volumeRef.current)
    for (const id of remote.current.keys()) applyVolume(id)
  }, [applyVolume])
  const setPeerVolume = useCallback((id: string, v: number) => {
    peerVolumeRef.current.set(id, Math.max(0, Math.min(1, v)))
    setPeerVolumes(new Map(peerVolumeRef.current))
    applyVolume(id)
  }, [applyVolume])
  const setMicVolume = useCallback((v: number) => {
    micVolumeRef.current = Math.max(0, Math.min(1, v))
    setMicVolumeState(micVolumeRef.current)
    if (micGain.current) micGain.current.gain.value = micVolumeRef.current
    if (monitorAudio.current) monitorAudio.current.volume = micVolumeRef.current
  }, [])

  const resumeAudio = useCallback(async () => {
    const room = roomRef.current
    const epoch = generation.current
    if (!room) return
    try {
      await room.startAudio()
      await captureCtx.current?.resume()
      await levelsCtx.current?.resume()
      await Promise.all([...remote.current.values()].map(e => e.audio.play()))
      if (monitorIntent.current && monitorAudio.current) await monitorAudio.current.play()
      if (generation.current === epoch) setAudioBlocked(false)
    } catch { if (generation.current === epoch) setAudioBlocked(true) }
  }, [])

  const manage = useCallback(async (action: 'mute' | 'kick', identity: string, muted?: boolean) => {
    try {
      const res = await apiFetch(`/api/voice/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId, identity, ...(muted === undefined ? {} : { muted }) }), refreshAuth: 'unauthorized' })
      const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
      return { success: res.ok && data.success === true, message: data.message || (res.status === 403 ? '没有语音管理权限' : res.status === 404 ? '该成员已离开语音' : undefined) }
    } catch { return { success: false, message: '网络错误，请重试' } }
  }, [roomId])
  const muteVoiceMember = useCallback((id: string, muted: boolean) => manage('mute', id, muted), [manage])
  const kickVoiceMember = useCallback((id: string) => manage('kick', id), [manage])

  useEffect(() => {
    if (/firefox/i.test(navigator.userAgent)) {
      if (monitorGain.current) monitorGain.current.gain.value = joined && monitorEnabled ? 1 : 0
      return
    }
    if (!joined || !monitorEnabled) { monitorAudio.current?.pause(); return }
    if (!localStream.current) return
    if (!monitorAudio.current) {
      monitorAudio.current = document.createElement('audio')
      monitorAudio.current.dataset.voiceMonitor = 'self'
      monitorAudio.current.style.display = 'none'
      document.body.appendChild(monitorAudio.current)
    }
    const audio = monitorAudio.current
    audio.srcObject = localStream.current
    audio.volume = micVolume
    const epoch = generation.current
    void audio.play().catch(() => { if (generation.current === epoch) setAudioBlocked(true) })
  }, [joined, monitorEnabled, micVolume])

  useEffect(() => {
    if (!joined) return
    const read = (a: AnalyserNode | null) => {
      if (!a) return 0
      const data = new Uint8Array(a.frequencyBinCount)
      a.getByteTimeDomainData(data)
      return Math.min(1, Math.sqrt(data.reduce((s, n) => s + ((n - 128) / 128) ** 2, 0) / data.length) * 4)
    }
    const timer = setInterval(() => {
      const next = new Map<string, number>([['self', read(localAnalyser.current)]])
      for (const [id, entry] of remote.current) next.set(id, read(entry.analyser))
      setAudioLevels(next)
    }, 200)
    return () => clearInterval(timer)
  }, [joined])

  useEffect(() => {
    window.addEventListener(ROOM_MEDIA_TEARDOWN_EVENT, leave)
    const onForeground = () => { if (!document.hidden) void resumeAudio() }
    document.addEventListener('visibilitychange', onForeground)
    return () => {
      window.removeEventListener(ROOM_MEDIA_TEARDOWN_EVENT, leave)
      document.removeEventListener('visibilitychange', onForeground)
      leave()
    }
  }, [roomId, leave, resumeAudio])

  useEffect(() => {
    if (!joined || !mediaConnected) return
    let cancelled = false
    const poll = async () => {
      const room = roomRef.current
      let detected: VoiceTransport | null = null
      for (const pc of voicePeerConnections(room)) { detected = await detectVoiceTransport(pc); if (detected) break }
      if (!cancelled && room === roomRef.current) setTransport(detected)
    }
    void poll()
    const timer = setInterval(() => { void poll() }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [joined, mediaConnected])
  return { transport, joined, joining, mediaConnected, micEnabled, selfId, members, globalVolume, peerVolumes, micVolume, monitorEnabled, audioLevels, voiceMutedIds, audioBlocked, resumeAudio, join, leave, toggleMic, toggleMonitor, setGlobalVolume, setPeerVolume, setMicVolume, muteVoiceMember, kickVoiceMember }
}
