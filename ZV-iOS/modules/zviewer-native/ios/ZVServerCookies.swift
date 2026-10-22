import Foundation

enum ZVServerCookies {
  // RN's iOS WebSocket loads shared cookies even when socket.io disables
  // withCredentials. Remove only stale NAS auth cookies that these endpoints
  // would send; Bili/NCM cookies and unrelated servers remain untouched.
  static func isolate(_ server: String, storage: HTTPCookieStorage = .shared) throws -> Bool {
    guard let base = URL(string: server),
      ["http", "https"].contains(base.scheme?.lowercased() ?? ""),
      base.host != nil, base.user == nil, base.password == nil,
      base.query == nil, base.fragment == nil else {
      throw NSError(domain: "ZViewerSession", code: 1, userInfo: [NSLocalizedDescriptionKey: "无效的服务端地址"])
    }
    for endpoint in [base.appendingPathComponent("api/auth/me"), base.appendingPathComponent("socket.io/")] {
      for cookie in storage.cookies(for: endpoint) ?? [] where cookie.name == "access_token" || cookie.name == "refresh_token" {
        storage.deleteCookie(cookie)
      }
    }
    return true
  }
}
