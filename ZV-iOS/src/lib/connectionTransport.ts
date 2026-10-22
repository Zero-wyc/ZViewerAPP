// The native channel can only forward to one immutable NAS origin. Logical
// addresses remain in session storage, source metadata and room messages.
type Binding = { origin: string; localOrigin: string; prefix: string };
let binding: Binding | null = null;

export function bindConnectionTransport(server: string, transport: string) {
  const remote = new URL(server), local = new URL(transport);
  if (remote.origin === local.origin && remote.pathname === local.pathname) { binding = null; return; }
  const base = remote.pathname.replace(/\/$/, '');
  const prefix = local.pathname.slice(0, local.pathname.length - base.length);
  if (!['https:', 'http:'].includes(remote.protocol) || local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || !local.port ||
    local.username || local.password || local.search || local.hash || !/^\/[a-f0-9]{48}$/.test(prefix) || local.pathname !== prefix + base) {
    binding = null;
    throw new Error('服务器证书例外通道无效');
  }
  binding = { origin: remote.origin, localOrigin: local.origin, prefix };
}

export function clearConnectionTransport() { binding = null; }

export function connectionUrl(raw: string): string {
  if (!binding) return raw;
  try {
    const url = new URL(raw); const websocket = url.protocol === 'wss:' || url.protocol === 'ws:';
    if (websocket) url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    if (url.origin !== binding.origin || url.username || url.password) return raw;
    return `${websocket ? binding.localOrigin.replace(/^http/, 'ws') : binding.localOrigin}${binding.prefix}${url.pathname}${url.search}${url.hash}`;
  } catch { return raw; }
}

/** Remove the private native channel before persisting or sharing a URL. */
export function logicalConnectionUrl(raw: string): string {
  if (!binding) return raw;
  try {
    const url = new URL(raw); const websocket = url.protocol === 'ws:';
    if (websocket) url.protocol = 'http:';
    if (url.origin !== binding.localOrigin || url.username || url.password ||
      (url.pathname !== binding.prefix && !url.pathname.startsWith(binding.prefix + '/'))) return raw;
    return `${websocket ? binding.origin.replace(/^http/, 'ws') : binding.origin}${url.pathname.slice(binding.prefix.length)}${url.search}${url.hash}`;
  } catch { return raw; }
}
