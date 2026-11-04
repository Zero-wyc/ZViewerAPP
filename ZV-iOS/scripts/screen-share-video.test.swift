import Foundation
import CoreMedia
import CoreVideo
#if canImport(LiveKitWebRTC)
import LiveKitWebRTC
#endif

@main
enum ScreenShareVideoTest {
  static func buffer(width: Int, height: Int, format: OSType) -> CVPixelBuffer {
    var result: CVPixelBuffer?
    precondition(CVPixelBufferCreate(kCFAllocatorDefault, width, height, format,
      [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &result) == kCVReturnSuccess)
    return result!
  }

  static func pixels(_ buffer: CVPixelBuffer) -> [UInt8] {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    let planar = CVPixelBufferIsPlanar(buffer)
    let base = (planar ? CVPixelBufferGetBaseAddressOfPlane(buffer, 0) : CVPixelBufferGetBaseAddress(buffer))!.assumingMemoryBound(to: UInt8.self)
    let stride = planar ? CVPixelBufferGetBytesPerRowOfPlane(buffer, 0) : CVPixelBufferGetBytesPerRow(buffer)
    let step = planar ? 1 : 4
    return (0..<CVPixelBufferGetHeight(buffer)).flatMap { y in
      (0..<CVPixelBufferGetWidth(buffer)).map { x in base[y * stride + x * step] }
    }
  }

  static func pattern(_ buffer: CVPixelBuffer) {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    let planar = CVPixelBufferIsPlanar(buffer)
    let base = (planar ? CVPixelBufferGetBaseAddressOfPlane(buffer, 0) : CVPixelBufferGetBaseAddress(buffer))!.assumingMemoryBound(to: UInt8.self)
    let stride = planar ? CVPixelBufferGetBytesPerRowOfPlane(buffer, 0) : CVPixelBufferGetBytesPerRow(buffer)
    for y in 0..<CVPixelBufferGetHeight(buffer) {
      for x in 0..<CVPixelBufferGetWidth(buffer) {
        let offset = y * stride + x * (planar ? 1 : 4)
        let value = UInt8(20 + x * 6 + y * 30)
        base[offset] = value
        if !planar { base[offset + 1] = value; base[offset + 2] = value; base[offset + 3] = 255 }
      }
    }
    if planar {
      memset(CVPixelBufferGetBaseAddressOfPlane(buffer, 1), 128,
        CVPixelBufferGetBytesPerRowOfPlane(buffer, 1) * CVPixelBufferGetHeightOfPlane(buffer, 1))
    }
  }

  static func main() {
    let settings = ZVShareVideoSettings(quality: "1080p", framesPerSecond: 60)
    for format in [kCVPixelFormatType_32BGRA, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange] {
      let processor = ZVShareVideoProcessor(settings: settings)
      let input = buffer(width: 8, height: 4, format: format)
      pattern(input)
      for rotation in [0, 90, 180, 270, 0, 270, 90] {
        let output = processor.copyFrame(input, rotation: rotation)!
        let width = rotation == 90 || rotation == 270 ? 4 : 8
        let height = rotation == 90 || rotation == 270 ? 8 : 4
        precondition(CVPixelBufferGetWidth(output) == width && CVPixelBufferGetHeight(output) == height)
        let values = pixels(output)
        for y in 0..<height {
          for x in 0..<width {
            let source: (Int, Int)
            switch rotation {
            case 90: source = (y, 3 - x)
            case 180: source = (7 - x, 3 - y)
            case 270: source = (7 - y, x)
            default: source = (x, y)
            }
            precondition(abs(Int(values[y * width + x]) - (20 + source.0 * 6 + source.1 * 30)) <= 1,
              "Pixel orientation mismatch at \(x),\(y) / \(rotation) / \(format)")
          }
        }
      }
      let large = buffer(width: 2360, height: 1648, format: format)
      for rotation in [0, 90, 180, 270, 0] {
        let output = processor.copyFrame(large, rotation: rotation)!
        precondition(CVPixelBufferGetWidth(output) == (rotation == 90 || rotation == 270 ? 1080 : 1546))
        precondition(CVPixelBufferGetHeight(output) == (rotation == 90 || rotation == 270 ? 1546 : 1080))
      }
    }
    let image = buffer(width: 8, height: 4, format: kCVPixelFormatType_32BGRA)
    var description: CMVideoFormatDescription?
    precondition(CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: image, formatDescriptionOut: &description) == noErr)
    var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .zero, decodeTimeStamp: .invalid)
    var sample: CMSampleBuffer?
    precondition(CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: image,
      formatDescription: description!, sampleTiming: &timing, sampleBufferOut: &sample) == noErr)
    let key = "ScreenShareTestOrientation" as CFString
    precondition(ZVShareVideoProcessor.rotation(for: sample!, key: key) == 0)
    CMSetAttachment(sample!, key: key, value: NSNumber(value: 6), attachmentMode: kCMAttachmentMode_ShouldPropagate)
    precondition(ZVShareVideoProcessor.rotation(for: sample!, key: key) == 90)
    CMRemoveAttachment(sample!, key: key)
    let attachments = CMSampleBufferGetSampleAttachmentsArray(sample!, createIfNecessary: true)! as NSArray
    let entry = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
    let orientation = NSNumber(value: 8)
    CFDictionarySetValue(entry, Unmanaged.passUnretained(key).toOpaque(), Unmanaged.passUnretained(orientation).toOpaque())
    precondition(ZVShareVideoProcessor.rotation(for: sample!, key: key) == 270)
    print("Video pixels passed: BGRA/NV12, 0/90/180/270 degrees, repeated swaps, 1546x1080 -> 1080x1546, attachment locations")
    #if canImport(LiveKitWebRTC)
    codecRoundTrip()
    #endif
  }

  #if canImport(LiveKitWebRTC)
  static func codecRoundTrip() {
    let loopback = VideoLoopback()
    defer { loopback.close() }
    let input = buffer(width: 2360, height: 1648, format: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange)
    CVPixelBufferLockBaseAddress(input, [])
    let base = CVPixelBufferGetBaseAddressOfPlane(input, 0)!.assumingMemoryBound(to: UInt8.self)
    let stride = CVPixelBufferGetBytesPerRowOfPlane(input, 0)
    for y in 0..<1648 {
      for x in 0..<2360 { base[y * stride + x] = UInt8(80 + (x >= 1180 ? 40 : 0) + (y >= 824 ? 80 : 0)) }
    }
    memset(CVPixelBufferGetBaseAddressOfPlane(input, 1), 128,
      CVPixelBufferGetBytesPerRowOfPlane(input, 1) * CVPixelBufferGetHeightOfPlane(input, 1))
    CVPixelBufferUnlockBaseAddress(input, [])
    let processor = ZVShareVideoProcessor(settings: ZVShareVideoSettings(quality: "1080p", framesPerSecond: 30))
    for rotation in [0, 90, 180, 270, 0] {
      let expected: [Int]
      switch rotation {
      case 90: expected = [160, 80, 200, 120]
      case 180: expected = [200, 160, 120, 80]
      case 270: expected = [120, 200, 80, 160]
      default: expected = [80, 120, 160, 200]
      }
      let output = processor.copyFrame(input, rotation: rotation)!
      let received = loopback.receive(output, firstLuma: expected[0])
      let width = Int(received.width), height = Int(received.height)
      precondition(width == CVPixelBufferGetWidth(output) && height == CVPixelBufferGetHeight(output))
      precondition(received.rotation == ._0)
      let yuv = received.buffer.toI420()
      for quadrant in 0..<4 {
        let x = width * (quadrant % 2 == 0 ? 1 : 3) / 4
        let y = height * (quadrant < 2 ? 1 : 3) / 4
        precondition(abs(Int(yuv.dataY[y * Int(yuv.strideY) + x]) - expected[quadrant]) < 20, "H264 pixel orientation changed")
      }
      print("H264 round trip: \(rotation) degrees -> decoded \(width)x\(height), rotation 0, pixels upright")
    }
  }
  #endif
}

