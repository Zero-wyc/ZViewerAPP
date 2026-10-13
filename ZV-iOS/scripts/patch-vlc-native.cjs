const fs = require('node:fs');
const path = require('node:path');
const { patchVoiceAudio } = require('../plugins/with-voice-audio.cjs');
const { patchSystemMedia } = require('../plugins/with-system-media.cjs');
const { patchVlcTracks } = require('../plugins/with-vlc-tracks.cjs');

// EAS prebuild can reinstall node_modules after executing dangerous mods.
// Reapply the same patches after that step, then fail closed before compilation.
function verify(root) {
  const required = {
    'Managers/AudioSessionManager.swift': ['ZViewerVoiceActive', 'func prepareForBackgroundAudio()', 'mode: audioMode,', 'ZViewer background audio session failed'],
    'Managers/MediaPlayerManager.swift': ['ZViewerPlaybackUri', 'audioSessionManager.prepareForBackgroundAudio()', 'if !view.backgroundAudio && view.source !='],
    'LibVlcPlayerModule.swift': ['Prop("backgroundAudio", false)', 'view.backgroundAudio = backgroundAudio', 'ZViewerMusicReplace', 'ZViewerMusicInitialOwner'],
    'LibVlcPlayerView.swift': ['ZViewer queued playback intent', 'zviewerRemoteObserver', 'var backgroundAudio: Bool = false', 'ZViewerPersistentMusic'],
    'Records/Tracks.swift': ['var audio: Int? = nil', 'var video: Int? = nil', 'var subtitle: Int? = nil'],
    'Records/MediaTrack.swift': ['var selected: Bool = false'],
    'Records/MediaInfo.swift': ['var revision: Int = 0'],
    'Player/MediaPlayer.swift': ['ZViewerAsyncVlcEvents', 'VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()',
      'mediaPlayer?.delegate = nil\n    mediaPlayer?.stop()',
      'ZViewerVlcProgress', 'ZViewerExclusiveTracks', 'ZViewerDeferredSlaves', 'ZViewerMusicRevision', 'if view.backgroundAudio { args.append(":no-video") }',
      'guard mediaPlayer?.isPlaying == true else { return }', 'zviewerAddedSlaves.removeAll()',
      'if mediaPlayer?.addPlaybackSlave(url, type: slaveType, enforce: selected) == 0',
      'if newState == .playing {\n        addPlayerSlaves(view.slaves)'],
  };
  for (const [file, needles] of Object.entries(required)) {
    const source = fs.readFileSync(path.join(root, 'ios', file), 'utf8').replace(/\r\n/g, '\n');
    for (const needle of needles) {
      if (!source.includes(needle)) throw new Error(`VLC native patch missing: ${file}: ${needle}`);
    }
  }
  const player = fs.readFileSync(path.join(root, 'ios/Player/MediaPlayer.swift'), 'utf8');
  if (player.indexOf('VLCLibrary.sharedEventsConfiguration = VLCEventsLegacyConfiguration()') > player.indexOf('mediaPlayer = VLCMediaPlayer(library: library!)')) {
    throw new Error('VLC event configuration must precede player construction');
  }
}
function apply(root) {
  patchVoiceAudio(root);
  patchSystemMedia(root);
  patchVlcTracks(root);
  verify(root);
}
function verifySystemMedia(projectRoot) {
  const source = fs.readFileSync(path.join(projectRoot, 'modules/zviewer-native/ios/ZVSystemMedia.swift'), 'utf8');
  if (!source.includes('NSNotification.Name("ZViewerVlcProgress"), object: nil, queue: nil)') ||
      !source.includes('DispatchQueue.main.async { [weak self] in') || source.includes('queue: .main')) {
    throw new Error('System media notifications must not synchronously wait for the main queue');
  }
}
if (require.main === module) {
  const root = path.dirname(require.resolve('expo-libvlc-player/package.json'));
  if (process.argv.includes('--check')) verify(root); else apply(root);
  verifySystemMedia(path.join(__dirname, '..'));
  console.log('VLC native patches verified: async events, deferred audio slaves, tracks, voice and background media');
}
module.exports = { apply, verify, verifySystemMedia };
