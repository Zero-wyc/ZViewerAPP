const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
module.exports = config => {
  config = withInfoPlist(config, value => { value.modResults.UIBackgroundModes = [...new Set([...(value.modResults.UIBackgroundModes || []), 'audio'])]; return value; });
  return withDangerousMod(config, ['ios', async value => {
    const root = path.dirname(require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] }));
    const patch = (relative, marker, edit) => { const file = path.join(root, 'ios', relative); const source = fs.readFileSync(file, 'utf8'); if (source.includes(marker)) return; const next = edit(source); if (next === source || !next.includes(marker)) throw new Error(`Review VLC system-media integration: ${relative}`); fs.writeFileSync(file, next); };
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
    return value;
  }]);
};