#if canImport(LiveKitWebRTC)
private final class VideoLoopback: NSObject, LKRTCPeerConnectionDelegate, LKRTCVideoRenderer {
  private let factory = LKRTCPeerConnectionFactory(encoderFactory: LKRTCDefaultVideoEncoderFactory(), decoderFactory: LKRTCDefaultVideoDecoderFactory())
  private var sending: LKRTCPeerConnection!
  private var receiving: LKRTCPeerConnection!
  private var source: LKRTCVideoSource!
  private var capturer: LKRTCVideoCapturer!
  private var remoteTrack: LKRTCVideoTrack?
  private let lock = NSLock()
  private var latest: LKRTCVideoFrame?
  private var ready = false
  private var pendingSend: [LKRTCIceCandidate] = []
  private var pendingReceive: [LKRTCIceCandidate] = []

  override init() {
    super.init()
    let configuration = LKRTCConfiguration(); configuration.sdpSemantics = .unifiedPlan
    let constraints = LKRTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
    sending = factory.peerConnection(with: configuration, constraints: constraints, delegate: self)!
    receiving = factory.peerConnection(with: configuration, constraints: constraints, delegate: self)!
    source = factory.videoSource(forScreenCast: true); capturer = LKRTCVideoCapturer(delegate: source)
    sending.add(factory.videoTrack(with: source, trackId: "test-screen"), streamIds: ["test"])
    let codecs = factory.rtpSenderCapabilities(forKind: "video").codecs.filter { $0.name == "H264" }
    precondition(!codecs.isEmpty)
    try! sending.transceivers.first!.setCodecPreferences(codecs, error: ())
    sending.offer(for: constraints) { offer, error in
      precondition(error == nil)
      self.sending.setLocalDescription(offer!) { error in
        precondition(error == nil)
        self.receiving.setRemoteDescription(offer!) { error in
          precondition(error == nil)
          self.flush()
          self.receiving.answer(for: constraints) { answer, error in
            precondition(error == nil)
            self.receiving.setLocalDescription(answer!) { error in
              precondition(error == nil)
              self.sending.setRemoteDescription(answer!) { error in
                precondition(error == nil)
                self.flush()
                self.lock.lock(); self.ready = true; self.lock.unlock()
              }
            }
          }
        }
      }
    }
    wait("WebRTC negotiation") { self.lock.lock(); defer { self.lock.unlock() }; return self.ready }
  }

