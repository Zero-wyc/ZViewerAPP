import { registerPlugin } from '@capacitor/core'
import { useSyncExternalStore } from 'react'
import type { BilibiliProxyStatus, BilibiliQrSession } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'
import QRCode from 'qrcode'

interface NativeProxy {
  start(): Promise<BilibiliProxyStatus>
  status(): Promise<BilibiliProxyStatus>
  createQr(): Promise<BilibiliQrSession>
  pollQr(options: { key: string }): Promise<{ status: number; message?: string; loggedIn?: boolean; proxyStatus?: BilibiliProxyStatus }>
  cancelQr(): Promise<void>
  logout(): Promise<BilibiliProxyStatus>
  saveQr(): Promise<void>
}
const native = registerPlugin<NativeProxy>('BilibiliProxy')
const listeners = new Set<() => void>()
let snapshot: BilibiliProxyStatus = { supported: false, ready: false, loggedIn: false, proxyUrl: '', sessionVersion: 0 }
let starting: Promise<void> | null = null

function publish(status: BilibiliProxyStatus) {
  if (JSON.stringify(status) === JSON.stringify(snapshot)) return
  snapshot = status
  for (const listener of listeners) listener()
}
export function getEmbeddedProxyStatus() { return snapshot }
export function isEmbeddedBilibiliHost() { return getRuntimePlatform() === 'android' || getRuntimePlatform() === 'harmony' }
function harmonyBridge() {
  const bridge = getHarmonyBridge()
  if (!bridge?.bilibiliStart || !bridge.bilibiliStatus || !bridge.bilibiliCreateQr || !bridge.bilibiliPollQr || !bridge.bilibiliCancelQr || !bridge.bilibiliLogout) {
    throw new Error('Harmony B 站能力不可用')
  }
  return bridge
}
export function subscribeEmbeddedProxy(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useEmbeddedProxyStatus() {
  return useSyncExternalStore(subscribeEmbeddedProxy, getEmbeddedProxyStatus, getEmbeddedProxyStatus)
}
export async function startEmbeddedProxy() {
  if (!isEmbeddedBilibiliHost()) return
  if (!starting) starting = (getRuntimePlatform() === 'harmony' ? harmonyBridge().bilibiliStart!() : native.start()).then(publish).catch(error => {
    publish({ ...snapshot, supported: true, error: error instanceof Error ? error.message : String(error) })
    starting = null
  })
  await starting
}
export const embeddedBilibiliProxy = {
  async createQr(): Promise<BilibiliQrSession> {
    if (getRuntimePlatform() !== 'harmony') return native.createQr()
    const qr = await harmonyBridge().bilibiliCreateQr!()
    return { qrcodeKey: qr.qrcodeKey, qrDataUrl: await QRCode.toDataURL(qr.qrUrl, { width: 256, margin: 2 }) }
  },
  cancelQr: () => getRuntimePlatform() === 'harmony' ? harmonyBridge().bilibiliCancelQr!() : native.cancelQr(),
  saveQr: () => getRuntimePlatform() === 'harmony' ? Promise.reject(new Error('请截图保存二维码')) : native.saveQr(),
  async pollQr(key: string) {
    const result = getRuntimePlatform() === 'harmony' ? await harmonyBridge().bilibiliPollQr!(key) : await native.pollQr({ key })
    if (result.proxyStatus) publish(result.proxyStatus)
    return result
  },
  async logout() { publish(getRuntimePlatform() === 'harmony' ? await harmonyBridge().bilibiliLogout!() : await native.logout()) },
  async refresh() { if (isEmbeddedBilibiliHost()) publish(getRuntimePlatform() === 'harmony' ? await harmonyBridge().bilibiliStatus!() : await native.status()) },
}
