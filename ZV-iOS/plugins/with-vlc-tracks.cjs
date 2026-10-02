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
}
module.exports = config => withDangerousMod(config, ['ios', async value => {
  patchVlcTracks(path.dirname(require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] })));
  return value;
}]);
module.exports.patchVlcTracks = patchVlcTracks;
