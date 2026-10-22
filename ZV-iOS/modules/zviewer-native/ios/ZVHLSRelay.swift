import Foundation
import Network

// A loopback-only capability URL keeps the selected server's credentials out
// of rewritten HLS children. Each upstream request is revalidated independently.
final class ZVHLSRelayManager {
  private let queue = DispatchQueue(label: "zviewer.hls-relay")
  private var relays: [String: ZVHLSRelay] = [:]
  var failure: ((String, String) -> Void)?

  func start(uri: String, server: String, token: String, completion: @escaping (Result<[String: String], Error>) -> Void) {
    queue.async { [self] in
      guard self.relays.count < 4 else { completion(.failure(ZVHLSRelay.error("媒体中继会话过多，请停止旧媒体后重试"))); return }
      do {
        let relay = try ZVHLSRelay(uri: uri, server: server, token: token, queue: self.queue)
        self.relays[relay.id] = relay
        let relayId = relay.id
        relay.failure = { [weak self] message in self?.failure?(relayId, message) }
        relay.start { result in
          if case .failure = result { self.relays.removeValue(forKey: relay.id); relay.stop() }
          completion(result.map { ["id": relay.id, "uri": $0] })
        }
      } catch { completion(.failure(error)) }
    }
  }
  func stop(_ id: String) { queue.async { self.relays.removeValue(forKey: id)?.stop() } }
  func shutdown() { queue.async { self.relays.values.forEach { $0.stop() }; self.relays.removeAll() } }
}

private final class ZVHLSRelay: NSObject, URLSessionDataDelegate {
  let id = UUID().uuidString.lowercased()
  var failure: ((String) -> Void)?
  private let queue: DispatchQueue
  private let server: URL
  private let prefix: String
  private let route: String
  private let movieId: String
  private let token: String
  private var initial: URL!
  private var listener: NWListener?
  private var session: URLSession!
  private var port: UInt16 = 0
  private var stopped = false
  private var connections: [ObjectIdentifier: NWConnection] = [:]
  private var requests: [Int: Request] = [:]
  private let playlistLimit = 2_000_000
  private let segmentLimit = 32 * 1024 * 1024

