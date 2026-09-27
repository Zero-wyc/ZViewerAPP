/**
 * P2P 信令客户端
 *
 * 职责单一：仅负责通过 socket 收发 P2P 信令（offer/answer/ICE），
 * 不管理 RTCPeerConnection 生命周期。
 *
 * 通过 P2P_SIGNAL_MARK 标记区分 P2P 信令与服务器中转的 WebRTC 信令，
 * 复用同一组 socket 事件（signal-offer/answer/ice-candidate）。
 */
import type { Socket } from 'socket.io-client'
import { P2P_SIGNAL_MARK } from './constants'
import type { P2PSignalPayload, P2PRole, SignalEnvelope } from './types'

function isP2PSignal(data: unknown): data is P2PSignalPayload {
  return (
    typeof data === 'object' &&
    data !== null &&
    P2P_SIGNAL_MARK in data &&
    (data as Record<string, unknown>)[P2P_SIGNAL_MARK] === true
  )
}

export class SignalingClient {
  private socket: Socket
  private readonly role: P2PRole
  private readonly handlers: {
    onOffer: (from: string, sdp: RTCSessionDescriptionInit) => void
    onAnswer: (from: string, sdp: RTCSessionDescriptionInit) => void
    onIceCandidate: (from: string, candidate: RTCIceCandidateInit) => void
  }

  constructor(
    socket: Socket,
    role: P2PRole,
    handlers: {
      onOffer: (from: string, sdp: RTCSessionDescriptionInit) => void
      onAnswer: (from: string, sdp: RTCSessionDescriptionInit) => void
      onIceCandidate: (from: string, candidate: RTCIceCandidateInit) => void
    }
  ) {
    this.socket = socket
    this.role = role
    this.handlers = handlers
    this.bind()
  }

  /** 更新 socket 实例（重连后） */
  updateSocket(socket: Socket): void {
    if (this.socket === socket) return
    this.unbind()
    this.socket = socket
    this.bind()
  }

  /** 发送 offer 给对端 */
  sendOffer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.socket.emit('signal-offer', {
      to,
      data: { [P2P_SIGNAL_MARK]: true, sdp } as P2PSignalPayload,
    })
  }

  /** 发送 answer 给对端 */
  sendAnswer(to: string, sdp: RTCSessionDescriptionInit): void {
    this.socket.emit('signal-answer', {
      to,
      data: { [P2P_SIGNAL_MARK]: true, sdp } as P2PSignalPayload,
    })
  }

  /** 发送 ICE candidate 给对端 */
  sendIceCandidate(to: string, candidate: RTCIceCandidateInit): void {
    this.socket.emit('signal-ice-candidate', {
      to,
      data: {
        [P2P_SIGNAL_MARK]: true,
        candidate,
      } as P2PSignalPayload,
    })
  }

  /** 绑定 socket 事件监听 */
  private bind(): void {
    this.socket.on('signal-offer', this.handleOffer)
    this.socket.on('signal-answer', this.handleAnswer)
    this.socket.on('signal-ice-candidate', this.handleIceCandidate)
  }

  /** 解绑 socket 事件监听 */
  private unbind(): void {
    this.socket.off('signal-offer', this.handleOffer)
    this.socket.off('signal-answer', this.handleAnswer)
    this.socket.off('signal-ice-candidate', this.handleIceCandidate)
  }

  private handleOffer = (envelope: SignalEnvelope<unknown>): void => {
    if (!isP2PSignal(envelope.data) || !envelope.data.sdp) return
    // receiver 才接收 offer（sender 发起 offer）
    if (this.role !== 'receiver') return
    this.handlers.onOffer(envelope.from, envelope.data.sdp)
  }

  private handleAnswer = (envelope: SignalEnvelope<unknown>): void => {
    if (!isP2PSignal(envelope.data) || !envelope.data.sdp) return
    // sender 才接收 answer
    if (this.role !== 'sender') return
    this.handlers.onAnswer(envelope.from, envelope.data.sdp)
  }

  private handleIceCandidate = (envelope: SignalEnvelope<unknown>): void => {
    if (!isP2PSignal(envelope.data) || !envelope.data.candidate) return
    this.handlers.onIceCandidate(envelope.from, envelope.data.candidate)
  }

  /** 清理监听 */
  dispose(): void {
    this.unbind()
  }
}
