import type { ZViewerPluginInterface } from './index'

/**
 * Web 端回退实现：在浏览器中运行时，插件方法不可用，返回空实现。
 * Android 原生环境使用 ZViewerPlugin.java 提供的实现。
 */
export class ZViewerWeb implements ZViewerPluginInterface {
  async echo(options: { value: string }): Promise<{ value: string }> {
    return { value: options.value }
  }

  async validateCookie(): Promise<{
    valid: boolean
    httpCode: number
    name?: string
    mid?: number
    vipStatus?: number
  }> {
    return { valid: false, httpCode: 0 }
  }

  async generateMPD(): Promise<{ mpd: string }> {
    return { mpd: '' }
  }
}