  private final class Request {
    let connection: NWConnection
    let upstream: URL
    let head: Bool
    var response: HTTPURLResponse?
    var bytes = Data()
    init(_ connection: NWConnection, _ upstream: URL, _ head: Bool) { self.connection = connection; self.upstream = upstream; self.head = head }
  }
  static func error(_ message: String) -> NSError { NSError(domain: "ZViewerHLSRelay", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
  private static func origin(_ url: URL) -> String { "\(url.scheme?.lowercased() ?? "")://\(url.host?.lowercased() ?? ""):\(url.port ?? (url.scheme == "https" ? 443 : 80))" }

  init(uri: String, server value: String, token: String, queue: DispatchQueue) throws {
    guard let server = URL(string: value), ["http", "https"].contains(server.scheme?.lowercased() ?? ""), server.host != nil,
          server.user == nil, server.password == nil, server.query == nil, server.fragment == nil,
          !token.isEmpty, token.count <= 16384, !token.contains(where: { $0.isNewline || $0 == "\0" }),
          let rawInput = URL(string: uri) else { throw Self.error("媒体中继配置无效") }
    let input = ZVServerConnectionTransport.shared.logical(rawInput)
    guard let parts = URLComponents(url: input, resolvingAgainstBaseURL: true) else { throw Self.error("媒体中继配置无效") }
    let prefix = server.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    self.prefix = prefix.isEmpty ? "" : "/" + prefix
    let path = parts.path.hasPrefix(self.prefix + "/api/") ? String(parts.path.dropFirst(self.prefix.count)) : parts.path
    guard path.range(of: #"^/api/(emby|jellyfin)/(stream|proxy)$"#, options: .regularExpression) != nil,
          let provider = path.split(separator: "/").dropFirst().first,
          let queries = parts.queryItems, queries.filter({ $0.name == "movieId" }).count == 1,
          let movie = queries.first(where: { $0.name == "movieId" })?.value, let number = Int64(movie), number > 0 else { throw Self.error("媒体中继只接受当前媒体库影片路由") }
    self.server = server; self.token = token; self.queue = queue; self.movieId = movie; self.route = "/api/\(provider)/"
    super.init()
    initial = try canonical(input)
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 45
    config.httpMaximumConnectionsPerHost = 8; config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.httpShouldSetCookies = false; config.urlCache = nil
    let operations = OperationQueue(); operations.maxConcurrentOperationCount = 1; operations.underlyingQueue = queue
    session = URLSession(configuration: config, delegate: self, delegateQueue: operations)
  }

  private func canonical(_ url: URL) throws -> URL {
    let url = ZVServerConnectionTransport.shared.logical(url)
    guard Self.origin(url) == Self.origin(server), url.user == nil, url.password == nil, url.fragment == nil,
          var parts = URLComponents(url: url, resolvingAgainstBaseURL: true) else { throw Self.error("媒体清单包含当前服务器以外的地址") }
    var path = parts.path
    // Server HLS children are root /api URLs even under a selected entry prefix.
    if path.hasPrefix("/api/") { path = prefix + path }
    guard [prefix + route + "stream", prefix + route + "proxy"].contains(path),
          let queries = parts.queryItems, queries.filter({ $0.name == "movieId" }).count == 1,
          queries.first(where: { $0.name == "movieId" })?.value == movieId else { throw Self.error("媒体清单包含其他影片或非媒体库路由") }
    parts.path = path; parts.queryItems = queries.filter { $0.name != "token" } + [URLQueryItem(name: "token", value: token)]
    guard let result = parts.url else { throw Self.error("媒体清单地址无效") }
    return result
  }

  func start(_ completion: @escaping (Result<String, Error>) -> Void) {
    do {
      let parameters = NWParameters.tcp
      parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
      let listener = try NWListener(using: parameters, on: .any); self.listener = listener
      var answered = false
      listener.stateUpdateHandler = { [weak self] state in
        guard let self else { return }
        switch state {
        case .ready:
          guard !answered, let port = self.listener?.port else { return }; answered = true; self.port = port.rawValue
          do { completion(.success(try self.local(self.initial))) } catch { completion(.failure(error)) }
        case .failed:
          if !answered { answered = true; completion(.failure(Self.error("无法启动本机媒体中继"))) }
        default: break
        }
      }
      listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
      listener.start(queue: queue)
    } catch { completion(.failure(Self.error("无法启动本机媒体中继"))) }
  }

  func stop() {
    stopped = true; listener?.stateUpdateHandler = nil; listener?.newConnectionHandler = nil; listener?.cancel(); listener = nil
    session?.invalidateAndCancel(); requests.removeAll()
    connections.values.forEach { $0.cancel() }; connections.removeAll()
  }

  private func local(_ url: URL) throws -> String {
    var parts = URLComponents(url: try canonical(url), resolvingAgainstBaseURL: true)!
    parts.queryItems = parts.queryItems?.filter { $0.name != "token" }
    let value = parts.percentEncodedPath + (parts.percentEncodedQuery.map { "?" + $0 } ?? "")
    let encoded = Data(value.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    guard encoded.count < 12000 else { throw Self.error("媒体清单子地址过长") }
    return "http://127.0.0.1:\(port)/\(id)/\(encoded)"
  }

  private func accept(_ connection: NWConnection) {
    guard !stopped, connections.count < 8 else { connection.cancel(); return }
    let key = ObjectIdentifier(connection); connections[key] = connection
    connection.stateUpdateHandler = { [weak self] state in
      if case .cancelled = state {
        connection.stateUpdateHandler = nil
        self?.connections.removeValue(forKey: key)
        guard let self else { return }
        let tasks = self.requests.filter { $0.value.connection === connection }.map { $0.key }
        self.session.getAllTasks { values in values.filter { tasks.contains($0.taskIdentifier) }.forEach { $0.cancel() } }
      }
    }
    connection.start(queue: queue); receive(connection, Data())
    queue.asyncAfter(deadline: .now() + 50) { [weak self, weak connection] in
      guard let self, let connection, self.connections[ObjectIdentifier(connection)] != nil else { return }
      connection.cancel()
    }
  }

  private func receive(_ connection: NWConnection, _ prior: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 16384 - prior.count) { [weak self] bytes, _, complete, error in
      guard let self, !self.stopped else { return }
      var data = prior; if let bytes { data.append(bytes) }
      if data.range(of: Data("\r\n\r\n".utf8)) != nil { self.handle(connection, data); return }
      if error != nil || complete || data.count >= 16384 { self.respond(connection, 400, Data()); return }
      self.receive(connection, data)
    }
  }

  private func handle(_ connection: NWConnection, _ data: Data) {
    guard let text = String(data: data, encoding: .utf8) else { respond(connection, 400, Data()); return }
    let lines = text.components(separatedBy: "\r\n"); let request = (lines.first ?? "").split(separator: " ")
    guard request.count == 3, ["GET", "HEAD"].contains(String(request[0])) else { respond(connection, 405, Data()); return }
    let path = String(request[1]); let start = "/\(id)/"
    guard path.hasPrefix(start), !path.contains("?"), let host = lines.first(where: { $0.lowercased().hasPrefix("host:") }),
          host.dropFirst(5).trimmingCharacters(in: .whitespaces) == "127.0.0.1:\(port)" else { respond(connection, 403, Data()); return }
    let encoded = String(path.dropFirst(start.count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    let padded = encoded + String(repeating: "=", count: (4 - encoded.count % 4) % 4)
    guard let bytes = Data(base64Encoded: padded), let value = String(data: bytes, encoding: .utf8), value.hasPrefix("/"), !value.hasPrefix("//"),
          let url = URL(string: value, relativeTo: server)?.absoluteURL else { respond(connection, 403, Data()); return }
    do {
      let upstream = try canonical(url)
      // Materialize a bounded GET for HEAD too: rewritten playlist lengths are
      // different from upstream, and must not advertise an empty input to VLC.
      var operation = URLRequest(url: ZVServerConnectionTransport.shared.forward(upstream)); operation.httpMethod = "GET"; operation.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
      operation.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
      if let range = lines.first(where: { $0.lowercased().hasPrefix("range:") }) {
        let value = range.dropFirst(6).trimmingCharacters(in: .whitespaces)
        guard value.count <= 64, value.range(of: #"^bytes=(\d+-\d*|-\d+)$"#, options: .regularExpression) != nil else { respond(connection, 400, Data()); return }
        operation.setValue(value, forHTTPHeaderField: "Range")
      }
      let task = session.dataTask(with: operation); requests[task.taskIdentifier] = Request(connection, upstream, request[0] == "HEAD"); task.resume()
    } catch { fail(connection, error.localizedDescription) }
  }

  private func playlist(_ response: HTTPURLResponse, _ data: Data) -> Bool {
    let type = (response.value(forHTTPHeaderField: "Content-Type") ?? "").lowercased()
    let whitespace = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))
    return type.contains("mpegurl") || String(data: data.prefix(64), encoding: .utf8)?.trimmingCharacters(in: whitespace).hasPrefix("#EXTM3U") == true
  }

  private func rewrite(_ data: Data, _ upstream: URL) throws -> Data {
    guard data.count <= playlistLimit, var text = String(data: data, encoding: .utf8) else { throw Self.error("媒体库HLS清单无效或超过2MiB") }
    if text.first == "\u{FEFF}" { text.removeFirst() }
    guard text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U") else { throw Self.error("媒体库HLS清单无效或超过2MiB") }
    let expression = try NSRegularExpression(pattern: #"\bURI="([^"\r\n]*)""#)
    let lines = try text.components(separatedBy: .newlines).map { line -> String in
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if trimmed.isEmpty { return line }
      if !trimmed.hasPrefix("#") { return try child(trimmed, upstream) }
      let matches = expression.matches(in: line, range: NSRange(line.startIndex..., in: line))
      if line.contains("URI=") && matches.isEmpty { throw Self.error("媒体库HLS清单URI属性无效") }
      var output = line
      for match in matches.reversed() {
        guard let value = Range(match.range(at: 1), in: line), let entire = Range(match.range, in: output) else { throw Self.error("媒体库HLS清单URI属性无效") }
        output.replaceSubrange(entire, with: "URI=\"\(try child(String(line[value]), upstream))\"")
      }
      return output
    }
    return Data(lines.joined(separator: "\n").utf8)
  }
  private func child(_ value: String, _ upstream: URL) throws -> String {
    guard !value.contains("{$"), !value.contains(where: { $0.isNewline || $0 == "\0" }), let url = URL(string: value, relativeTo: upstream)?.absoluteURL else { throw Self.error("媒体库HLS子地址无效") }
    return try local(url)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard let request = requests[dataTask.taskIdentifier], let response = response as? HTTPURLResponse else { completionHandler(.cancel); return }
    request.response = response
    if response.expectedContentLength > Int64(playlist(response, Data()) ? playlistLimit : segmentLimit) { requests.removeValue(forKey: dataTask.taskIdentifier); fail(request.connection, "媒体库响应超过本机中继上限（清单2MiB，分片32MiB）"); completionHandler(.cancel); return }
    completionHandler(.allow)
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard let request = requests[dataTask.taskIdentifier] else { return }
    request.bytes.append(data)
    let limit = request.response.map { playlist($0, request.bytes) ? playlistLimit : segmentLimit } ?? segmentLimit
    if request.bytes.count > limit { requests.removeValue(forKey: dataTask.taskIdentifier); dataTask.cancel(); fail(request.connection, "媒体库响应超过本机中继上限（清单2MiB，分片32MiB）") }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let request = requests.removeValue(forKey: task.taskIdentifier), !stopped else { return }
    guard error == nil, let response = request.response else { fail(request.connection, "媒体库中继请求失败或超时，请重试播放"); return }
    guard [200, 206].contains(response.statusCode) else { fail(request.connection, "媒体库中继请求失败（HTTP \(response.statusCode)）"); return }
    do {
      let hls = playlist(response, request.bytes)
      let bytes = hls ? try rewrite(request.bytes, request.upstream) : request.bytes
      var headers = ["Content-Type": hls ? "application/vnd.apple.mpegurl" : response.value(forHTTPHeaderField: "Content-Type") ?? "application/octet-stream"]
      if !hls { for name in ["Content-Range", "Accept-Ranges"] { if let value = response.value(forHTTPHeaderField: name), !value.contains(where: { $0.isNewline }) { headers[name] = value } } }
      respond(request.connection, hls ? 200 : response.statusCode, request.head ? Data() : bytes, headers: headers, contentLength: bytes.count)
    } catch { fail(request.connection, error.localizedDescription) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    guard let url = request.url, let canonical = try? canonical(url) else { completionHandler(nil); return }
    var next = request; next.url = ZVServerConnectionTransport.shared.forward(canonical); next.setValue("Bearer " + token, forHTTPHeaderField: "Authorization"); completionHandler(next)
  }

  private func fail(_ connection: NWConnection, _ message: String) { failure?(message); respond(connection, 502, Data(message.utf8), headers: ["Content-Type": "text/plain; charset=utf-8"]) }
  private func respond(_ connection: NWConnection, _ status: Int, _ data: Data, headers: [String: String] = [:], contentLength: Int? = nil) {
    guard !stopped else { connection.cancel(); return }
    var text = "HTTP/1.1 \(status) \(status == 200 ? "OK" : status == 206 ? "Partial Content" : "Relay Error")\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: \(contentLength ?? data.count)\r\n"
    for (name, value) in headers { text += "\(name): \(value)\r\n" }; text += "\r\n"
    var output = Data(text.utf8); output.append(data)
    connection.send(content: output, completion: .contentProcessed { [weak self] _ in
      self?.queue.async { connection.cancel(); self?.connections.removeValue(forKey: ObjectIdentifier(connection)) }
    })
  }
}
