import { resolveLive2DAssetUrl } from './resource-url'

export function live2dAssetUrl(path: string): string {
  const baseUrl = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return resolveLive2DAssetUrl(path, baseUrl, import.meta.url, window.location.href)
}
