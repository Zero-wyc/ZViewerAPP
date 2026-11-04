import Foundation
import AVFoundation
import VideoToolbox
import LiveKitWebRTC
import SocketIO

public final class ZVShareSender: NSObject, LKRTCPeerConnectionDelegate {
  public let id: String
  public var finished: ((String?) -> Void)?
  public let queue = DispatchQueue(label: "zviewer.share.sender", qos: .userInitiated)
  private let options: [String: Any]
  private let audio = ZVShareAudioDevice()
  private var factory: LKRTCPeerConnectionFactory?
  private var source: LKRTCVideoSource?
  private var video: LKRTCVideoTrack?
  private var audioTrack: LKRTCAudioTrack?
  private var capturer: LKRTCVideoCapturer?
  private var manager: SocketManager?
  private var socket: SocketIOClient?
  private var trust: ZVShareTrust?
  private var peers: [String: LKRTCPeerConnection] = [:]
  private var earlyIce: [String: [LKRTCIceCandidate]] = [:]
  private var poll: DispatchSourceTimer?
  private var closed = false
  private var connected = false
  private var paused = false
  private var systemPaused = false
  private var systemAudio = false
  private var frames = 0
  private var lastFrame: Double = 0
  private var frameSize = CGSize.zero
  private var startedAt = Date()
  private var disconnectedAt: Date?
  private var lastSnapshot: Double = 0
  private let frameGate = DispatchSemaphore(value: 1)
  private var transfer: VTPixelTransferSession?

  public init(options: [String: Any]) throws {
    guard let id = options["id"] as? String, !id.isEmpty else { throw ZVShareStore.failure("共享会话不存在") }
    self.id = id; self.options = options
    super.init()
  }

