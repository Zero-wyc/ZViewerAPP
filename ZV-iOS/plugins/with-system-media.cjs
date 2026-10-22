const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const { patchVlcSeek } = require('./vlc-seek.cjs');
const { patchMusicNative } = require('./music-native.cjs');
function patchSystemMedia(root) {
    const patch = (relative, marker, edit) => { const file = path.join(root, 'ios', relative); const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'); if (source.includes(marker)) return; const next = edit(source); if (next === source || !next.includes(marker)) throw new Error(`Review VLC system-media integration: ${relative}`); fs.writeFileSync(file, next); };
    // VLCKit 4 defaults to inline callbacks under libvlc's recursive player
    // lock. A synchronous hop from that callback to UIKit can deadlock with
    // the main thread waiting for the same lock. Configure every new player
    // to release the libvlc callback before running its delegate on main.
    patch('Player/MediaPlayer.swift', 'ZViewerAsyncVlcEvents', source => source
      .replace('    library = VLCLibrary()', `    // ZViewerAsyncVlcEvents: VLCKit 4.0.0-a24 legacy means async main, not an older playback engine.
    VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()
    library = VLCLibrary()`)
      .replace('    mediaPlayer?.stop()\n    mediaPlayer = nil', '    mediaPlayer?.delegate = nil\n    mediaPlayer?.stop()\n    mediaPlayer = nil'));
    patch('LibVlcPlayerView.swift', 'zviewerRemoteObserver', source => source
      .replace('  private var oldVolume:', '  private var zviewerRemoteObserver: NSObjectProtocol?\n  private var oldVolume:')
      .replace('    player = MediaPlayer(self)', `    player = MediaPlayer(self)
    zviewerRemoteObserver = NotificationCenter.default.addObserver(forName: NSNotification.Name("ZViewerVlcCommand"), object: nil, queue: .main) { [weak self] note in
      guard let self, let data = note.userInfo, let uri = data["uri"] as? String, !uri.isEmpty, uri == self.source else { return }
      switch data["action"] as? String {
        case "play": self.play()
        case "pause": self.pause()
        case "seek": if let value = data["value"] as? Double { self.seek(value * 1000, "time") }
        default: break
      }
    }`)
      .replace('  deinit {', '  deinit {\n    if let zviewerRemoteObserver { NotificationCenter.default.removeObserver(zviewerRemoteObserver) }'));
    patch('Player/MediaPlayer.swift', 'ZViewerVlcProgress', source => source
      .replace('    view.onTimeChanged(["value": player.time.intValue])', `    NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcProgress"), object: nil, userInfo: ["uri": view.source ?? "", "position": Double(player.time.intValue) / 1000, "playing": player.isPlaying])
    view.onTimeChanged(["value": player.time.intValue])`)
      .replace('    switch newState {', `    NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcProgress"), object: nil, userInfo: ["uri": view.source ?? "", "playing": player.isPlaying])
    switch newState {`));
    patch('Managers/MediaPlayerManager.swift', 'ZViewerPlaybackUri', source => source.replace('      if !view.pictureInPicture {', '      // Only the business media owner may continue ordinary background audio.\n      if view.source != UserDefaults.standard.string(forKey: "ZViewerPlaybackUri") && !view.pictureInPicture {'));
    patch('LibVlcPlayerModule.swift', 'Prop("backgroundAudio"', source => source.replace('      Prop("pictureInPicture", false)', `      Prop("backgroundAudio", false) { (view: LibVlcPlayerView, backgroundAudio: Bool) in
        view.backgroundAudio = backgroundAudio
      }

      Prop("pictureInPicture", false)`));
    patch('LibVlcPlayerView.swift', 'var backgroundAudio:', source => source.replace('  var pictureInPicture:', `  var backgroundAudio: Bool = false {
    didSet { if oldValue != backgroundAudio { player.shouldInit = true } }
  }

  var pictureInPicture:`));
    patch('Player/MediaPlayer.swift', 'ZViewerAudioOnly', source => source.replace('    var args = view.options', `    // ZViewerAudioOnly: music must not keep a hidden video/PiP output alive.
    var args = view.options
    if view.backgroundAudio { args.append(":no-video") }`));
    patch('Managers/MediaPlayerManager.swift', 'ZViewerBackgroundAudio', source => source
      .replace('  func onModuleBackground() {', `  func onModuleBackground() {
    // ZViewerBackgroundAudio: prepare synchronously before iOS suspends JS.
    audioSessionManager.prepareForBackgroundAudio()`)
      .replace('      if view.source !=', '      if !view.backgroundAudio && view.source !='));
    patch('Managers/AudioSessionManager.swift', 'func prepareForBackgroundAudio()', source => source.replace('  private func setAudioSession() {', `  func prepareForBackgroundAudio() {
    guard !UserDefaults.standard.bool(forKey: "ZViewerVoiceActive"),
      expoViews.allObjects.contains(where: { $0.backgroundAudio && $0.mediaPlayer?.isPlaying == true })
    else { return }
    // Preserve an already playing owner; never resume a paused item.
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    } catch { log.warn("ZViewer background audio session failed") }
  }

  private func setAudioSession() {`)
      .replace('    let audioMixingMode = findAudioMixingMode()', `    let audioMode: AVAudioSession.Mode = expoViews.allObjects.contains {
      $0.backgroundAudio && $0.mediaPlayer?.isPlaying == true
    } ? .default : .moviePlayback
    let audioMixingMode = findAudioMixingMode()`)
      .replace('audioSession.mode != .moviePlayback', 'audioSession.mode != audioMode')
      .replace('mode: .moviePlayback,', 'mode: audioMode,'));
    // Upgrade already patched checkouts too: the audible owner needs the
    // primary playback session for system Now Playing and remote commands.
    patch('Managers/AudioSessionManager.swift', 'ZViewerPrimaryAudio', source => source.replace(
      '      try session.setCategory(.playback, mode: .default, options:',
      '      // ZViewerPrimaryAudio: keep the music owner primary in background.\n      try session.setCategory(.playback, mode: .default, options:'
    ).replace('mode: .default, options: [.mixWithOthers])', 'mode: .default, options: [])'));
    patch('Managers/AudioSessionManager.swift', 'ZViewerOwnedMusicSession', source => source
      .replace('  private lazy var expoViews = MediaPlayerManager.shared.expoViews', `  private lazy var expoViews = MediaPlayerManager.shared.expoViews
  private var categoryObserver: NSObjectProtocol?

  init() {
    // Voice release can restore a mixable playback category without another
    // VLC state event. Reconcile it with the current owner, asynchronously.
    categoryObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: AVAudioSession.sharedInstance(), queue: nil) { [weak self] note in
      guard (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? NSNumber)?.uintValue == AVAudioSession.RouteChangeReason.categoryChange.rawValue else { return }
      self?.setAppropriateAudioSession()
    }
  }

  deinit { if let categoryObserver { NotificationCenter.default.removeObserver(categoryObserver) } }

  private func musicOwner(_ view: LibVlcPlayerView) -> Bool {
    // ZViewerOwnedMusicSession: a selected music input owns its session while
    // paused, buffering or replacing. Clearing/unmounting the input releases it.
    view.backgroundAudio && !(view.source ?? "").isEmpty
  }`)
      .replaceAll('$0.backgroundAudio && $0.mediaPlayer?.isPlaying == true', 'musicOwner($0)')
      .replace('// Preserve an already playing owner; never resume a paused item.', '// Preserve the selected owner; configuring a session never resumes it.')
      .replace('      playerRequiresCategory(view.mediaPlayer)', '      musicOwner(view) || playerRequiresCategory(view.mediaPlayer)')
      .replace('      view.mediaPlayer?.isPlaying == true', '      musicOwner(view) || view.mediaPlayer?.isPlaying == true'));
    patch('Managers/AudioSessionManager.swift', 'ZViewerOwnedMixPolicy', source => source.replace(`    // Preserve the selected owner; configuring a session never resumes it.
    let session = AVAudioSession.sharedInstance()
    do {
      // ZViewerPrimaryAudio: keep the music owner primary in background.
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
    } catch { log.warn("ZViewer background audio session failed") }`, `    // ZViewerPrimaryAudio / ZViewerOwnedMixPolicy: preserve the owner without
    // overriding an explicit mix choice or changing its paused/play intent.
    setAudioSession()`));
    patchMusicNative(root);
    patch('LibVlcPlayerView.swift', 'ZViewerProgressOwner', source => source
      .replace('  var zviewerRevision: Int = 0', `  // ZViewerProgressOwner: scope system metadata to one native input owner.
  var zviewerOwnerId: String = ""
  var zviewerBackgroundDecoration: Bool = false
  var zviewerRevision: Int = 0`)
      .replace('  func play() {\n', `  func play() {
    if zviewerBackgroundDecoration && UIApplication.shared.applicationState != .active { return }
`));
    patch('LibVlcPlayerModule.swift', 'Prop("zviewerOwnerId"', source => source.replace('      Prop("zviewerRevision", 0)', `      Prop("zviewerOwnerId", "") { (view: LibVlcPlayerView, owner: String) in view.zviewerOwnerId = owner }
      Prop("zviewerBackgroundDecoration", false) { (view: LibVlcPlayerView, decoration: Bool) in view.zviewerBackgroundDecoration = decoration }
      Prop("zviewerRevision", 0)`));
    patch('Player/MediaPlayer.swift', 'ZViewerTypedMediaProgress', source => source
      .replace('    NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcProgress"),', '    // ZViewerTypedMediaProgress: silent decoration must never own audio progress.\n    NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcProgress"),')
      .replaceAll('["uri": view.source ?? "",', '["uri": view.source ?? "", "ownerId": view.zviewerOwnerId, "revision": view.zviewerRevision, "ready": !firstPlay, "backgroundAudio": view.backgroundAudio,')
      .replace('"stopped": newState == .stopped, "backgroundAudio": view.backgroundAudio]', '"stopped": newState == .stopped]'));
    patch('Player/MediaPlayer.swift', 'ZViewerFrozenMediaProgress', source => source
      .replace('  private var firstPlay: Bool = true', `  private var firstPlay: Bool = true
  // ZViewerFrozenMediaProgress: React props can change before the native input.
  private var zviewerProgressInput: [String: Any] = [:]`)
      .replace('    mediaPlayer!.delegate = self', `    mediaPlayer!.delegate = self
    zviewerProgressInput = ["uri": view.source ?? "", "ownerId": view.zviewerOwnerId, "revision": view.zviewerRevision, "backgroundAudio": view.backgroundAudio]`)
      .replace('["uri": view.source ?? "", "ownerId": view.zviewerOwnerId, "revision": view.zviewerRevision, "ready": !firstPlay, "backgroundAudio": view.backgroundAudio, "playing": player.isPlaying, "stopped": newState == .stopped]', 'zviewerProgressInput.merging(["ready": !firstPlay, "playing": player.isPlaying, "stopped": newState == .stopped]) { _, new in new }')
      .replace('  func mediaPlayerTimeChanged(_: Notification) {\n    guard let player = mediaPlayer else { return }', `  func mediaPlayerTimeChanged(_ notification: Notification) {
    guard let player = mediaPlayer else { return }
    if let origin = notification.object as? VLCMediaPlayer, origin !== player { return }`)
      .replace('["uri": view.source ?? "", "ownerId": view.zviewerOwnerId, "revision": view.zviewerRevision, "ready": !firstPlay, "backgroundAudio": view.backgroundAudio, "position": Double(player.time.intValue) / 1000, "playing": player.isPlaying]', 'zviewerProgressInput.merging(["ready": !firstPlay && player.state == .playing, "position": Double(player.time.intValue) / 1000, "playing": player.isPlaying]) { _, new in new }'));
    patch('Managers/MediaPlayerManager.swift', 'ZViewerDecorationBackground', source => source.replace('      if !view.backgroundAudio && view.source != UserDefaults.standard.string(forKey: "ZViewerPlaybackUri") && !view.pictureInPicture {', `      // ZViewerDecorationBackground: same URI does not confer audio ownership.
      if view.zviewerBackgroundDecoration || (!view.backgroundAudio && view.source != UserDefaults.standard.string(forKey: "ZViewerPlaybackUri") && !view.pictureInPicture) {`));
    patchVlcSeek(root);
}
module.exports = config => {
  config = withInfoPlist(config, value => { value.modResults.UIBackgroundModes = [...new Set([...(value.modResults.UIBackgroundModes || []), 'audio'])]; return value; });
  return withDangerousMod(config, ['ios', async value => {
    const root = path.dirname(require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] }));
    patchSystemMedia(root);
    return value;
  }]);
};

module.exports.patchSystemMedia = patchSystemMedia;
