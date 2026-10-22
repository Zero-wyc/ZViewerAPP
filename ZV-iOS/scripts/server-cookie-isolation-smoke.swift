import Foundation

@main enum ServerCookieIsolationSmoke {
  static func main() throws {
    let storage = HTTPCookieStorage.shared
    let suffix = UUID().uuidString.lowercased() + ".fixture.invalid"
    let host = "nas." + suffix
    let peer = "peer." + suffix
    func cookie(_ name: String, _ domain: String, _ path: String) -> HTTPCookie {
      HTTPCookie(properties: [.name: name, .value: "synthetic-fixture", .domain: domain, .path: path, .secure: "TRUE"])!
    }
    let access = cookie("access_token", host, "/prefix")
    let refresh = cookie("refresh_token", host, "/prefix")
    let bili = cookie("SESSDATA", host, "/prefix")
    let music = cookie("MUSIC_U", host, "/prefix")
    let otherServer = cookie("access_token", peer, "/prefix")
    let otherPath = cookie("access_token", host, "/unrelated")
    let childPath = cookie("access_token", host, "/prefix/private")
    let fixtures = [access, refresh, bili, music, otherServer, otherPath, childPath]
    for value in fixtures { storage.setCookie(value) }
    defer { for value in fixtures { storage.deleteCookie(value) } }
    func contains(_ value: HTTPCookie) -> Bool {
      (storage.cookies ?? []).contains { $0.name == value.name && $0.domain == value.domain && $0.path == value.path }
    }
    precondition(fixtures.allSatisfy(contains), "Fixture cookies must be stored before the check")
    let isolated = try ZVServerCookies.isolate("https://" + host + "/prefix", storage: storage)
    precondition(isolated)
    precondition(!contains(access) && !contains(refresh), "Selected NAS auth cookies must be removed")
    precondition([bili, music, otherServer, otherPath, childPath].allSatisfy(contains), "Unrelated cookies must remain")
    for invalid in ["file:///prefix", "wss://" + host, "https://user:pass@" + host, "https://" + host + "?token=fixture"] {
      do {
        _ = try ZVServerCookies.isolate(invalid, storage: storage)
        preconditionFailure("Invalid server input must be rejected")
      } catch {}
    }
    print("Server cookie isolation smoke passed: selected NAS auth only; other keys, domains and paths preserved")
  }
}
