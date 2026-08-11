import { registerPlugin } from '@capacitor/core'

export interface ZViewerPluginInterface {
  echo(options: { value: string }): Promise<{ value: string }>
  validateCookie(options: { cookie: string }): Promise<{
    valid: boolean
    httpCode: number
    name?: string
    mid?: number
    vipStatus?: number
  }>
  generateMPD(options: {
    videoUrl: string
    audioUrl?: string
    videoCodec?: string
    audioCodec?: string
    duration: number
  }): Promise<{ mpd: string }>
}

const ZViewer = registerPlugin<ZViewerPluginInterface>('ZViewer', {
  web: () => import('./web').then((m) => new m.ZViewerWeb()),
})

export default ZViewer