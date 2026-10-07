// Only the selected server origin maps to the per-session native loopback channel.
let binding: { origin: string; localOrigin: string; prefix: string } | null = null
export function bindConnectionTransport(server: string, transport: string) {
  const remote = new URL(server), local = new URL(transport)
  binding = remote.origin === local.origin ? null : {
    origin: remote.origin, localOrigin: local.origin,
    prefix: local.pathname.slice(0, local.pathname.length - remote.pathname.replace(/\/$/, '').length).replace(/\/$/, ''),
  }
}
export function clearConnectionTransport() { binding = null }
/** Strip the private connection channel before persisting or broadcasting URLs. */
export function logicalConnectionUrl(raw: string): string {
  if (!binding) return raw
  try {
    const u = new URL(raw)
    const websocket = u.protocol === 'ws:'
    if (websocket) u.protocol = 'http:'
    if (u.origin !== binding.localOrigin || !u.pathname.startsWith(binding.prefix + '/')) return raw
    return `${websocket ? binding.origin.replace(/^http/, 'ws') : binding.origin}${u.pathname.slice(binding.prefix.length)}${u.search}${u.hash}`
  } catch { return raw }
}
export function connectionUrl(raw: string): string {
  if (!binding) return raw
  try {
    const u = new URL(raw)
    const websocket = u.protocol === 'wss:'
    if (websocket) u.protocol = 'https:'
    if (u.origin !== binding.origin) return raw
    return `${websocket ? binding.localOrigin.replace(/^http/, 'ws') : binding.localOrigin}${binding.prefix}${u.pathname}${u.search}${u.hash}`
  } catch { return raw }
}
