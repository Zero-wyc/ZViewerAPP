import Foundation
import UIKit
import ReplayKit
#if canImport(ScreenCaptureKit)
import ScreenCaptureKit
#endif
import ZViewerScreenShare

final class ZVScreenShareCoordinator {
  private var id: String?
  private var picker: RPSystemBroadcastPickerView?
  private var modern: AnyObject?
  private var command: [String: Any] = [:]
  private var storageError: String?

  init() {
    #if canImport(ScreenCaptureKit)
    if #available(iOS 27.0, *) {
      do { try ZVShareStore.useProcessStorage() }
      catch { storageError = "无法准备本机投屏存储，请检查设备空间后重试" }
    }
    #endif
    // A new host process must not silently inherit a previous process's
    // screen-capture authorization or leave its bearer reusable.
    if let previous = ZVShareStore.read("session")?["id"] as? String {
      ZVShareStore.revoke(previous)
    }
  }

  func capability() -> [String: Any] {
    #if targetEnvironment(simulator)
    return ["available": false, "systemAudio": true, "microphone": false, "message": "主动共享需要 iPhone 或 iPad 真机"]
    #else
    if let storageError { return ["available": false, "systemAudio": true, "microphone": false, "message": storageError] }
    let available = ZVShareStore.available()
    return ["available": available, "systemAudio": true, "microphone": false,
      "message": available ? "" : "当前签名无法访问投屏共享容器。请为主程序和广播扩展同时授权 \(ZVShareStore.group)，并保留共享钥匙串权限后重新签名安装。"]
    #endif
  }

  func prepare(_ json: String) throws -> [String: Any] {
    guard let data = json.data(using: .utf8),
      var options = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      let token = options.removeValue(forKey: "token") as? String, !token.isEmpty,
      let server = options["server"] as? String, let url = URL(string: server),
      ["https", "http"].contains(url.scheme ?? ""), url.host != nil, url.user == nil, url.password == nil,
      let room = options["roomId"] as? String, !room.isEmpty else { throw ZVShareStore.failure("投屏会话配置无效") }
    if let previous = id {
      let phase = ZVShareStore.read("status-\(previous)")?["phase"] as? String
      let updated = ZVShareStore.read("status-\(previous)")?["updatedAt"] as? Double ?? 0
      guard phase == "stopped" || phase == "error" || Date().timeIntervalSince1970 - updated > 12 else { throw ZVShareStore.failure("请先停止当前共享") }
      ZVShareStore.revoke(previous)
    }
    let id = UUID().uuidString
    let expires = options["expires"] as? Double ?? 0
    guard expires > Date().timeIntervalSince1970 + 30 else { throw ZVShareStore.failure("登录授权即将到期，请刷新登录后重试") }
    options["expires"] = min(expires, Date().timeIntervalSince1970 + 3600)
    options["id"] = id
    let videoSettings = ZVShareVideoSettings(quality: options["quality"] as? String, framesPerSecond: options["framesPerSecond"] as? Int)
    options["quality"] = videoSettings.quality
    options["framesPerSecond"] = videoSettings.framesPerSecond
    ZVShareStore.prune()
    try ZVShareStore.saveToken(token, id: id)
    do {
      command = ["claim": false, "stop": false, "paused": false, "systemAudio": options["systemAudio"] as? Bool ?? false]
      try ZVShareStore.write("command-\(id)", command)
      try ZVShareStore.write("status-\(id)", ["id": id, "phase": "requesting-permission", "updatedAt": Date().timeIntervalSince1970])
      try ZVShareStore.write("session", options)
      self.id = id
      return ["id": id]
    } catch { ZVShareStore.revoke(id); throw error }
  }

  func present(_ expected: String) throws {
    guard expected == id, let options = ZVShareStore.read("session"), options["id"] as? String == id else { throw ZVShareStore.failure("投屏会话已失效") }
    #if canImport(ScreenCaptureKit)
    if #available(iOS 27.0, *) {
      let capture = ZVModernScreenCapture(options: options)
      modern = capture
      capture.present()
      scheduleTimeout(expected)
      return
    }
    #endif
    do {
      let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 44, height: 44))
      picker.preferredExtension = "\(Bundle.main.bundleIdentifier ?? "com.zviewer.mobile").BroadcastUpload"
      picker.showsMicrophoneButton = false
      guard let button = picker.subviews.compactMap({ $0 as? UIButton }).first,
        let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first(where: { $0.activationState == .foregroundActive }),
        let window = scene.windows.first(where: \.isKeyWindow) else { throw ZVShareStore.failure("系统广播选择器暂不可用") }
      picker.alpha = 0.01; window.addSubview(picker); self.picker = picker
      button.sendActions(for: .touchUpInside)
    }
    scheduleTimeout(expected)
  }

  private func scheduleTimeout(_ expected: String) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
      guard let self, self.id == expected,
        ZVShareStore.read("status-\(expected)")?["phase"] as? String == "requesting-permission" else { return }
      self.stop(expected)
      try? ZVShareStore.write("status-\(expected)", ["id": expected, "phase": "error", "message": "系统授权已取消或超时，请重新开始", "updatedAt": Date().timeIntervalSince1970])
    }
  }

  func control(_ expected: String, _ json: String) throws {
    guard id == expected, ZVShareStore.token(expected) != nil,
      let bytes = json.data(using: .utf8), let value = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else {
      throw ZVShareStore.failure("投屏会话已失效")
    }
    for key in ["claim", "paused", "systemAudio"] { if let flag = value[key] as? Bool { command[key] = flag } }
    try ZVShareStore.write("command-\(expected)", command)
  }

  func snapshot(_ expected: String) -> [String: Any] {
    guard expected == id else { return ["id": expected, "phase": "stopped"] }
    let value = ZVShareStore.read("status-\(expected)") ?? ["id": expected, "phase": "stopped"]
    let phase = value["phase"] as? String ?? ""
    if !["stopped", "error", "requesting-permission"].contains(phase),
      let updated = value["updatedAt"] as? Double, Date().timeIntervalSince1970 - updated > 12 {
      stop(expected)
      let stopped: [String: Any] = ["id": expected, "phase": "error", "message": "系统共享进程已结束，请重新开始", "updatedAt": Date().timeIntervalSince1970]
      try? ZVShareStore.write("status-\(expected)", stopped)
      return stopped
    }
    return value
  }

  func stop(_ expected: String) {
    guard expected == id else { return }
    command["stop"] = true; try? ZVShareStore.write("command-\(expected)", command)
    ZVShareStore.revoke(expected)
    #if canImport(ScreenCaptureKit)
    if #available(iOS 27.0, *) { (modern as? ZVModernScreenCapture)?.stop() }
    #endif
    modern = nil; picker?.removeFromSuperview(); picker = nil
    if ZVShareStore.read("status-\(expected)")?["phase"] as? String == "requesting-permission" {
      try? ZVShareStore.write("status-\(expected)", ["id": expected, "phase": "stopped", "updatedAt": Date().timeIntervalSince1970])
    }
  }

  func shutdown() { if let id { stop(id) } }
}

