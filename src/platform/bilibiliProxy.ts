import { registerPlugin } from '@capacitor/core'
import { useSyncExternalStore } from 'react'
import type { BilibiliProxyStatus, BilibiliQrSession } from './contracts'
import { getRuntimePlatform } from './runtime'

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
export function isEmbeddedAndroid() { return getRuntimePlatform() === 'android' }
export function subscribeEmbeddedProxy(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function useEmbeddedProxyStatus() {
  return useSyncExternalStore(subscribeEmbeddedProxy, getEmbeddedProxyStatus, getEmbeddedProxyStatus)
}
export async function startEmbeddedProxy() {
  if (!isEmbeddedAndroid()) return
  if (!starting) starting = native.start().then(publish).catch(error => {
    publish({ ...snapshot, supported: true, error: error instanceof Error ? error.message : String(error) })
    starting = null
  })
  await starting
}
export const embeddedBilibiliProxy = {
  createQr: () => native.createQr(),
  cancelQr: () => native.cancelQr(),
  saveQr: () => native.saveQr(),
  async pollQr(key: string) {
    const result = await native.pollQr({ key })
    if (result.proxyStatus) publish(result.proxyStatus)
    return result
  },
  async logout() { publish(await native.logout()) },
  async refresh() { if (isEmbeddedAndroid()) publish(await native.status()) },
}
