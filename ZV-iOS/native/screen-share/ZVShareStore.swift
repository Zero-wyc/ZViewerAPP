import Foundation
import Security

public enum ZVShareStore {
  public static var group: String {
    Bundle.main.object(forInfoDictionaryKey: "ZViewerShareAppGroup") as? String ?? "group.com.zviewer.mobile.broadcast"
  }
  private static var processDirectory: URL?

  // The iOS 27 backend has a single process owner and needs no cross-process
  // container or shared keychain entitlement.
  public static func useProcessStorage() throws {
    let url = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true).appendingPathComponent("ZViewerScreenShare", isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    processDirectory = url
  }

  private static func directory() throws -> URL {
    if let processDirectory { return processDirectory }
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw failure("当前签名没有启用投屏 App Group，请使用支持广播扩展和 App Group 的签名")
    }
    return url
  }

  public static func failure(_ message: String) -> NSError {
    NSError(domain: "ZViewerScreenShare", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  public static func write(_ name: String, _ value: [String: Any]) throws {
    guard name.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil else { throw failure("共享会话无效") }
    try JSONSerialization.data(withJSONObject: value).write(
      to: directory().appendingPathComponent("\(name).json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  public static func read(_ name: String) -> [String: Any]? {
    guard name.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil,
      let dir = try? directory(),
      let bytes = try? Data(contentsOf: dir.appendingPathComponent("\(name).json")),
      bytes.count <= 65536 else { return nil }
    return (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any]
  }

  public static func available() -> Bool { (try? directory()) != nil }

  private static func key(_ id: String) throws -> [String: Any] {
    let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "ZViewer.BroadcastSession", kSecAttrAccount as String: id]
    if processDirectory != nil { return base }
    let configured = Bundle.main.object(forInfoDictionaryKey: "ZViewerShareKeychainGroup") as? String ?? ""
    let group: String
    if !configured.contains("$("), configured.hasSuffix(".com.zviewer.mobile.share") {
      group = configured
    } else {
      // Unsigned IPAs are signed later. Read the actual signing prefix from a
      // harmless default-keychain item instead of baking a developer Team in.
      let probe: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "ZViewer.BroadcastIdentity", kSecAttrAccount as String: "signing-prefix"]
      var attributes = probe
      attributes[kSecValueData as String] = Data()
      attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      let added = SecItemAdd(attributes as CFDictionary, nil)
      guard added == errSecSuccess || added == errSecDuplicateItem else { throw failure("当前签名无法访问投屏共享钥匙串") }
      var lookup = probe; lookup[kSecReturnAttributes as String] = true
      var result: CFTypeRef?
      guard SecItemCopyMatching(lookup as CFDictionary, &result) == errSecSuccess,
        let actual = (result as? [String: Any])?[kSecAttrAccessGroup as String] as? String,
        let prefix = actual.split(separator: ".").first, !prefix.isEmpty else { throw failure("无法读取投屏签名前缀") }
      group = "\(prefix).com.zviewer.mobile.share"
    }
    var query = base
    query[kSecAttrAccessGroup as String] = group
    return query
  }

  public static func saveToken(_ token: String, id: String) throws {
    let query = try key(id)
    SecItemDelete(query as CFDictionary)
    var value = query
    value[kSecValueData as String] = Data(token.utf8)
    value[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    guard SecItemAdd(value as CFDictionary, nil) == errSecSuccess else { throw failure("当前签名无法访问投屏共享钥匙串") }
  }

  public static func token(_ id: String) -> String? {
    guard var query = try? key(id) else { return nil }
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  public static func revoke(_ id: String) {
    if let query = try? key(id) { SecItemDelete(query as CFDictionary) }
    try? write("command-\(id)", ["stop": true])
  }

  public static func prune() {
    guard let dir = try? directory(), let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
    for file in files where file.pathExtension == "json" {
      if let date = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
        Date().timeIntervalSince(date) > 86400 { try? FileManager.default.removeItem(at: file) }
    }
  }
}