  private func flush() {
    lock.lock()
    let a = pendingSend, b = pendingReceive; pendingSend = []; pendingReceive = []
    lock.unlock()
    for candidate in a { sending.add(candidate, completionHandler: { _ in }) }
    for candidate in b { receiving.add(candidate, completionHandler: { _ in }) }
  }

  private func wait(_ label: String, until condition: () -> Bool) {
    let deadline = Date().addingTimeInterval(15)
    while !condition() && Date() < deadline { _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02)) }
    precondition(condition(), "\(label) timed out")
  }

  func receive(_ pixels: CVPixelBuffer, firstLuma: Int) -> LKRTCVideoFrame {
    let width = CVPixelBufferGetWidth(pixels), height = CVPixelBufferGetHeight(pixels)
    lock.lock(); latest = nil; lock.unlock()
    source.adaptOutputFormat(toWidth: Int32(width), height: Int32(height), fps: 30)
    var result: LKRTCVideoFrame?
    wait("H264 peer decode \(width)x\(height)") {
      let frame = LKRTCVideoFrame(buffer: LKRTCCVPixelBuffer(pixelBuffer: pixels), rotation: ._0,
        timeStampNs: Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000))
      self.source.capturer(self.capturer, didCapture: frame)
      self.lock.lock(); defer { self.lock.unlock() }
      if let value = self.latest, value.width == width, value.height == height {
        let yuv = value.buffer.toI420()
        if abs(Int(yuv.dataY[height / 4 * Int(yuv.strideY) + width / 4]) - firstLuma) < 20 { result = value }
      }
      return result != nil
    }
    return result!
  }

  func close() { remoteTrack?.remove(self); remoteTrack = nil; sending.close(); receiving.close() }
  func setSize(_ size: CGSize) {}
  func renderFrame(_ frame: LKRTCVideoFrame?) { lock.lock(); latest = frame; lock.unlock() }
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd rtpReceiver: LKRTCRtpReceiver, streams: [LKRTCMediaStream]) {
    guard peerConnection === receiving, let track = rtpReceiver.track as? LKRTCVideoTrack else { return }
    remoteTrack = track; track.add(self)
  }
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didGenerate candidate: LKRTCIceCandidate) {
    let target = peerConnection === sending ? receiving! : sending!
    if target.remoteDescription != nil { target.add(candidate, completionHandler: { _ in }) }
    else {
      lock.lock()
      if target === sending { pendingSend.append(candidate) } else { pendingReceive.append(candidate) }
      lock.unlock()
    }
  }
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange stateChanged: LKRTCSignalingState) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didAdd stream: LKRTCMediaStream) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove stream: LKRTCMediaStream) {}
  func peerConnectionShouldNegotiate(_ peerConnection: LKRTCPeerConnection) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceConnectionState) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didChange newState: LKRTCIceGatheringState) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didRemove candidates: [LKRTCIceCandidate]) {}
  func peerConnection(_ peerConnection: LKRTCPeerConnection, didOpen dataChannel: LKRTCDataChannel) {}
}
#endif
