import { registerPlugin } from '@capacitor/core'
import { useSyncExternalStore } from 'react'
import type { BilibiliHostMedia, BilibiliProxyStatus, BilibiliQrSession } from './contracts'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'
import { buildCliProxyUrl } from './bilibiliMediaUrl'
import QRCode from 'qrcode'

interface NativeProxy {
  registerHostMedia(media: BilibiliHostMedia): Promise<void>
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
/** Only the authenticated resolver can issue host media to the local player. */
export async function registerHostMedia(media: BilibiliHostMedia) {
  if (getRuntimePlatform() === 'harmony') {
    const register = getHarmonyBridge()?.bilibiliRegisterHostMedia
    if (!register) throw new Error('本机代理不支持房主媒体登记')
    await register(media)
  } else {
    await native.registerHostMedia(media)
  }
}

/** Test the exact loopback route the player will read, including the signed query. */
export async function hostMediaReachable(urls: string[], signal?: AbortSignal) {
  const { proxyUrl } = getEmbeddedProxyStatus()
  const probe = new AbortController()
  const timeout = setTimeout(() => probe.abort(), 5000)
  const requestSignal = signal ? AbortSignal.any([signal, probe.signal]) : probe.signal
  try {
    await Promise.all(urls.map(async url => {
      const res = await fetch(buildCliProxyUrl(proxyUrl, url), {
        headers: { Range: 'bytes=0-63' }, signal: requestSignal, cache: 'no-store',
      })
      if (res.status !== 206 || (await res.arrayBuffer()).byteLength !== 64) {
        throw new Error('媒体线路未返回请求的数据')
      }
    }))
    return true
  } catch {
    signal?.throwIfAborted()
    return false
  } finally {
    clearTimeout(timeout)
    probe.abort()
  }
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
