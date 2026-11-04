import ReplayKit
import ImageIO
import ZViewerScreenShare

final class SampleHandler: RPBroadcastSampleHandler {
  private var sender: ZVShareSender?

  override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
    guard let options = ZVShareStore.read("session"),
      let expires = options["expires"] as? Double, expires > Date().timeIntervalSince1970,
      let id = options["id"] as? String, ZVShareStore.token(id) != nil else {
      finishBroadcastWithError(ZVShareStore.failure("请先返回 ZViewer 房间点击开始共享"))
      return
    }
    do {
      let sender = try ZVShareSender(options: options)
      self.sender = sender
      sender.finished = { [weak self] message in
        self?.finishBroadcastWithError(ZVShareStore.failure(message ?? "已停止共享"))
      }
      sender.start()
    } catch { finishBroadcastWithError(error) }
  }

  override func broadcastPaused() { sender?.pause(true) }
  override func broadcastResumed() { sender?.pause(false) }
  override func broadcastFinished() { sender?.finished = nil; sender?.stop(); sender = nil }

  override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
    switch sampleBufferType {
    case .video:
      let orientation = (CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString, attachmentModeOut: nil) as? NSNumber)?.uint32Value ?? 1
      let rotation: Int
      switch CGImagePropertyOrientation(rawValue: orientation) {
      case .right, .rightMirrored: rotation = 90
      case .down, .downMirrored: rotation = 180
      case .left, .leftMirrored: rotation = 270
      default: rotation = 0
      }
      sender?.videoSample(sampleBuffer, rotation: rotation)
    case .audioApp: sender?.audioSample(sampleBuffer)
    // The initial sender deliberately does not capture a second microphone
    // alongside room voice, or bypass the room's microphone permissions.
    case .audioMic: break
    @unknown default: break
    }
  }
}
