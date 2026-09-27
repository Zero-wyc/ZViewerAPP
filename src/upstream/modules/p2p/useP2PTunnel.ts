/**
 * useP2PTunnel - React 适配层
 *
 * 薄封装：将 P2PTunnel + SignalingClient 桥接到 React 状态。
 * 核心逻辑在 P2PTunnel/SignalingClient 类中，本 hook 仅负责：
 * - 生命周期管理（挂载创建、卸载清理）
 * - 将 tunnel 实例的状态同步到 React state
 * - 处理 localStream/remotePeerId 变化时更新 tunnel
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { SignalingClient } from './signaling-client'
import { P2PTunnel } from './tunnel'
import type { P2PRole, P2PStatus } from './types'

export interface UseP2PTunnelParams {
  socket: Socket | null
  roomId: string
  localStream?: MediaStream | null
  role: P2PRole
  remotePeerId?: string | null
  onStatusChange?: (status: P2PStatus, didFallback: boolean) => void
}

export interface UseP2PTunnelResult {
  enableP2P: () => Promise<void>
  disableP2P: () => void
  p2pEnabled: boolean
  p2pPC: RTCPeerConnection | null
  p2pStatus: P2PStatus
}

export function useP2PTunnel({
  socket,
  localStream,
  role,
  remotePeerId,
  onStatusChange,
}: UseP2PTunnelParams): UseP2PTunnelResult {
  const [p2pEnabled, setP2pEnabled] = useState(false)
  const [p2pStatus, setP2pStatus] = useState<P2PStatus>('idle')
  const [p2pPC, setP2pPC] = useState<RTCPeerConnection | null>(null)

  const tunnelRef = useRef<P2PTunnel | null>(null)
  const signalingRef = useRef<SignalingClient | null>(null)
  const onStatusChangeRef = useRef(onStatusChange)

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  // 创建/销毁 tunnel + signaling
  useEffect(() => {
    if (!socket) return

    // 状态同步函数
    const syncState = () => {
      const tunnel = tunnelRef.current
      if (!tunnel) {
        setP2pEnabled(false)
        setP2pStatus('idle')
        setP2pPC(null)
        return
      }
      setP2pEnabled(tunnel.isEnabled)
      setP2pStatus(tunnel.getStatus())
      setP2pPC(tunnel.getPeerConnection())
    }

    const handleStatusChange = (status: P2PStatus, didFallback: boolean) => {
      setP2pStatus(status)
      if (status === 'idle' || status === 'failed') {
        setP2pEnabled(false)
        setP2pPC(null)
      } else if (status === 'connecting') {
        setP2pPC(tunnelRef.current?.getPeerConnection() ?? null)
      } else if (status === 'connected') {
        // PC 不变
      }
      onStatusChangeRef.current?.(status, didFallback)
    }

    const tunnel = new P2PTunnel({
      role,
      localStream,
      remotePeerId,
      signaling: signalingRef.current!,
      onStatusChange: handleStatusChange,
    })
    tunnelRef.current = tunnel

    syncState()

    return () => {
      tunnel.dispose()
      tunnelRef.current = null
      signalingRef.current?.dispose()
      signalingRef.current = null
      setP2pEnabled(false)
      setP2pStatus('idle')
      setP2pPC(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, role])

  // signaling 需要在 tunnel 之前创建（tunnel 构造依赖 signaling）
  useEffect(() => {
    if (!socket) return

    const handleOffer = (from: string, sdp: RTCSessionDescriptionInit) => {
      tunnelRef.current?.handleOffer(from, sdp)
    }
    const handleAnswer = (from: string, sdp: RTCSessionDescriptionInit) => {
      tunnelRef.current?.handleAnswer(from, sdp)
    }
    const handleIceCandidate = (
      from: string,
      candidate: RTCIceCandidateInit
    ) => {
      tunnelRef.current?.handleIceCandidate(from, candidate)
    }

    const signaling = new SignalingClient(socket, role, {
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIceCandidate: handleIceCandidate,
    })
    signalingRef.current = signaling

    return () => {
      signaling.dispose()
      signalingRef.current = null
    }
  }, [socket, role])

  // localStream 变化时更新 tunnel
  useEffect(() => {
    tunnelRef.current?.updateLocalStream(localStream ?? null)
  }, [localStream])

  // remotePeerId 变化时更新 tunnel
  useEffect(() => {
    tunnelRef.current?.updateRemotePeerId(remotePeerId ?? null)
  }, [remotePeerId])

  const enableP2P = useCallback(async () => {
    if (!tunnelRef.current) {
      console.warn('[useP2PTunnel] tunnel not ready')
      return
    }
    await tunnelRef.current.enable()
    setP2pEnabled(tunnelRef.current.isEnabled)
    setP2pStatus(tunnelRef.current.getStatus())
    setP2pPC(tunnelRef.current.getPeerConnection())
  }, [])

  const disableP2P = useCallback(() => {
    tunnelRef.current?.disable()
    setP2pEnabled(false)
    setP2pStatus('idle')
    setP2pPC(null)
  }, [])

  return {
    enableP2P,
    disableP2P,
    p2pEnabled,
    p2pPC,
    p2pStatus,
  }
}

export default useP2PTunnel
