import { logicalConnectionUrl } from '../../../platform/connectionTransport'

/** 分享逻辑服务器地址；不向其他设备暴露本机会话的回环端口或能力路径。 */
export function buildRoomShareUrl(serverUrl: string, roomId: string): string {
  const url = new URL(logicalConnectionUrl(serverUrl))
  url.pathname = `${url.pathname.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}`
  url.search = ''
  url.hash = ''
  url.username = ''
  url.password = ''
  return url.href
}
