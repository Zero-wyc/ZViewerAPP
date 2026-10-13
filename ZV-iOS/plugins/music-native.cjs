const fs = require('node:fs');
const path = require('node:path');
function patchMusicNative(root) {
  const patch = (relative, marker, edit) => {
    const file = path.join(root, 'ios', relative), source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (source.includes(marker)) return;
    const next = edit(source);
    if (next === source || !next.includes(marker)) throw new Error(`Review native music replacement: ${relative}`);
    fs.writeFileSync(file, next);
  };
  patch('LibVlcPlayerView.swift', 'ZViewerPersistentMusic', source => source.replace('  var source: String?', `  // ZViewerPersistentMusic: keep the mounted audio view across track changes.
  var zviewerRevision: Int = 0
  var zviewerManaged: Bool = false
  func replaceSource(_ uri: String, _ args: [String], _ revision: Int) {
    guard backgroundAudio, revision >= zviewerRevision else { return }
    zviewerManaged = true
    if UIApplication.shared.applicationState != .active {
      NotificationCenter.default.post(name: NSNotification.Name("ZViewerVlcProgress"), object: nil, userInfo: ["uri": source ?? "", "playing": false, "stopped": true, "backgroundAudio": true])
    }
    zviewerRevision = revision
    autoplay = false
    time = 0
    _slaves.removeAll()
    tracks = nil
    options = args
    source = uri
    player.initPlayer()
    // A fresh input needs a playback audio session even if the prior one ended.
    MediaPlayerManager.shared.audioSessionManager.setAppropriateAudioSession()
  }

  var source: String?`));
  patch('LibVlcPlayerModule.swift', 'ZViewerMusicReplace', source => source
    .replace('        view.source = source', '        if !view.zviewerManaged { view.source = source }')
    .replace('        view.options = options', '        if !view.zviewerManaged { view.options = options }')
    .replace('        view.time = time', '        if !view.zviewerManaged { view.time = time }')
    .replace('        view.autoplay = autoplay', '        if !view.zviewerManaged { view.autoplay = autoplay }')
    .replace('        view.initPlayer()', '        if !view.zviewerManaged { view.initPlayer() }')
    .replace('      AsyncFunction("play")', `      // ZViewerMusicReplace: imperative native work bypasses background UI commits.
      Prop("zviewerRevision", 0) { (view: LibVlcPlayerView, revision: Int) in
        if !view.zviewerManaged { view.zviewerRevision = revision }
      }
      AsyncFunction("replaceSource") { (view: LibVlcPlayerView, uri: String, options: [String], revision: Int) in
        view.replaceSource(uri, options, revision)
      }

      AsyncFunction("play")`));
  patch('Records/MediaInfo.swift', 'var revision:', source => source.replace('struct MediaInfo: Record {', 'struct MediaInfo: Record {\n  @Field\n  var revision: Int = 0\n'));
  patch('LibVlcPlayerModule.swift', 'ZViewerMusicInitialOwner', source => source.replace('        if !view.zviewerManaged { view.initPlayer() }', `        // ZViewerMusicInitialOwner: after initial mount only commands replace audio.
        if !view.zviewerManaged {
          view.initPlayer()
          if view.backgroundAudio { view.zviewerManaged = true }
        }`));
  patch('Player/MediaPlayer.swift', 'ZViewerMusicRevision', source => source
    .replace('    return MediaInfo(', '    // ZViewerMusicRevision: old callbacks cannot advance a new track.\n    return MediaInfo(\n      revision: view.zviewerRevision,')
    .replace('view.onPlaying()', 'view.onPlaying(["revision": view.zviewerRevision])')
    .replace('view.onPaused()', 'view.onPaused(["revision": view.zviewerRevision])')
    .replace('view.onStopped()', 'view.onStopped(["revision": view.zviewerRevision])')
    .replace('view.onTimeChanged(["value": player.time.intValue])', 'view.onTimeChanged(["value": player.time.intValue, "revision": view.zviewerRevision])')
    .replace('"playing": player.isPlaying])\n    switch newState', '"playing": player.isPlaying, "stopped": newState == .stopped, "backgroundAudio": view.backgroundAudio])\n    switch newState')
    .replace('    let deadline = DispatchTime.now()', '    let revision = view.zviewerRevision\n    let deadline = DispatchTime.now()')
    .replace('      self?.retryUntil(', '      guard let self, self.view.zviewerRevision == revision else { return }\n      self.retryUntil('));
}
module.exports = { patchMusicNative };