#if canImport(ScreenCaptureKit)
@available(iOS 27.0, *)
private final class ZVModernScreenCapture: NSObject, SCContentSharingPickerObserver, SCStreamOutput, SCStreamDelegate {
  private let options: [String: Any]
  private var stream: SCStream?
  private var sender: ZVShareSender?
  private var stopped = false
  private let samples = DispatchQueue(label: "zviewer.share.capture", qos: .userInteractive)
  init(options: [String: Any]) { self.options = options; super.init() }

  func present() {
    let picker = SCContentSharingPicker.shared
    guard picker.isAvailable else { fail("此设备当前无法共享屏幕"); return }
    var configuration = SCContentSharingPickerConfiguration()
    configuration.showsMicrophoneControl = false
    configuration.showsCameraControl = false
    picker.defaultConfiguration = configuration
    picker.add(self); picker.isActive = true; picker.present()
  }
  func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) { stop() }
  func contentSharingPickerStartDidFailWithError(_ error: Error) { fail("无法打开系统屏幕共享授权") }
  func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
    DispatchQueue.main.async { [weak self] in self?.start(filter) }
  }
  private func start(_ filter: SCContentFilter) {
    guard !stopped, stream == nil else { return }
    do {
      let sender = try ZVShareSender(options: options)
      self.sender = sender
      sender.finished = { [weak self] _ in DispatchQueue.main.async { self?.stop() } }
      let configuration = SCStreamConfiguration()
      // Capture permission is fixed at stream creation; transmission may be
      // toggled later without recreating the system capture session.
      configuration.capturesAudio = true
      configuration.sampleRate = 48000; configuration.channelCount = 1
      let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
      try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: samples)
      try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: samples)
      self.stream = stream
      stream.startCapture { [weak self] error in
        guard let self else { return }
        DispatchQueue.main.async {
          guard !self.stopped else { return }
          if error != nil { self.fail("系统未能启动屏幕共享") }
          else { sender.start() }
        }
      }
    } catch { fail("屏幕共享初始化失败") }
  }
  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    if type == .screen {
      sender?.videoSample(sampleBuffer, rotation: ZVShareVideoProcessor.rotation(for: sampleBuffer, key: SCStreamFrameInfo.videoOrientation.rawValue as CFString))
    } else if type == .audio { sender?.audioSample(sampleBuffer) }
  }
  func stream(_ stream: SCStream, didStopWithError error: Error) { fail("系统已结束屏幕共享") }
  private func fail(_ message: String) {
    if let sender { sender.stop(message) }
    else if let id = options["id"] as? String {
      ZVShareStore.revoke(id)
      try? ZVShareStore.write("status-\(id)", ["id": id, "phase": "error", "message": message, "updatedAt": Date().timeIntervalSince1970])
    }
    stop()
  }
  func stop() {
    guard !stopped else { return }; stopped = true
    SCContentSharingPicker.shared.remove(self); SCContentSharingPicker.shared.isActive = false
    stream?.stopCapture(completionHandler: { _ in }); stream = nil
    sender?.finished = nil; sender?.stop(); sender = nil
    if let id = options["id"] as? String, ZVShareStore.read("status-\(id)")?["phase"] as? String == "requesting-permission" {
      ZVShareStore.revoke(id)
      try? ZVShareStore.write("status-\(id)", ["id": id, "phase": "stopped", "updatedAt": Date().timeIntervalSince1970])
    }
  }
}
#endif
