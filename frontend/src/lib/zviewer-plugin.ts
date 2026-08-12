/**
 * ZViewer 原生插件前端桥接层。
 *
 * 通过 Capacitor bridge 调用 Java 原生插件（ZViewerPlugin.java），
 * 实现 B站 独立登录、Cookie 持久化、视频解析、MPD 生成、本地代理。
 */

import { registerPlugin } from '@capacitor/core'

export interface ZViewerPluginDefinitions {
  // QR 登录
  initQr(): Promise<{ qrcodeKey: string; qrUrl: string }>
  pollQr(options: { qrcodeKey: string }): Promise<{
    status: number
    message: string
    cookie: string
    cookieValid: boolean
  }>

  // Cookie 管理
  getSavedCookie(): Promise<{ cookie: string; userName: string; userMid: number }>
  clearCookie(): Promise<void>
  validateCookie(options: { cookie?: string }): Promise<{
    valid: boolean
    userName?: string
    userMid?: number
    message?: string
  }>

  // 视频解析（含 MPD 生成）
  resolveVideo(options: { bvid: string; cookie?: string }): Promise<{
    bvid: string
    avid: number
    cid: number
    title: string
    duration: number
    hasDash: boolean
    videoStream?: { baseUrl: string; baseUrlBackup?: string }
    audioStream?: { baseUrl: string }
    mpd?: string
    dashData?: string
    durl?: string
    qualities: Array<{ id: number; label: string }>
    currentQn: number
  }>

  // 本地代理
  startProxy(): Promise<{ port: number; baseUrl: string }>
  stopProxy(): Promise<void>

  // 全屏沉浸模式
  enterFullscreen(): Promise<void>
  exitFullscreen(): Promise<void>
}

const ZViewerPlugin = registerPlugin<ZViewerPluginDefinitions>('ZViewer')

export const initQr = () => ZViewerPlugin.initQr()
export const pollQr = (qrcodeKey: string) => ZViewerPlugin.pollQr({ qrcodeKey })
export const getSavedCookie = () => ZViewerPlugin.getSavedCookie()
export const clearCookie = () => ZViewerPlugin.clearCookie()
export const validateCookie = (cookie?: string) => ZViewerPlugin.validateCookie({ cookie })
export const resolveVideo = (bvid: string, cookie?: string) =>
  ZViewerPlugin.resolveVideo({ bvid, cookie })
export const startProxy = () => ZViewerPlugin.startProxy()
export const stopProxy = () => ZViewerPlugin.stopProxy()
export const enterFullscreen = () => ZViewerPlugin.enterFullscreen()
export const exitFullscreen = () => ZViewerPlugin.exitFullscreen()

export default ZViewerPlugin