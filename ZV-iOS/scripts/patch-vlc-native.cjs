const fs = require('node:fs');
const path = require('node:path');
const { patchVoiceAudio } = require('../plugins/with-voice-audio.cjs');
const { patchSystemMedia } = require('../plugins/with-system-media.cjs');
const { patchVlcTracks } = require('../plugins/with-vlc-tracks.cjs');

// EAS prebuild can reinstall node_modules after executing dangerous mods.
// Reapply the same patches after that step, then fail closed before compilation.
function verify(root) {
  const required = {
    'Managers/AudioSessionManager.swift': ['ZViewerVoiceActive'],
    'Managers/MediaPlayerManager.swift': ['ZViewerPlaybackUri'],
    'LibVlcPlayerView.swift': ['ZViewer queued playback intent', 'zviewerRemoteObserver'],
    'Records/Tracks.swift': ['var audio: Int? = nil', 'var video: Int? = nil', 'var subtitle: Int? = nil'],
    'Records/MediaTrack.swift': ['var selected: Bool = false'],
    'Player/MediaPlayer.swift': ['ZViewerVlcProgress', 'ZViewerExclusiveTracks', 'ZViewerDeferredSlaves',
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
}
function apply(root) {
  patchVoiceAudio(root);
  patchSystemMedia(root);
  patchVlcTracks(root);
  verify(root);
}
if (require.main === module) {
  const root = path.dirname(require.resolve('expo-libvlc-player/package.json'));
  if (process.argv.includes('--check')) verify(root); else apply(root);
  console.log('VLC native patches verified: deferred audio slaves, tracks, voice and background media');
}
module.exports = { apply, verify };
