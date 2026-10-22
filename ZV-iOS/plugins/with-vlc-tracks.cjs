const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

// Keep this patch in prebuild so npm ci and EAS reproduce the same VLC fixes.
function patchVlcTracks(root) {
  const patch = (relative, marker, edit) => {
    const file = path.join(root, 'ios', relative);
    const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (source.includes(marker)) return;
    const next = edit(source);
    if (next === source || !next.includes(marker)) throw new Error(`Review VLC track integration: ${relative}`);
    fs.writeFileSync(file, next);
  };
  patch('Records/Tracks.swift', 'ZViewerOptionalTracks', source => source
    .replace('struct Tracks: Record {', 'struct Tracks: Record {\n  // ZViewerOptionalTracks: an omitted field must not select track zero.')
    .replace(/var (audio|video|subtitle): Int = 0/g, 'var $1: Int? = nil'));
  patch('Records/MediaTrack.swift', 'ZViewerTrackSelection', source => source
    .replace('  var name: String = ""', '  var name: String = ""\n\n  // ZViewerTrackSelection\n  @Field\n  var selected: Bool = false'));
  patch('Player/MediaPlayer.swift', 'ZViewerExclusiveTracks', source => source
    .replace('      mediaPlayer?.addPlaybackSlave(url, type: slaveType, enforce: selected)', '      if selected && type == "subtitle" { mediaPlayer?.deselectAllTextTracks() }\n      mediaPlayer?.addPlaybackSlave(url, type: slaveType, enforce: selected)')
    .replace('        player.selectTrack(at: index, type: type)', `        // ZViewerExclusiveTracks: VLC 4 can select several subtitle tracks.
        // Drop the previous selection before selecting the requested track.
        switch type {
        case .audio: player.deselectAllAudioTracks()
        case .video: player.deselectAllVideoTracks()
        case .text: player.deselectAllTextTracks()
        default: break
        }
        player.selectTrack(at: index, type: type)`)
    .replace('name: audio.trackName', 'name: audio.trackName, selected: audio.isSelected')
    .replace('name: video.trackName', 'name: video.trackName, selected: video.isSelected')
    .replace('name: subtitle.trackName', 'name: subtitle.trackName, selected: subtitle.isSelected')
    .replace('let disableTrack = MediaTrack(id: -1, name: "Disable")', `let audioDisabled = MediaTrack(id: -1, name: "关闭音轨", selected: !player.audioTracks.contains { $0.isSelected })
    let videoDisabled = MediaTrack(id: -1, name: "关闭视频", selected: !player.videoTracks.contains { $0.isSelected })
    let subtitleDisabled = MediaTrack(id: -1, name: "关闭字幕", selected: !player.textTracks.contains { $0.isSelected })`)
    .replace('let audio = [disableTrack]', 'let audio = [audioDisabled]')
    .replace('let video = [disableTrack]', 'let video = [videoDisabled]')
    .replace('let subtitle = [disableTrack]', 'let subtitle = [subtitleDisabled]')
    .replace('          setPlayerDelays()', '          setPlayerDelays()\n          view.onESAdded(getMediaTracks())')
    .replace('    view.onTimeChanged(["value": player.time.intValue])', '    view.onESAdded(getMediaTracks())\n    view.onTimeChanged(["value": player.time.intValue])'));
  patch('Player/MediaPlayer.swift', 'ZViewerDeferredSlaves', source => {
    const early = '    addPlayerSlaves(view.slaves)';
    const add = '      mediaPlayer?.addPlaybackSlave(url, type: slaveType, enforce: selected)';
    if (source.split(early).length !== 2 || source.split(add).length !== 2) throw new Error('Review VLC slave initialization order');
    return source
      .replace('  private var firstPlay: Bool = true', '  private var firstPlay: Bool = true\n  // ZViewerDeferredSlaves: libvlc rejects add_slave before a playing input exists.\n  private var zviewerAddedSlaves = Set<String>()')
      .replace(early + '\n', '')
      .replace('    mediaPlayer!.delegate = self', '    mediaPlayer!.delegate = self\n    zviewerAddedSlaves.removeAll()')
      .replace('  func addPlayerSlaves(_ slaves: [Slave]) {', '  func addPlayerSlaves(_ slaves: [Slave]) {\n    guard mediaPlayer?.isPlaying == true else { return }')
      .replace('      let selected = slave.selected ?? false', '      let selected = slave.selected ?? false\n      let key = type + "|" + source\n      if zviewerAddedSlaves.contains(key) { continue }')
      .replace(add, '      if mediaPlayer?.addPlaybackSlave(url, type: slaveType, enforce: selected) == 0 {\n        zviewerAddedSlaves.insert(key)\n      }')
      .replace('      if newState == .playing {', '      if newState == .playing {\n        addPlayerSlaves(view.slaves)')
      .replace('    view.onTimeChanged(["value": player.time.intValue])', '    addPlayerSlaves(view.slaves)\n    view.onTimeChanged(["value": player.time.intValue])');
  });
  patch('Player/MediaPlayer.swift', 'ZViewerDecodedVideoSize', source => source.replace(
    '    view.onTimeChanged(["value": player.time.intValue, "revision": view.zviewerRevision])',
    '    // ZViewerDecodedVideoSize: report the selected decoded track, including late/changed dimensions.\n    let zviewerVideo = getVideo()\n    view.onTimeChanged(["value": player.time.intValue, "revision": view.zviewerRevision, "width": zviewerVideo.width, "height": zviewerVideo.height])'));

  patch('Player/MediaPlayer.swift', 'ZViewerAdaptiveLength', source => source
    .replace('  var shouldInit: Bool = true', '  var shouldInit: Bool = true\n  // ZViewerAdaptiveLength: adaptive manifests discover duration after first play.\n  private var zviewerMediaLength: Int64 = 0')
    .replace('    mediaPlayer!.delegate = self', '    mediaPlayer!.delegate = self\n    zviewerMediaLength = 0')
    .replace('let length = Int(mediaPlayer?.media?.length.intValue ?? 0)', 'let length = getLength()')
    .replace('    Int(mediaPlayer?.media?.length.intValue ?? 0)', '    max(Int(zviewerMediaLength), Int(mediaPlayer?.media?.length.intValue ?? 0))')
    .replace('  func mediaPlayerLengthChanged(_: Int64) {', '  func mediaPlayerLengthChanged(_ length: Int64) {\n    zviewerMediaLength = max(0, length)\n    if let player = mediaPlayer { view.onTimeChanged(["value": player.time.intValue, "revision": view.zviewerRevision, "length": zviewerMediaLength]) }')
    .replace('"width": zviewerVideo.width, "height": zviewerVideo.height]', '"width": zviewerVideo.width, "height": zviewerVideo.height, "length": getLength()]'));

  patch('Player/MediaPlayer.swift', 'ZViewerPausedMediaReady', source => source.replace(
    '        if firstPlay {',
    '      }\n      // ZViewerPausedMediaReady: :start-paused inputs also finish preparing.\n      // JS must be able to seek and confirm a reload without resuming playback.\n      if newState == .playing || newState == .paused {\n        if firstPlay {'));

  patch('Player/MediaPlayer.swift', 'ZViewerPausedDiagnostics', source => source
    .replace('    mediaPlayer!.play()', '    mediaPlayer!.play()\n    #if DEBUG\n    // ZViewerPausedDiagnostics: never include media addresses or options.\n    NSLog("[ZViewerVLC] init revision=%ld autoplay=%d state=%ld", view.zviewerRevision, view.autoplay ? 1 : 0, mediaPlayer!.state.rawValue)\n    #endif')
    .replace('    switch newState {', '    #if DEBUG\n    NSLog("[ZViewerVLC] state revision=%ld raw=%ld first=%d length=%ld autoplay=%d", view.zviewerRevision, newState.rawValue, firstPlay ? 1 : 0, getLength(), view.autoplay ? 1 : 0)\n    #endif\n    switch newState {')
    .replace('              view.onFirstPlay(getMediaInfo())', '              #if DEBUG\n              NSLog("[ZViewerVLC] ready revision=%ld length=%ld autoplay=%d", view.zviewerRevision, getLength(), view.autoplay ? 1 : 0)\n              #endif\n              view.onFirstPlay(getMediaInfo())')
    .replace('    zviewerMediaLength = max(0, length)', '    zviewerMediaLength = max(0, length)\n    #if DEBUG\n    NSLog("[ZViewerVLC] length revision=%ld milliseconds=%lld", view.zviewerRevision, length)\n    #endif'));

}
module.exports = config => withDangerousMod(config, ['ios', async value => {
  patchVlcTracks(path.dirname(require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] })));
  return value;
}]);
module.exports.patchVlcTracks = patchVlcTracks;
