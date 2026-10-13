const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
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
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
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
    patchMusicNative(root);
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
