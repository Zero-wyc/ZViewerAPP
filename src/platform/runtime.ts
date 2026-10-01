import { Capacitor } from '@capacitor/core'
import type { HarmonyNativeBridge, RuntimePlatform } from './contracts'

export function getHarmonyBridge(): HarmonyNativeBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return window.zviewerNative?.platform === 'harmony' ? window.zviewerNative : undefined
}

export function getRuntimePlatform(): RuntimePlatform {
  if (getHarmonyBridge()) return 'harmony'
  const platform = Capacitor.getPlatform()
  if (platform === 'android' || platform === 'ios') return platform
  return 'web'
}

export function isNativeRuntime(): boolean {
  return getRuntimePlatform() !== 'web'
}

/** Hosts that share the mobile appearance shell across the lobby and rooms. */
export function isGlobalAppearanceRuntime(): boolean {
  const platform = getRuntimePlatform()
  return platform === 'android' || platform === 'harmony'
}
