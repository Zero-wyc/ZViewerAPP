/**
 * P2P 隧道
 *
 * 职责单一：管理 RTCPeerConnection 生命周期与 ICE 协商。
 * 不直接接触 socket，通过 SignalingClient 收发信令。
 *
 * 设计要点：
 * - sender 发起 offer；receiver 响应 offer 并发 answer
 * - receiver 可能在 enable() 之前收到 offer，会缓存为 pendingOffer
 * - ICE 超时后自动回退（触发 onStatusChange(failed, true)）
 * - 状态变更通过回调通知外部，不直接 setState
 */
import { ICE_SERVERS, ICE_TIMEOUT_MS } from './constants'
import { SignalingClient } from './signaling-client'
import type {
  P2PRole,
  P2PStatus,
  P2PStatusChangeHandler,
  P2PTunnelConfig,
  P2PTunnelInstance,
} from './types'

export class P2PTunnel implements P2PTunnelInstance {
  private readonly role: P2PRole
  private readonly signaling: SignalingClient
  private readonly onStatusChange?: P2PStatusChangeHandler

  private localStream: MediaStream | null
  private remotePeerId: string | null

  private pc: RTCPeerConnection | null = null
  private enabled = false
  private status: P2PStatus = 'idle'

  private iceTimeoutHandle: ReturnType<typeof setTimeout> | null = null
  private pendingOffer: {
    from: string
    sdp: RTCSessionDescriptionInit
  } | null = null

  constructor(config: P2PTunnelConfig) {
    this.role = config.role
    this.localStream = config.localStream ?? null
    this.remotePeerId = config.remotePeerId ?? null
    this.signaling = config.signaling
    this.onStatusChange = config.onStatusChange
  }

  /** 更新本地流（sender 模式下用于注入 track） */
  updateLocalStream(stream: MediaStream | null): void {
    this.localStream = stream
  }

  /** 更新对端 socketId */
  updateRemotePeerId(id: string | null): void {
    this.remotePeerId = id
  }

  async enable(): Promise<void> {
    if (this.pc) return // 已启用

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.pc = pc
    this.enabled = true

    // sender 注入本地轨道
    if (this.role === 'sender' && this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!)
      })
    }

    // ICE candidate 回调
    pc.onicecandidate = (event) => {
      if (event.candidate && this.remotePeerId) {
        this.signaling.sendIceCandidate(
          this.remotePeerId,
          event.candidate.toJSON()
        )
      }
    }

    // ICE 连接状态变更
    pc.oniceconnectionstatechange = () => {
      this.handleIceStateChange()
    }

    this.updateStatus('connecting')

    // ICE 超时检测
    this.iceTimeoutHandle = setTimeout(() => {
      const current = this.pc
      if (!current) return
      const state = current.iceConnectionState
      if (state !== 'connected' && state !== 'completed') {
        console.warn('[P2PTunnel] ICE timeout, falling back to relay')
        this.failWithFallback()
      }
    }, ICE_TIMEOUT_MS)

    if (this.role === 'sender') {
      await this.initiateOffer()
    } else {
      // receiver：处理可能提前到达的 offer
      await this.applyPendingOffer()
    }
  }

  disable(): void {
    this.closePC()
    this.enabled = false
    this.updateStatus('idle')
  }

  dispose(): void {
    this.closePC()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  getPeerConnection(): RTCPeerConnection | null {
    return this.pc
  }

  getStatus(): P2PStatus {
    return this.status
  }

  // --- 信令回调（由 SignalingClient 调用） ---

  /** receiver 收到 sender 的 offer */
  handleOffer(from: string, sdp: RTCSessionDescriptionInit): void {
    // 记录对端 id
    this.remotePeerId = from

    const pc = this.pc
    if (!pc) {
      // PC 尚未创建：缓存 offer，等 enable() 后处理
      this.pendingOffer = { from, sdp }
      return
    }

    if (pc.signalingState !== 'stable') return

    void this.processOffer(pc, from, sdp)
  }

  /** sender 收到 receiver 的 answer */
  handleAnswer(_from: string, sdp: RTCSessionDescriptionInit): void {
    const pc = this.pc
    if (!pc) return
    void pc
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .catch((err) => {
        console.error('[P2PTunnel] setRemoteDescription(answer) error:', err)
        this.failWithFallback()
      })
  }

  /** 双向收到 ICE candidate */
  handleIceCandidate(_from: string, candidate: RTCIceCandidateInit): void {
    const pc = this.pc
    if (!pc) return
    void pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
      console.warn('[P2PTunnel] addIceCandidate error:', err)
    })
  }

  // --- 内部方法 ---

  private async initiateOffer(): Promise<void> {
    const pc = this.pc
    if (!pc) return
    if (!this.remotePeerId) {
      console.warn('[P2PTunnel] remotePeerId not set, cannot offer')
      this.failWithFallback()
      return
    }
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.signaling.sendOffer(this.remotePeerId, offer)
    } catch (err) {
      console.error('[P2PTunnel] createOffer error:', err)
      this.failWithFallback()
    }
  }

  private async applyPendingOffer(): Promise<void> {
    const pending = this.pendingOffer
    if (!pending) return
    this.pendingOffer = null
    const pc = this.pc
    if (!pc) return
    if (pc.signalingState === 'stable') {
      await this.processOffer(pc, pending.from, pending.sdp)
    }
  }

  private async processOffer(
    pc: RTCPeerConnection,
    from: string,
    sdp: RTCSessionDescriptionInit
  ): Promise<void> {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.signaling.sendAnswer(from, answer)
    } catch (err) {
      console.error('[P2PTunnel] processOffer error:', err)
      this.failWithFallback()
    }
  }

  private handleIceStateChange(): void {
    const pc = this.pc
    if (!pc) return
    const state = pc.iceConnectionState
    if (state === 'connected' || state === 'completed') {
      this.clearIceTimeout()
      this.updateStatus('connected')
    } else if (
      state === 'failed' ||
      state === 'disconnected' ||
      state === 'closed'
    ) {
      this.failWithFallback()
    }
  }

  private failWithFallback(): void {
    this.updateStatus('failed', true)
    this.closePC()
    this.enabled = false
  }

  private updateStatus(next: P2PStatus, didFallback = false): void {
    this.status = next
    this.onStatusChange?.(next, didFallback)
  }

  private clearIceTimeout(): void {
    if (this.iceTimeoutHandle) {
      clearTimeout(this.iceTimeoutHandle)
      this.iceTimeoutHandle = null
    }
  }

  private closePC(): void {
    this.clearIceTimeout()
    const pc = this.pc
    if (pc) {
      pc.onicecandidate = null
      pc.ontrack = null
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      try {
        pc.close()
      } catch {
        // ignore
      }
      this.pc = null
    }
    this.pendingOffer = null
  }
}
