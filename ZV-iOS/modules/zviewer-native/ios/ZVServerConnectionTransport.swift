import Foundation

// The Go connection gateway owns the only TLS exception. Native URLSession,
// SocketRocket, VLC, CDN and voice transports keep their normal trust policy.
// This registry only translates the current logical NAS origin to its private
// loopback capability, and never persists that capability or credentials.
final class ZVServerConnectionTransport {
  static let shared = ZVServerConnectionTransport()
  static let queue = DispatchQueue(label: "zviewer.server-connection")
  private let lock = NSLock()
  private struct State {
    let server: URL
    let owner: String
    let local: URL?
    let prefix: String
  }
  private var state: State?

  private static func origin(_ url: URL) -> String? {
    guard let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased(),
      ["http", "https", "ws", "wss"].contains(scheme), url.user == nil, url.password == nil else { return nil }
    let protocolName = scheme == "wss" ? "https" : scheme == "ws" ? "http" : scheme
    return "\(protocolName)://\(host):\(url.port ?? (protocolName == "https" ? 443 : 80))"
  }

  func install(server raw: String, transport value: String, allow: Bool, owner: String) throws {
    guard let server = URL(string: raw), let scheme = server.scheme?.lowercased(),
      ["http", "https"].contains(scheme), Self.origin(server) != nil,
      server.query == nil, server.fragment == nil,
      let local = URL(string: value), local.query == nil, local.fragment == nil else { throw Self.invalid() }
    let next: State
    if !allow && local == server {
      guard local == server else { throw Self.invalid() }
      next = State(server: server, owner: owner, local: nil, prefix: "")
    } else {
      guard (scheme == "http" || allow), local.scheme == "http", local.host == "127.0.0.1",
        local.user == nil, local.password == nil, let port = local.port, (1...65535).contains(port),
        let remoteParts = URLComponents(url: server, resolvingAgainstBaseURL: false),
        let localParts = URLComponents(url: local, resolvingAgainstBaseURL: false) else { throw Self.invalid() }
      let path = remoteParts.percentEncodedPath.replacingOccurrences(of: #"/+$"#, with: "", options: .regularExpression)
      let localPath = localParts.percentEncodedPath
      guard path.isEmpty || localPath.hasSuffix(path) else { throw Self.invalid() }
      let prefix = String(localPath.dropLast(path.count))
      guard prefix.range(of: #"^/[a-f0-9]{48}$"#, options: .regularExpression) != nil else { throw Self.invalid() }
      next = State(server: server, owner: owner, local: local, prefix: prefix)
    }
    lock.lock(); state = next; lock.unlock()
  }

  // Called on the shared configuration queue. A late Expo module teardown
  // cannot revoke a replacement module's newly configured channel.
  @discardableResult func remove(owner: String? = nil) -> String? {
    lock.lock(); defer { lock.unlock() }
    guard let current = state, owner == nil || current.owner == owner else { return nil }
    state = nil
    return current.server.absoluteString
  }

  func forward(_ url: URL) -> URL {
    lock.lock(); let current = state; lock.unlock()
    guard let current, let local = current.local, Self.origin(url) == Self.origin(current.server),
      var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
    parts.scheme = ["ws", "wss"].contains(url.scheme?.lowercased() ?? "") ? "ws" : "http"
    parts.host = local.host; parts.port = local.port
    parts.percentEncodedPath = current.prefix + parts.percentEncodedPath
    return parts.url ?? url
  }

  func logical(_ url: URL) -> URL {
    lock.lock(); let current = state; lock.unlock()
    guard let current, let local = current.local, Self.origin(url) == Self.origin(local),
      var parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
      parts.percentEncodedPath == current.prefix || parts.percentEncodedPath.hasPrefix(current.prefix + "/") else { return url }
    parts.scheme = url.scheme?.lowercased() == "ws" ? (current.server.scheme == "https" ? "wss" : "ws") : current.server.scheme
    parts.host = current.server.host; parts.port = current.server.port
    parts.percentEncodedPath = String(parts.percentEncodedPath.dropFirst(current.prefix.count))
    return parts.url ?? url
  }

  private static func invalid() -> NSError {
    NSError(domain: "ZViewerServerConnection", code: 1, userInfo: [NSLocalizedDescriptionKey: "服务器连接通道配置无效"])
  }
}
