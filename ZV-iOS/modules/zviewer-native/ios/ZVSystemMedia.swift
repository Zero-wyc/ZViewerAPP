import UIKit
import AVFoundation
import MediaPlayer

// Main-thread ownership, compare-and-clear and bounded artwork downloads protect
// the new room from cleanup and callbacks belonging to the previous session.
final class ZVSystemMedia {
  var command: (([String: Any]) -> Void)?
  private var state: [String: Any] = [:]
  private var targets: [(MPRemoteCommand, Any)] = []
  private var observer: NSObjectProtocol?
  private var audioObservers: [NSObjectProtocol] = []
  private var artworkTask: Task<Void, Never>?
  private var cover = ""
  private var pending: [[String: Any]] = []
  private var info: [String: Any] = [:]
  init() {
    observer = NotificationCenter.default.addObserver(forName: NSNotification.Name("ZViewerVlcProgress"), object: nil, queue: .main) { [weak self] note in
      guard let self, let data = note.userInfo, data["uri"] as? String == self.state["uri"] as? String else { return }
      if let position = data["position"] as? Double { self.state["position"] = position; self.info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position }
      if let playing = data["playing"] as? Bool { self.state["playing"] = playing; self.info[MPNowPlayingInfoPropertyPlaybackRate] = playing ? (self.state["playbackRate"] as? Double ?? 1) : 0 }
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.info
    }
    let audioSession = AVAudioSession.sharedInstance()
    let pauseForSystem = { [weak self] in
      guard let self, let uri = self.state["uri"] as? String, !uri.isEmpty else { return }
      if self.state["host"] as? Bool == true { _ = self.handle("pause") }
      else { NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcCommand"), object: nil, userInfo: ["uri": uri, "action": "pause"]) }
    }
    audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: audioSession, queue: .main) { note in
      if (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue == AVAudioSession.InterruptionType.began.rawValue { pauseForSystem() }
    })
    audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: audioSession, queue: .main) { note in
      if (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { pauseForSystem() }
    })
    let center = MPRemoteCommandCenter.shared()
    for (remote, action) in [(center.playCommand, "play"), (center.pauseCommand, "pause"), (center.stopCommand, "pause"), (center.nextTrackCommand, "next"), (center.previousTrackCommand, "prev")] {
      targets.append((remote, remote.addTarget { [weak self] _ in self?.handle(action) ?? .commandFailed }))
    }
    targets.append((center.togglePlayPauseCommand, center.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .commandFailed }; return self.handle(self.state["playing"] as? Bool == true ? "pause" : "play")
    }))
    targets.append((center.changePlaybackPositionCommand, center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let value = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }; return self?.handle("seek", value.positionTime) ?? .commandFailed
    }))
    for (remote, delta) in [(center.skipBackwardCommand, -15.0), (center.skipForwardCommand, 15.0)] {
      remote.preferredIntervals = [15]
      targets.append((remote, remote.addTarget { [weak self] _ in guard let self else { return .commandFailed }; return self.handle("seek", (self.state["position"] as? Double ?? 0) + delta) }))
    }
  }
  private func handle(_ action: String, _ value: Double? = nil) -> MPRemoteCommandHandlerStatus {
    if !Thread.isMainThread { return DispatchQueue.main.sync { self.handle(action, value) } }
    guard let sessionId = state["sessionId"] as? String, let mediaId = state["mediaId"] as? String,
      (state["actions"] as? [String] ?? []).contains(action) else { return .commandFailed }
    var event: [String: Any] = ["sessionId": sessionId, "mediaId": mediaId, "action": action]
    if let value { let duration = state["duration"] as? Double ?? 0; guard value.isFinite, duration > 0 else { return .commandFailed }; event["value"] = min(duration, max(0, value)) }
    // Host native commands work even while JS is suspended. Viewers always go
    // through the business approval path; a silent background video never owns it.
    if state["host"] as? Bool == true && ["play", "pause", "seek"].contains(action) {
      NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcCommand"), object: nil, userInfo: ["uri": state["uri"] ?? "", "action": action, "value": event["value"] ?? 0])
    }
    if UIApplication.shared.applicationState == .active { command?(event) }
    else { pending.append(event); if pending.count > 20 { pending.removeFirst() } }
    return .success
  }
  func update(_ json: String) {
    guard let data = json.data(using: .utf8), let next = try? JSONSerialization.jsonObject(with: data) as? [String: Any], next["sessionId"] is String else { return }
    if state["sessionId"] as? String != next["sessionId"] as? String || state["mediaId"] as? String != next["mediaId"] as? String { pending.removeAll(); info.removeAll(); cover = ""; artworkTask?.cancel() }
    state = next
    UserDefaults.standard.set(next["uri"] as? String ?? "", forKey: "ZViewerPlaybackUri")
    info[MPMediaItemPropertyTitle] = next["title"] ?? "ZViewer"
    info[MPMediaItemPropertyArtist] = next["artist"] ?? ""
    info[MPMediaItemPropertyAlbumTitle] = next["album"] ?? ""
    info[MPMediaItemPropertyPlaybackDuration] = next["duration"] ?? 0
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = next["position"] ?? 0
    info[MPNowPlayingInfoPropertyPlaybackRate] = next["playing"] as? Bool == true ? (next["playbackRate"] ?? 1) : 0
    info[MPNowPlayingInfoPropertyMediaType] = next["kind"] as? String == "audio" ? MPNowPlayingInfoMediaType.audio.rawValue : MPNowPlayingInfoMediaType.video.rawValue
    let actions = next["actions"] as? [String] ?? []
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.isEnabled = actions.contains("play"); center.pauseCommand.isEnabled = actions.contains("pause"); center.stopCommand.isEnabled = actions.contains("pause")
    center.togglePlayPauseCommand.isEnabled = actions.contains("play") && actions.contains("pause")
    center.nextTrackCommand.isEnabled = actions.contains("next"); center.previousTrackCommand.isEnabled = actions.contains("prev")
    let seek = actions.contains("seek") && (next["duration"] as? Double ?? 0) > 0
    center.changePlaybackPositionCommand.isEnabled = seek; center.skipForwardCommand.isEnabled = seek; center.skipBackwardCommand.isEnabled = seek
    let imageUrl = next["cover"] as? String ?? ""
    if cover != imageUrl {
      cover = imageUrl; artworkTask?.cancel(); info.removeValue(forKey: MPMediaItemPropertyArtwork)
      let id = next["sessionId"] as? String; let media = next["mediaId"] as? String
      if let url = URL(string: imageUrl), ["http", "https"].contains(url.scheme ?? ""), url.user == nil, url.password == nil {
        var request = URLRequest(url: url); request.timeoutInterval = 12; request.cachePolicy = .reloadIgnoringLocalCacheData
        artworkTask = Task { [weak self] in
          do {
            let (bytes, response) = try await URLSession.shared.bytes(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200, response.expectedContentLength <= 2_000_000 else { return }
            var data = Data()
            for try await byte in bytes {
              if data.count >= 2_000_000 || Task.isCancelled { return }
              data.append(byte)
            }
            guard !Task.isCancelled, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async { guard let self, self.state["sessionId"] as? String == id, self.state["mediaId"] as? String == media, self.cover == imageUrl else { return }; self.info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }; MPNowPlayingInfoCenter.default().nowPlayingInfo = self.info }
          } catch { /* Keep the placeholder when artwork is unavailable. */ }
        }
      }
    }
    if info[MPMediaItemPropertyArtwork] == nil, let image = UIImage(systemName: "music.note") { info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image } }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }
  func drain(_ id: String) -> [[String: Any]] {
    guard state["sessionId"] as? String == id else { return [] }
    let values = pending.map { event -> [String: Any] in var value = event; if event["action"] as? String == "seek" { value["value"] = state["position"] ?? event["value"] }; return value }; pending.removeAll(); return values
  }
  func clear(_ id: String) { guard state["sessionId"] as? String == id else { return }; artworkTask?.cancel(); cover = ""; pending.removeAll(); state.removeAll(); info.removeAll(); UserDefaults.standard.removeObject(forKey: "ZViewerPlaybackUri"); MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; for (target, _) in targets { target.isEnabled = false } }
  func shutdown() { if let id = state["sessionId"] as? String { clear(id) }; command = nil }
  deinit { audioObservers.forEach { NotificationCenter.default.removeObserver($0) }; artworkTask?.cancel(); if let observer { NotificationCenter.default.removeObserver(observer) }; for (target, token) in targets { target.removeTarget(token) } }
}
