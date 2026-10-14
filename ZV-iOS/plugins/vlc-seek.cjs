const fs = require('node:fs');
const path = require('node:path');

function patchVlcSeek(root) {
  const file = path.join(root, 'ios/LibVlcPlayerView.swift');
  let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (!source.includes('ZViewerSeekCompletion')) {
  source = source.replace('  private var oldVolume:', `  // ZViewerSeekCompletion: resume only after VLCKit finishes the discontinuity.
  private var zviewerSeekSequence = 0
  private var zviewerSeeking = false
  private var oldVolume:`);
  source = source.replace(/  func play\(\) \{[\s\S]*?\n  func pause\(\)/, `  func play() {
    // ZViewer queued playback intent
    autoplay = true
    if !zviewerSeeking { mediaPlayer?.play() }
  }

  func pause()`);
  source = source.replace(/  func seek\(_ value: Double, _ type: String\? = "time"\) \{[\s\S]*?\n  func record\(/, `  func seek(_ value: Double, _ type: String? = "time") {
    guard value.isFinite, let input = mediaPlayer else { return }
    let length = Double(input.media?.length.intValue ?? 0)
    let milliseconds = type == "position" ? value * length : value
    let target = Int32(min(Double(Int32.max), max(0, milliseconds.rounded())))
    let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
    zviewerSeekSequence += 1
    let sequence = zviewerSeekSequence
    zviewerSeeking = true
    let finish = { [weak self, weak input] in
      guard let self, let input, self.mediaPlayer === input, self.zviewerSeekSequence == sequence else { return }
      self.zviewerSeeking = false
      if self.autoplay { input.play() } else { input.pause() }
    }
    if !input.jump(withOffset: offset, completion: finish) { finish() }
    // Some paused/unseekable inputs never send completion. A later explicit
    // pause and a replacement input must still win over this bounded fallback.
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
      guard self?.zviewerSeeking == true else { return }
      finish()
    }
  }

  func record(`);
  source = source.replace('  func destroyPlayer() {', '  func destroyPlayer() {\n    zviewerSeekSequence += 1\n    zviewerSeeking = false');
  if (!source.includes('input.jump(withOffset: offset, completion: finish)') || !source.includes('if !zviewerSeeking')) throw new Error('Review VLC seek integration');
  }
  if (!source.includes('ZViewerMusicPauseRecovery')) {
    source = source.replace('  func pause() {', `  // ZViewerMusicPauseRecovery: :start-paused can arrive after JS requests play.
  // Explicit pause clears autoplay; a seek resumes in its own completion.
  func resumeRequestedPlayback(_ input: VLCMediaPlayer) {
    guard backgroundAudio, autoplay, !zviewerSeeking, mediaPlayer === input else { return }
    let revision = zviewerRevision
    DispatchQueue.main.async { [weak self, weak input] in
      guard let self, let input, self.mediaPlayer === input,
            self.zviewerRevision == revision, self.autoplay,
            !self.zviewerSeeking, input.state == .paused else { return }
      input.play()
    }
  }

  func pause() {`);
    if (!source.includes('func resumeRequestedPlayback(_ input: VLCMediaPlayer)')) throw new Error('Review VLC music pause recovery');
  }
  fs.writeFileSync(file, source);
  const playerFile = path.join(root, 'ios/Player/MediaPlayer.swift');
  let player = fs.readFileSync(playerFile, 'utf8').replace(/\r\n/g, '\n');
  if (!player.includes('view.resumeRequestedPlayback(player)')) {
    const paused = 'view.onPaused(["revision": view.zviewerRevision])';
    if (!player.includes(paused)) throw new Error('Review VLC paused callback integration');
    player = player.replace(paused, `${paused}\n      view.resumeRequestedPlayback(player)`);
    fs.writeFileSync(playerFile, player);
  }
}
module.exports = { patchVlcSeek };
