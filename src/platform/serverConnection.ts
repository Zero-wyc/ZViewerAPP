import { registerPlugin } from '@capacitor/core'
import { getHarmonyBridge, getRuntimePlatform } from './runtime'
import { bindConnectionTransport, clearConnectionTransport, connectionUrl } from './connectionTransport'
import { normalizeServerUrl, serverCandidates, type ServerAddressMode } from '../mobile/serverUrl'

export interface ServerProbe { ok: boolean; code: string; status?: number }
export interface ServerConnectionPolicy { url: string; allowUntrustedCertificate: boolean }
interface NativeConnection {
  configure(options: ServerConnectionPolicy): Promise<{ url: string }>
  probe(options: { url: string }): Promise<ServerProbe>
}
const native = registerPlugin<NativeConnection>('ServerConnection')
const POLICY_KEY = 'zviewer-server-connection-policies'
export function readServerPolicy(raw: string): boolean {
  try { return JSON.parse(localStorage.getItem(POLICY_KEY) || '{}')[new URL(normalizeServerUrl(raw)).origin] === true } catch { return false }
}
export function saveServerPolicy(raw: string, allow: boolean) {
  let map: Record<string, boolean> = {}
  try { map = JSON.parse(localStorage.getItem(POLICY_KEY) || '{}') || {} } catch { /* recover old storage */ }
  const origin = new URL(raw).origin
  if (allow) map[origin] = true; else delete map[origin]
  localStorage.setItem(POLICY_KEY, JSON.stringify(map))
}
let generation = 0
export async function applyServerPolicy(url: string, allow: boolean) {
  const current = ++generation
  clearConnectionTransport()
  const platform = getRuntimePlatform()
  const options: ServerConnectionPolicy = { url, allowUntrustedCertificate: allow }
  const result = platform === 'android' ? await native.configure(options)
    : platform === 'harmony' ? await getHarmonyBridge()!.configureServerConnection!(options)
    : allow ? (() => { throw new Error('此环境不支持证书例外，请在安卓或鸿蒙客户端连接') })() : { url }
  if (current !== generation) throw new DOMException('服务器选择已取消', 'AbortError')
  bindConnectionTransport(url, result.url)
}
async function probe(url: string, signal: AbortSignal): Promise<ServerProbe> {
  // Credential-free browser request also verifies the actual packaged web network path.
  try {
    const response = await fetch(connectionUrl(url + '/api/auth/public-settings'), {
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
    })
    const data = await response.json().catch(() => null) as { success?: boolean; settings?: { roomCreationMode?: string; registrationMode?: string } } | null
    return { ok: response.ok && data?.success === true && !!data.settings &&
      (typeof data.settings.roomCreationMode === 'string' || typeof data.settings.registrationMode === 'string'), code: 'response', status: response.status }
  } catch (error) {
    signal.throwIfAborted()
    const platform = getRuntimePlatform()
    if (platform === 'android') return native.probe({ url })
    if (platform === 'harmony') return getHarmonyBridge()!.probeServerConnection!({ url })
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? '连接超时' : '无法连接；请检查 TLS 证书、网络或跨域设置')
  }
}
export async function selectServer(raw: string, mode: ServerAddressMode, allow: boolean, signal: AbortSignal): Promise<string> {
  const candidates = serverCandidates(raw, mode)
  for (const url of candidates) {
    signal.throwIfAborted()
    await applyServerPolicy(url, allow && url.startsWith('https:'))
    signal.throwIfAborted()
    const result = await probe(url, signal)
    signal.throwIfAborted()
    if (result.ok) return url
    if (result.code.startsWith('certificate')) throw new Error('HTTPS 证书验证失败；可为此服务器启用不受信任证书连接')
    if (!['tls_unavailable', 'port_unavailable'].includes(result.code)) {
      throw new Error(result.code === 'response' ? `服务器响应不是可用的 ZViewer 接口 (${result.status})` : '无法确定 HTTPS 是否可用，请检查网络或使用自定义完整地址')
    }
  }
  throw new Error('服务器端口不可用或没有提供对应协议')
}
export async function revokeServerConnection(url: string) {
  ++generation; clearConnectionTransport()
  await applyServerPolicy(url, false)
}
export { connectionUrl }
