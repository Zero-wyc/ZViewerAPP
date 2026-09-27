/**
 * P2P 直连模块常量
 *
 * ICE 服务器配置：STUN 用于公网候选地址发现，TURN 用于对称型 NAT 环境下的中继回退。
 * 当前仅配置公共 STUN，对称 NAT 下会触发超时回退到服务器中转。
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/** ICE 协商超时（毫秒），超时后判定 P2P 失败并回退服务器中转 */
export const ICE_TIMEOUT_MS = 10000

/** P2P 信令标记，用于区分 P2P 隧道信令与服务器中转 WebRTC 信令 */
export const P2P_SIGNAL_MARK = '__p2pTunnel' as const
