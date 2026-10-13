const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
function patchVoiceAudio(root) {
  const file = require('node:path').join(root, 'ios/Managers/AudioSessionManager.swift');
  let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const needle = '    let audioSession = AVAudioSession.sharedInstance()';
  const marker = 'ZViewerVoiceActive';
  if (!source.includes(marker)) {
    if (!source.includes(needle)) throw new Error('Review VLC audio session integration after dependency update.');
    source = source.replace(needle, `${needle}\n    // The room voice engine owns the shared capture/playback session.\n    if UserDefaults.standard.bool(forKey: "${marker}") {\n      try? audioSession.setActive(true)\n      return\n    }`);
    fs.writeFileSync(file, source);
  }
  const viewFile = require('node:path').join(root, 'ios/LibVlcPlayerView.swift');
  let viewSource = fs.readFileSync(viewFile, 'utf8').replace(/\r\n/g, '\n');
  if (!viewSource.includes('ZViewer queued playback intent')) {
    const play = '  func play() {\n'; const pause = '  func pause() {\n';
    if (!viewSource.includes(play) || !viewSource.includes(pause)) throw new Error('Review VLC playback initialization after dependency update.');
    // JS may send play before the asynchronous source creates mediaPlayer.
    // initPlayer already reads autoplay; preserve that command until then.
    viewSource = viewSource.replace(play, `${play}    // ZViewer queued playback intent\n    autoplay = true\n`).replace(pause, `${pause}    autoplay = false\n`);
    fs.writeFileSync(viewFile, viewSource);
  }
}
module.exports = config => withDangerousMod(config, ['ios', async value => {
  patchVoiceAudio(require('node:path').dirname(require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] })));
  return value;
}]);
module.exports.patchVoiceAudio = patchVoiceAudio;
