import Foundation

// Audio and its optional muted background video can use the very same URI.
// Only the selected native audio owner/revision may update music metadata.
struct ZVSystemMediaInputGate {
  private var key = ""
  private var previousPosition: Double?
  private var previousAt: TimeInterval = 0

  func accepts(_ event: [String: Any], state: [String: Any]) -> Bool {
    guard let uri = event["uri"] as? String, !uri.isEmpty, uri == state["uri"] as? String else { return false }
    guard state["kind"] as? String == "audio" else { return true }
    guard event["backgroundAudio"] as? Bool == true,
      let owner = state["ownerId"] as? String, !owner.isEmpty, event["ownerId"] as? String == owner,
      let revision = state["inputRevision"] as? NSNumber, revision.intValue > 0,
      (event["revision"] as? NSNumber)?.intValue == revision.intValue else { return false }
    return true
  }

  mutating func advancedReadyAudio(_ event: [String: Any], state: [String: Any], now: TimeInterval = Date().timeIntervalSince1970) -> Bool {
    guard accepts(event, state: state), state["kind"] as? String == "audio",
      event["ready"] as? Bool == true, event["playing"] as? Bool == true,
      let position = (event["position"] as? NSNumber)?.doubleValue, position.isFinite, position >= 0 else { return false }
    let next = "\(state["ownerId"] ?? ""):\(state["inputRevision"] ?? 0):\(state["uri"] ?? "")"
    if next != key { key = next; previousPosition = nil }
    defer { previousPosition = position; previousAt = now }
    guard let previousPosition, now > previousAt else { return false }
    let delta = position - previousPosition
    let rate = max(0.1, (state["playbackRate"] as? NSNumber)?.doubleValue ?? 1)
    // A seek/jump is not proof that the new input's playback clock is running.
    return delta > 0.02 && delta <= max(1, (now - previousAt) * rate + 0.5)
  }

  mutating func reset() { key = ""; previousPosition = nil; previousAt = 0 }
}
