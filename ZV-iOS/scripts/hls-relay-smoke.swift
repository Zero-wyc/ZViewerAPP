import Foundation

@main
struct HLSRelaySmoke {
  static func main() throws {
    let server = CommandLine.arguments[1]
    if CommandLine.arguments.count > 2 {
      try ZVServerConnectionTransport.shared.install(server: server, transport: CommandLine.arguments[2], allow: true, owner: "smoke")
    }
    let manager = ZVHLSRelayManager()
    let lock = NSLock(); var errors: [String] = []
    manager.failure = { _, message in lock.lock(); errors.append(message); lock.unlock() }
    func start(_ resource: String) throws -> [String: String] {
      let ready = DispatchSemaphore(value: 0); var result: Result<[String: String], Error>?
      let uri = ZVServerConnectionTransport.shared.forward(URL(string: server + "/api/emby/stream?movieId=7&resource=" + resource + "&token=old")!).absoluteString
      manager.start(uri: uri, server: server, token: "current") { value in result = value; ready.signal() }
      guard ready.wait(timeout: .now() + 5) == .success, let result else { throw failure("relay start timed out") }
      return try result.get()
    }
    func fetch(_ uri: String, range: String? = nil, method: String = "GET") throws -> (Int, Data, HTTPURLResponse) {
      let done = DispatchSemaphore(value: 0); var output: (Int, Data, HTTPURLResponse)?; var error: Error?
      var request = URLRequest(url: URL(string: uri)!); request.timeoutInterval = 5; request.httpMethod = method
      if let range { request.setValue(range, forHTTPHeaderField: "Range") }
      URLSession.shared.dataTask(with: request) { bytes, response, problem in
        if let response = response as? HTTPURLResponse { output = (response.statusCode, bytes ?? Data(), response) }; error = problem; done.signal()
      }.resume()
      guard done.wait(timeout: .now() + 7) == .success else { throw failure("relay fetch timed out") }
      if let error { throw error }; guard let output else { throw failure("relay fetch missing response") }; return output
    }
    func text(_ value: (Int, Data, HTTPURLResponse)) throws -> String {
      guard value.0 == 200, let text = String(data: value.1, encoding: .utf8) else { throw failure("manifest failed") }; return text
    }
    let relay = try start("master.m3u8"); let master = try text(fetch(relay["uri"]!))
    let head = try fetch(relay["uri"]!, method: "HEAD")
    guard head.0 == 200, head.1.isEmpty, Int(head.2.value(forHTTPHeaderField: "Content-Length") ?? "0") == master.utf8.count else { throw failure("HEAD did not describe rewritten manifest") }
    guard !master.contains("current"), !master.contains("old"), let child = master.split(separator: "\n").first(where: { !$0.hasPrefix("#") }) else { throw failure("manifest did not use private local children") }
    let first = try text(fetch(String(child))); let second = try text(fetch(String(child)))
    guard first != second, first.contains("#EXT-X-MEDIA-SEQUENCE:") else { throw failure("dynamic media playlist was cached") }
    let regex = try NSRegularExpression(pattern: #"URI="([^"]+)""#)
    let attributes = regex.matches(in: first, range: NSRange(first.startIndex..., in: first)).compactMap { Range($0.range(at: 1), in: first).map { String(first[$0]) } }
    guard attributes.count == 2 else { throw failure("key/map rewriting missing") }
    for uri in attributes { guard try fetch(uri).0 == 200 else { throw failure("key/map fetch failed") } }
    guard let segment = first.split(separator: "\n").first(where: { !$0.hasPrefix("#") }) else { throw failure("segment missing") }
    let range = try fetch(String(segment), range: "bytes=2-5")
    guard range.0 == 206, String(data: range.1, encoding: .utf8) == "2345", range.2.value(forHTTPHeaderField: "Content-Range") == "bytes 2-5/10" else { throw failure("range response changed") }
    guard try fetch(String(segment), range: "bytes=0-1,3-4").0 == 400 else { throw failure("multi-range input was not bounded") }
    let denied = try start("denied.m3u8")
    guard try fetch(denied["uri"]!).0 == 502 else { throw failure("cross-origin child was accepted") }
    manager.stop(denied["id"]!)
    let oversized = try start("oversized.ts")
    guard try fetch(oversized["uri"]!).0 == 502 else { throw failure("oversized response was not rejected") }
    manager.stop(oversized["id"]!)
    lock.lock(); let reported = errors; lock.unlock()
    guard reported.contains(where: { $0.contains("32MiB") }), reported.contains(where: { $0.contains("服务器以外") }) else { throw failure("relay limits did not report visible errors") }
    manager.stop(relay["id"]!); manager.shutdown()
    do { _ = try fetch(relay["uri"]!); throw failure("cancelled listener still served media") }
    catch let error as NSError where error.domain == "ZViewerSmoke" { throw error }
    catch { }
    print("Native HLS relay smoke passed: dynamic playlists, prefix/auth, key/map, Range, rejection, limits and cancellation")
  }
  static func failure(_ value: String) -> NSError { NSError(domain: "ZViewerSmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: value]) }
}