  public func start() {
    queue.async { [self] in
      guard !closed else { return }
      systemAudio = options["systemAudio"] as? Bool ?? false
      audio.enabled = systemAudio
      factory = LKRTCPeerConnectionFactory(encoderFactory: LKRTCDefaultVideoEncoderFactory(), decoderFactory: LKRTCDefaultVideoDecoderFactory(), audioDevice: audio)
      source = factory?.videoSource(forScreenCast: true)
      if let source {
        capturer = LKRTCVideoCapturer(delegate: source)
        video = factory?.videoTrack(with: source, trackId: "zviewer-screen")
      }
      let constraints = LKRTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["googEchoCancellation": "false", "googNoiseSuppression": "false", "googAutoGainControl": "false"])
      if let audioSource = factory?.audioSource(with: constraints) { audioTrack = factory?.audioTrack(with: audioSource, trackId: "zviewer-app-audio") }
      publish("awaiting-host")
      let timer = DispatchSource.makeTimerSource(queue: queue)
      timer.schedule(deadline: .now(), repeating: .milliseconds(300))
      timer.setEventHandler { [weak self] in self?.tick() }
      poll = timer; timer.resume()
    }
  }

  private func tick() {
    guard !closed else { return }
    let command = ZVShareStore.read("command-\(id)") ?? [:]
    if command["stop"] as? Bool == true { stopOnQueue(nil); return }
    guard let expires = options["expires"] as? Double, expires > Date().timeIntervalSince1970,
      ZVShareStore.token(id) != nil else { stopOnQueue("投屏授权已到期，请返回房间重新开始"); return }
    paused = systemPaused || (command["paused"] as? Bool ?? false)
    systemAudio = command["systemAudio"] as? Bool ?? (options["systemAudio"] as? Bool ?? false)
    audio.enabled = systemAudio && !paused
    video?.isEnabled = !paused; audioTrack?.isEnabled = systemAudio && !paused
    if manager == nil && command["claim"] as? Bool == true { connect() }
    if !connected && startedAt.timeIntervalSinceNow < -45 { stopOnQueue("共享连接超时，请返回房间重试"); return }
    if let date = disconnectedAt, date.timeIntervalSinceNow < -30 { stopOnQueue("网络连接已断开，请返回房间重新开始"); return }
    if Date().timeIntervalSince1970 - lastSnapshot >= 1 { publish(connected && frames > 0 ? (paused ? "paused" : "sharing") : manager == nil ? "awaiting-host" : "starting") }
  }

  private func connect() {
    guard let server = options["server"] as? String, let url = URL(string: server),
      let host = url.host, ["http", "https"].contains(url.scheme ?? ""), let token = ZVShareStore.token(id) else {
      stopOnQueue("投屏服务器配置无效"); return
    }
    var origin = URLComponents()
    origin.scheme = url.scheme; origin.host = host; origin.port = url.port
    guard let socketURL = origin.url else { stopOnQueue("投屏服务器配置无效"); return }
    let trust = ZVShareTrust(host: host, allowException: url.scheme == "https" && options["certificateException"] as? Bool == true)
    self.trust = trust
    let manager = SocketManager(socketURL: socketURL, config: [
      .path(url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).isEmpty ? "/socket.io" : "\(url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))/socket.io".withLeadingSlash),
      .version(.three), .handleQueue(queue), .forceWebsockets(true), .reconnectAttempts(10), .reconnectWait(1), .security(trust), .log(false)
    ])
    self.manager = manager
    let socket = manager.defaultSocket
    self.socket = socket
    socket.on(clientEvent: .connect) { [weak self] _, _ in self?.register() }
    socket.on(clientEvent: .disconnect) { [weak self] _, _ in
      guard let self, !closed else { return }
      connected = false; disconnectedAt = Date(); clearPeers(); publish("starting")
    }
    socket.on(clientEvent: .error) { [weak self] _, _ in
      guard let self, !closed else { return }
      if disconnectedAt == nil { disconnectedAt = Date() }
    }
    socket.on("viewer-ready") { [weak self] values, _ in
      guard let self, let from = (values.first as? [String: Any])?["from"] as? String, from.count <= 128 else { return }
      makePeer(from)
    }
    socket.on("signal-answer") { [weak self] values, _ in self?.answer(values.first) }
    socket.on("signal-ice-candidate") { [weak self] values, _ in self?.ice(values.first) }
    socket.on("viewer-left") { [weak self] values, _ in
      guard let self, let from = (values.first as? [String: Any])?["viewerSocketId"] as? String else { return }
      peers.removeValue(forKey: from)?.close(); earlyIce.removeValue(forKey: from)
    }
    for event in ["room-closed", "viewer-kicked"] {
      socket.on(event) { [weak self] _, _ in self?.stopOnQueue("房间已关闭或共享权限已撤销") }
    }
    socket.on("room-mode-changed") { [weak self] values, _ in
      if let mode = (values.first as? [String: Any])?["mode"] as? String, mode != "screen-share" { self?.stopOnQueue("房间已切换模式") }
    }
    socket.on("host-transferred") { [weak self] values, _ in
      guard let self, let target = (values.first as? [String: Any])?["newHostSocketId"] as? String, target != socket.sid else { return }
      stopOnQueue("房主身份已移交")
    }
    socket.connect(withPayload: ["token": token])
  }

  private func register() {
    guard !closed, let room = options["roomId"] as? String, let socket else { return }
    socket.emitWithAck("register-host", ["roomId": room]).timingOut(after: 10) { [weak self] values in
      guard let self, !closed else { return }
      guard let result = values.first as? [String: Any], result["success"] as? Bool == true else {
        stopOnQueue("共享端接管房间失败，请返回房间重试"); return
      }
      if let data = result["data"] as? [String: Any], let mode = data["mode"] as? String, mode != "screen-share" {
        stopOnQueue("房间已切换模式"); return
      }
      connected = true; disconnectedAt = nil
      socket.emit("sharer-ready", ["roomId": room])
      publish(frames > 0 ? "sharing" : "starting")
    }
  }

  private func makePeer(_ from: String) {
    guard connected, !closed, let factory, let video else { return }
    peers.removeValue(forKey: from)?.close(); earlyIce.removeValue(forKey: from)
    guard peers.count < 2 else { return }
    let config = LKRTCConfiguration()
    config.sdpSemantics = .unifiedPlan
    config.iceServers = [LKRTCIceServer(urlStrings: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"])]
    let constraints = LKRTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
    guard let peer = factory.peerConnection(with: config, constraints: constraints, delegate: self) else { return }
    peers[from] = peer
    peer.add(video, streamIds: ["zviewer-screen"])
    if let audioTrack { peer.add(audioTrack, streamIds: ["zviewer-screen"]) }
    peer.offer(for: constraints) { [weak self, weak peer] offer, error in
      guard let self, let peer else { return }
      queue.async {
        guard !self.closed, self.peers[from] === peer, let offer, error == nil else { return }
        peer.setLocalDescription(offer) { [weak self, weak peer] error in
          guard let self, let peer else { return }
          queue.async {
            guard !self.closed, self.peers[from] === peer, error == nil else { return }
            self.socket?.emit("signal-offer", ["to": from, "data": ["type": "offer", "sdp": offer.sdp]])
          }
        }
      }
    }
  }

  private func answer(_ raw: Any?) {
    guard !closed, let value = raw as? [String: Any], let from = value["from"] as? String,
      let data = value["data"] as? [String: Any], data["type"] as? String == "answer",
      let sdp = data["sdp"] as? String, sdp.utf8.count <= 262144,
      let peer = peers[from], peer.signalingState == .haveLocalOffer else { return }
    peer.setRemoteDescription(LKRTCSessionDescription(type: .answer, sdp: sdp)) { [weak self, weak peer] error in
      guard let self, let peer else { return }
      queue.async {
        guard !self.closed, self.peers[from] === peer, error == nil else { return }
        for candidate in self.earlyIce.removeValue(forKey: from) ?? [] { peer.add(candidate, completionHandler: { _ in }) }
      }
    }
  }

  private func ice(_ raw: Any?) {
    guard !closed, let value = raw as? [String: Any], let from = value["from"] as? String,
      let data = value["data"] as? [String: Any], let sdp = data["candidate"] as? String, sdp.utf8.count <= 8192,
      let peer = peers[from] else { return }
    let candidate = LKRTCIceCandidate(sdp: sdp, sdpMLineIndex: (data["sdpMLineIndex"] as? NSNumber)?.int32Value ?? 0, sdpMid: data["sdpMid"] as? String)
    if peer.remoteDescription != nil { peer.add(candidate, completionHandler: { _ in }) }
    else if (earlyIce[from]?.count ?? 0) < 64 { earlyIce[from, default: []].append(candidate) }
  }

  // A single owned frame may be in flight; ReplayKit-owned memory never escapes its callback.
  public func videoSample(_ sample: CMSampleBuffer, rotation: Int) {
    guard CMSampleBufferDataIsReady(sample), let input = CMSampleBufferGetImageBuffer(sample),
      frameGate.wait(timeout: .now()) == .success else { return }
    let stamp = CMSampleBufferGetPresentationTimeStamp(sample).seconds
    guard stamp.isFinite, stamp - lastFrame >= 1.0 / 30.0 else { frameGate.signal(); return }
    lastFrame = stamp
    let rawWidth = CVPixelBufferGetWidth(input), rawHeight = CVPixelBufferGetHeight(input)
    let cap = (options["quality"] as? String) == "540p" ? 960.0 : 1280.0
    let scale = min(1, cap / Double(max(rawWidth, rawHeight)))
    let width = max(2, Int(Double(rawWidth) * scale) & ~1), height = max(2, Int(Double(rawHeight) * scale) & ~1)
    var copied: CVPixelBuffer?
    guard CVPixelBufferCreate(kCFAllocatorDefault, width, height, CVPixelBufferGetPixelFormatType(input),
      [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &copied) == kCVReturnSuccess, let copied else { frameGate.signal(); return }
    if transfer == nil { VTPixelTransferSessionCreate(allocator: kCFAllocatorDefault, pixelTransferSessionOut: &transfer) }
    guard let transfer, VTPixelTransferSessionTransferImage(transfer, from: input, to: copied) == noErr else { frameGate.signal(); return }
    queue.async { [self] in
      defer { frameGate.signal() }
      guard !closed, !paused, let source, let capturer else { return }
      source.adaptOutputFormat(toWidth: Int32(width), height: Int32(height), fps: 30)
      let rtcRotation = LKRTCVideoRotation(rawValue: rotation) ?? ._0
      source.capturer(capturer, didCapture: LKRTCVideoFrame(buffer: LKRTCCVPixelBuffer(pixelBuffer: copied), rotation: rtcRotation, timeStampNs: Int64(stamp * 1_000_000_000)))
      frames += 1; frameSize = CGSize(width: width, height: height)
    }
  }

  public func audioSample(_ sample: CMSampleBuffer) { audio.appendSample(sample) }
  public func stop(_ message: String? = nil) { queue.async { [self] in stopOnQueue(message) } }
  public func pause(_ value: Bool) { queue.async { [self] in systemPaused = value; paused = value || (ZVShareStore.read("command-\(id)")?["paused"] as? Bool ?? false); video?.isEnabled = !paused; audio.enabled = systemAudio && !paused; publish(paused ? "paused" : "sharing") } }
  private func clearPeers() { for peer in peers.values { peer.close() }; peers.removeAll(); earlyIce.removeAll() }
  private func stopOnQueue(_ message: String?) {
    guard !closed else { return }; closed = true
    poll?.cancel(); poll = nil; clearPeers()
    video?.isEnabled = false; audioTrack?.isEnabled = false
    video = nil; audioTrack = nil; source = nil; capturer = nil
    audio.shutdown(); factory = nil
    if connected, let room = options["roomId"] as? String { socket?.emit("host-leave", ["roomId": room]) }
    connected = false; socket?.removeAllHandlers(); socket?.disconnect(); socket = nil; manager = nil; trust = nil
    ZVShareStore.revoke(id)
    publish(message == nil ? "stopped" : "error", message: message)
    finished?(message)
  }
  private func publish(_ phase: String, message: String? = nil) {
    lastSnapshot = Date().timeIntervalSince1970
    var value: [String: Any] = ["id": id, "phase": phase, "updatedAt": lastSnapshot,
      "viewers": peers.count, "capturedFrames": frames, "audioSamples": audio.sampleCount,
      "width": frameSize.width, "height": frameSize.height, "systemAudio": systemAudio]
    if let message { value["message"] = message }
    try? ZVShareStore.write("status-\(id)", value)
  }

  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didGenerate candidate: LKRTCIceCandidate) {
    queue.async { [weak self, weak peerConnection] in
      guard let self, let peerConnection, !closed, let from = peers.first(where: { $0.value === peerConnection })?.key else { return }
      var data: [String: Any] = ["candidate": candidate.sdp, "sdpMLineIndex": candidate.sdpMLineIndex]
      if let mid = candidate.sdpMid { data["sdpMid"] = mid }
      socket?.emit("signal-ice-candidate", ["to": from, "data": data])
    }
  }
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceConnectionState) {
    guard newState == .failed else { return }
    queue.async { [weak self, weak peerConnection] in
      guard let self, let peerConnection, let from = peers.first(where: { $0.value === peerConnection })?.key else { return }
      peers.removeValue(forKey: from)?.close(); earlyIce.removeValue(forKey: from)
    }
  }
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange stateChanged: LKRTCSignalingState) {}
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd stream: LKRTCMediaStream) {}
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove stream: LKRTCMediaStream) {}
  public func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {}
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceGatheringState) {}
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove candidates: [LKRTCIceCandidate]) {}
  public func peerConnection(_ peerConnection: LKRTCPeerConnection, didOpen dataChannel: LKRTCDataChannel) {}
}

private extension String {
  var withLeadingSlash: String { hasPrefix("/") ? self : "/\(self)" }
}
