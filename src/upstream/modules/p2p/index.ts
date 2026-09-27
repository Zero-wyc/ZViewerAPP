/**
 * P2P 直连模块统一导出
 *
 * 架构分层：
 * - constants: ICE 服务器、超时、信令标记
 * - types: 类型定义
 * - signaling-client: 信令客户端（收发 offer/answer/ICE）
 * - tunnel: P2P 隧道（管理 PC 生命周期与 ICE 协商）
 * - useP2PTunnel: React 适配 hook
 */
export { ICE_SERVERS, ICE_TIMEOUT_MS, P2P_SIGNAL_MARK } from './constants'
export type {
  P2PStatus,
  P2PRole,
  SignalEnvelope,
  P2PSignalPayload,
  P2PStatusChangeHandler,
  SignalingClientConfig,
  P2PTunnelConfig,
  P2PTunnelInstance,
} from './types'
export { SignalingClient } from './signaling-client'
export { P2PTunnel } from './tunnel'
export { useP2PTunnel, default } from './useP2PTunnel'
export type { UseP2PTunnelParams, UseP2PTunnelResult } from './useP2PTunnel'
