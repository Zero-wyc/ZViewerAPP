import { App } from '@capacitor/app'
import { registerPlugin } from '@capacitor/core'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'
import { trustedReleaseUrl } from '../mobile/appUpdates'
import packageInfo from '../../package.json'
const links = registerPlugin<{ open(options: { url: string }): Promise<void> }>('ExternalLinks')
export async function installedAppVersion() {
  const platform = getRuntimePlatform()
  if (platform === 'android') { const info = await App.getInfo(); return { version: info.version, build: info.build } }
  if (platform === 'harmony' && getHarmonyBridge()?.getAppInfo) return getHarmonyBridge()!.getAppInfo!()
  return { version: packageInfo.version, build: '' }
}
export async function openReleaseLink(url: string) {
  if (!trustedReleaseUrl(url) && !trustedReleaseUrl(url, true)) throw new Error('下载地址无效')
  const platform = getRuntimePlatform()
  if (platform === 'android') await links.open({ url })
  else if (platform === 'harmony') { const open = getHarmonyBridge()?.openExternalUrl; if (!open) throw new Error('无法打开浏览器，请重启应用后重试'); await open(url) }
  else window.open(url, '_blank', 'noopener,noreferrer')
}
