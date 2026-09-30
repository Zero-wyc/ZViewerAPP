const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
module.exports = config => withDangerousMod(config, ['ios', async value => {
  const file = require.resolve('expo-libvlc-player/package.json', { paths: [value.modRequest.projectRoot] }).replace(/package\.json$/, 'ios/Managers/AudioSessionManager.swift');
  let source = fs.readFileSync(file, 'utf8');
  const needle = '    let audioSession = AVAudioSession.sharedInstance()';
  const marker = 'ZViewerVoiceActive';
  if (!source.includes(marker)) {
    if (!source.includes(needle)) throw new Error('Review VLC audio session integration after dependency update.');
    source = source.replace(needle, `${needle}\n    // The room voice engine owns the shared capture/playback session.\n    if UserDefaults.standard.bool(forKey: "${marker}") {\n      try? audioSession.setActive(true)\n      return\n    }`);
    fs.writeFileSync(file, source);
  }
  return value;
}]);
