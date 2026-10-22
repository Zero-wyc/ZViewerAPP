import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const run = promisify(execFile);

test('actual Swift audio session policy preserves selected music, explicit mixing and voice ownership', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'zv-music-audio-policy-'));
  try {
    const manager = readFileSync(new URL('../node_modules/expo-libvlc-player/ios/Managers/AudioSessionManager.swift', import.meta.url), 'utf8').replace(/^import (AVFoundation|ExpoModulesCore|VLCKit)\n/gm, '');
    const source = `import Foundation
final class UserDefaults {
  static let standard = UserDefaults()
  var voice = false
  func bool(forKey: String) -> Bool { voice }
}
let AVAudioSessionRouteChangeReasonKey = "reason"
final class AVAudioSession: NSObject {
  enum Category { case playback, playAndRecord }
  enum Mode { case \`default\`, moviePlayback, voiceChat }
  enum RouteChangeReason: UInt { case categoryChange = 3 }
  struct CategoryOptions: OptionSet { let rawValue: UInt; static let mixWithOthers = Self(rawValue: 1); static let duckOthers = Self(rawValue: 2) }
  static let routeChangeNotification = Notification.Name("testCategoryChange")
  static let shared = AVAudioSession()
  static func sharedInstance() -> AVAudioSession { shared }
  var category = Category.playback
  var mode = Mode.moviePlayback
  var categoryOptions: CategoryOptions = [.mixWithOthers]
  var activations = 0
  func setCategory(_ next: Category, mode nextMode: Mode, options nextOptions: CategoryOptions) throws {
    let changed = category != next || mode != nextMode || categoryOptions != nextOptions
    category = next; mode = nextMode; categoryOptions = nextOptions
    if changed { NotificationCenter.default.post(name: Self.routeChangeNotification, object: self, userInfo: [AVAudioSessionRouteChangeReasonKey: NSNumber(value: RouteChangeReason.categoryChange.rawValue)]) }
  }
  func setActive(_ value: Bool) throws { if value { activations += 1 } }
}
enum AudioMixingMode { case auto, mixWithOthers, duckOthers, doNotMix
  func priority() -> Int { switch self { case .auto: return 0; case .mixWithOthers: return 1; case .duckOthers: return 2; case .doNotMix: return 3 } }
}
final class VLCAudio { var volume = 100 }
final class VLCMediaPlayer { var isPlaying = false; var audio: VLCAudio? = VLCAudio() }
final class LibVlcPlayerView: NSObject {
  var backgroundAudio = true
  var source: String? = "https://fixture.invalid/song"
  var autoplay = true
  var mediaPlayer: VLCMediaPlayer? = VLCMediaPlayer()
  var audioMixingMode = AudioMixingMode.doNotMix
}
enum MediaPlayerConstants { static let minPlayerVolume = 0 }
final class MediaPlayerManager { static let shared = MediaPlayerManager(); let expoViews = NSHashTable<LibVlcPlayerView>.weakObjects() }
enum log { static func warn(_ message: String) { fatalError(message) } }
${manager}
extension AudioSessionManager {
  func settle() { for _ in 0..<4 { Self.managerQueue.sync {} } }
}
@main enum Cases {
  static func main() throws {
    let manager = AudioSessionManager(), audio = AVAudioSession.shared
    let view = LibVlcPlayerView()
    MediaPlayerManager.shared.expoViews.add(view)
    func reconcile() { manager.setAppropriateAudioSession(); manager.settle() }
    func primary(_ label: String) { precondition(audio.category == .playback && audio.mode == .default && !audio.categoryOptions.contains(.mixWithOthers), label) }
    // Opening / buffering, before a native isPlaying event.
    reconcile(); primary("opening music must remain primary")
    precondition(view.mediaPlayer?.isPlaying == false && view.autoplay)
    // Explicit pause preserves metadata ownership without issuing play.
    view.autoplay = false; reconcile(); primary("paused selection retains session")
    precondition(view.mediaPlayer?.isPlaying == false && !view.autoplay)
    // A new input temporarily has no decoded player; its owner is unchanged.
    view.source = "https://fixture.invalid/next"; view.mediaPlayer = nil; reconcile(); primary("replacing music retains session")
    // Muting a selected input is not relinquishing media ownership.
    view.mediaPlayer = VLCMediaPlayer(); view.mediaPlayer?.audio?.volume = 0; reconcile(); primary("muted music retains session")
    // Explicit mixing remains explicit, including the synchronous Home hook.
    view.audioMixingMode = .mixWithOthers; reconcile()
    precondition(audio.mode == .default && audio.categoryOptions.contains(.mixWithOthers))
    manager.prepareForBackgroundAudio(); manager.settle()
    precondition(audio.categoryOptions.contains(.mixWithOthers), "Home must honor explicit mixing")
    view.audioMixingMode = .doNotMix
    // Voice owns category and mode even while a paused music input is mounted.
    UserDefaults.standard.voice = true
    try audio.setCategory(.playAndRecord, mode: .voiceChat, options: [.mixWithOthers])
    reconcile(); manager.prepareForBackgroundAudio(); manager.settle()
    precondition(audio.category == .playAndRecord && audio.mode == .voiceChat && audio.categoryOptions.contains(.mixWithOthers), "voice priority")
    // Voice release re-evaluates the music owner without a new VLC callback.
    UserDefaults.standard.voice = false
    try audio.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    manager.settle(); primary("voice release restores selected music")
    precondition(!view.autoplay && view.mediaPlayer?.isPlaying == false)
    // Explicit clear releases ownership and restores the original idle policy.
    view.source = nil; reconcile()
    precondition(audio.mode == .moviePlayback && audio.categoryOptions.contains(.mixWithOthers), "clear releases music")
    // Normal foreground video still uses its own mode and explicit mix policy.
    view.backgroundAudio = false; view.source = "https://fixture.invalid/video"
    view.mediaPlayer?.isPlaying = true; view.mediaPlayer?.audio?.volume = 100; reconcile()
    precondition(audio.mode == .moviePlayback && !audio.categoryOptions.contains(.mixWithOthers), "video policy retained")
    withExtendedLifetime(view) {}
    print("9 audio ownership scenarios passed")
  }
}
`;
    const file = join(directory, 'main.swift'), binary = join(directory, 'policy');
    writeFileSync(file, source);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    const result = await run(binary);
    assert.match(result.stdout, /9 audio ownership scenarios passed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
