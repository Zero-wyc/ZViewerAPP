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
  if (!source.includes('ZViewerConfirmedSeek')) {
    source = source.replace('  private var zviewerSeeking = false', '  private var zviewerSeeking = false\n  private var zviewerSeekCompletion: ((Double?) -> Void)?');
    source = source.replace('  func destroyPlayer() {', '  func destroyPlayer() {\n    zviewerSeekCompletion?(nil)\n    zviewerSeekCompletion = nil');
    source = source.replace('    mediaPlayer?.pause()\n  }\n\n  func stop()', '    // The seek owns its paused input; repeated state-only pauses must not\n    // interrupt its decoder preroll. A new pause intent is applied at finish.\n    if !zviewerSeeking { mediaPlayer?.pause() }\n  }\n\n  func stop()');
    source = source.replace(/  func seek\(_ value: Double, _ type: String\? = "time"\) \{[\s\S]*?\n  func record\(/, `  // ZViewerConfirmedSeek: a command ACK is not a settled HLS decoder clock.
  func seek(_ value: Double, _ type: String? = "time", completion: ((Double?) -> Void)? = nil) {
    guard value.isFinite, let input = mediaPlayer else { completion?(nil); return }
    let milliseconds = type == "position" ? value * Double(input.media?.length.intValue ?? 0) : value
    let target = Int32(min(Double(Int32.max), max(0, milliseconds.rounded())))
    zviewerSeekCompletion?(nil)
    zviewerSeekSequence += 1
    let sequence = zviewerSeekSequence
    zviewerSeeking = true
    let began = Date()
    var issued = false
    var arrived = false
    var stableSince: Date?
    var attempts = 0
    var issuedAt = Date()
    var finished = false
    let finish: (Double?) -> Void = { [weak self, weak input] actual in
      guard !finished else { return }; finished = true
      guard let self, let input else { completion?(nil); return }
      if self.mediaPlayer === input, self.zviewerSeekSequence == sequence {
        self.zviewerSeeking = false; self.zviewerSeekCompletion = nil
        if actual != nil && self.autoplay { input.play() } else { input.pause() }
      }
      #if DEBUG
      NSLog("[ZViewerVLC] seek revision=%ld target=%d actual=%d success=%d", self.zviewerRevision, target, input.time.intValue, actual != nil ? 1 : 0)
      #endif
      completion?(actual)
    }
    zviewerSeekCompletion = finish
    func check() {
      guard !finished else { return }
      guard mediaPlayer === input, zviewerSeekSequence == sequence else { finish(nil); return }
      if Date().timeIntervalSince(began) >= 15 { finish(nil); return }
      if !issued && input.isSeekable {
        // Freeze the real clock while precise seek decodes. No extra play is
        // issued to prepare paused media; latest autoplay intent wins at finish.
        input.pause()
        issuedAt = Date(); attempts += 1; arrived = false
        let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
        issued = input.jump(withOffset: offset, completion: { arrived = true })
      }
      if issued && arrived {
        let actual = input.time.intValue
        if input.state == .paused && abs(Int64(actual) - Int64(target)) <= 500 {
          if stableSince == nil { stableSince = Date() }
          if Date().timeIntervalSince(stableSince!) >= 2 { finish(Double(actual)); return }
        } else {
          stableSince = nil
          // Some HLS inputs first land on a segment boundary. Retry one precise
          // jump from that actual clock; otherwise report failure, not success.
          if input.state == .paused && Date().timeIntervalSince(issuedAt) >= 2 && attempts < 2 { issued = false }
        }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self, weak input] in
        guard self != nil, input != nil else { finish(nil); return }; check()
      }
    }
    check()
  }

  func record(`);
    if (!source.includes('ZViewerConfirmedSeek') || !source.includes('if !zviewerSeeking { mediaPlayer?.pause() }')) throw new Error('Review confirmed VLC seek integration');
  }
  if (!source.includes('ZViewerConfirmedSeekV2')) {
    source = source
      .replace('    var issued = false', '    // ZViewerConfirmedSeekV2: a pause request is asynchronous; wait for its state.\n    var pauseRequested = false\n    var issued = false')
      .replace(`      if !issued && input.isSeekable {
        // Freeze the real clock while precise seek decodes. No extra play is
        // issued to prepare paused media; latest autoplay intent wins at finish.
        input.pause()
        issuedAt = Date(); attempts += 1; arrived = false
        let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
        issued = input.jump(withOffset: offset, completion: { arrived = true })
      }`, `      if !issued && input.isSeekable {
        if input.state != .paused {
          if !pauseRequested { pauseRequested = true; input.pause() }
        } else {
          issuedAt = Date(); attempts += 1; arrived = false
          let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
          issued = input.jump(withOffset: offset, completion: { arrived = true })
          #if DEBUG
          NSLog("[ZViewerVLC] seek-issued revision=%ld target=%d actual=%d state=%ld accepted=%d attempt=%ld", zviewerRevision, target, input.time.intValue, input.state.rawValue, issued ? 1 : 0, attempts)
          #endif
        }
      }`);
    if (!source.includes('ZViewerConfirmedSeekV2') || !source.includes('if input.state != .paused {')) throw new Error('Review paused VLC seek sequencing');
  }
  if (!source.includes('ZViewerDecodedHlsSeek')) {
    source = source.replace('  private var zviewerSeekCompletion:', `  var zviewerPreciseVideoSeek = false
  var zviewerFrameSequence = 0
  private var zviewerSeekCompletion:`);
    source = source.replace('    let began = Date()\n    // ZViewerConfirmedSeekV2:', `    // ZViewerDecodedHlsSeek: adaptive seek ACK/time can precede decoded PTS.
    // Prepare video with public frame steps from before the target, without
    // starting playback or substituting the requested time for a native clock.
    let frameSeek = zviewerPreciseVideoSeek
    let began = Date()
    var requested = frameSeek ? max(0, target - 2500) : target
    var stepWaiting = false
    var stepBefore = zviewerFrameSequence
    var stepAt = Date()
    var steps = 0
    // ZViewerConfirmedSeekV2:`);
    source = source.replace('if Date().timeIntervalSince(began) >= 15 { finish(nil); return }', 'if Date().timeIntervalSince(began) >= (frameSeek ? 30 : 15) { finish(nil); return }');
    source = source.replace('issuedAt = Date(); attempts += 1; arrived = false', 'issuedAt = Date(); attempts += 1; arrived = false; stepWaiting = false; stableSince = nil');
    source = source.replace('Int64(target) - Int64(input.time.intValue)', 'Int64(requested) - Int64(input.time.intValue)');
    source = source.replace('      if issued && arrived {', `      if issued && arrived && frameSeek {
        if !stepWaiting {
          guard steps < 800 else { finish(nil); return }
          stepBefore = zviewerFrameSequence; stepAt = Date(); stepWaiting = true; steps += 1
          input.gotoNextFrame()
        }
        // The public delegate confirms a decoded frame. Give its watch-time
        // update one main-queue turn before inspecting the real paused clock.
        if zviewerFrameSequence > stepBefore && Date().timeIntervalSince(stepAt) >= 0.03 {
          let actual = input.time.intValue
          if input.state == .paused && abs(Int64(actual) - Int64(target)) <= 100 {
            if stableSince == nil { stableSince = Date() }
            if Date().timeIntervalSince(stableSince!) >= 2 { finish(Double(actual)); return }
          } else {
            stableSince = nil
            if actual < target { stepWaiting = false }
            else if attempts < 4 {
              requested = Int32(clamping: max(0, Int64(requested) - max(1000, Int64(actual) - Int64(target))))
              issued = false
            } else { finish(nil); return }
          }
        }
      } else if issued && arrived {`);
    source = source.replace('deadline: .now() + 0.1) { [weak self, weak input]', 'deadline: .now() + (frameSeek ? 0.01 : 0.1)) { [weak self, weak input]');
    if (!source.includes('ZViewerDecodedHlsSeek') || !source.includes('input.gotoNextFrame()') || !source.includes('Int64(requested) - Int64(input.time.intValue)')) throw new Error('Review decoded HLS seek integration');
  }
  source = source.replace('let frameSeek = zviewerPreciseVideoSeek && !input.videoTracks.isEmpty', 'let frameSeek = zviewerPreciseVideoSeek');
  source = source.replace('timeIntervalSince(began) >= (frameSeek ? 35 : 15)', 'timeIntervalSince(began) >= (frameSeek ? 30 : 15)');
  if (!source.includes('seek-frames revision=')) {
    source = source.replace('      completion?(actual)\n    }\n    zviewerSeekCompletion = finish', `      #if DEBUG
      if frameSeek { NSLog("[ZViewerVLC] seek-frames revision=%ld target=%d actual=%d steps=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, steps, Date().timeIntervalSince(began), actual != nil ? 1 : 0) }
      #endif
      completion?(actual)
    }
    zviewerSeekCompletion = finish`);
  }
  if (!source.includes('ZViewerOpeningPauseGuard')) {
    source = source.replace('    if !zviewerSeeking { mediaPlayer?.pause() }', `    // ZViewerOpeningPauseGuard: libVLC set_pause stops an opening input
    // which cannot pause yet. Keep the intent; :start-paused prepares it.
    if !zviewerSeeking, let input = mediaPlayer, input.canPause, input.state == .playing { input.pause() }`);
  }
  source = source.replace('if !pauseRequested { pauseRequested = true; input.pause() }', 'if !pauseRequested && input.canPause && input.state == .playing { pauseRequested = true; input.pause() }');
  if (!source.includes('ZViewerSeekCancellation')) {
    source = source.replace('  // ZViewerConfirmedSeek:', `  // ZViewerConfirmedSeek:
  // ZViewerSeekCancellation: invalidate ownership before settling the old
  // promise. Its completion must never pause/resume a replacement operation.
  func cancelPendingSeek() {
    zviewerSeekSequence += 1
    let completion = zviewerSeekCompletion
    zviewerSeekCompletion = nil
    zviewerSeeking = false
    completion?(nil)
  }

  // Verified decoder-clock seek:`);
    source = source.replace('    zviewerSeekCompletion?(nil)\n    zviewerSeekSequence += 1', '    cancelPendingSeek()');
    source = source.replace(/  func destroyPlayer\(\) \{\n    zviewerSeekCompletion\?\(nil\)\n    zviewerSeekCompletion = nil\n    zviewerSeekSequence \+= 1\n    zviewerSeeking = false/, '  func destroyPlayer() {\n    cancelPendingSeek()');
    source = source.replace('  func stop() {', '  func stop() {\n    cancelPendingSeek()');
    source = source.replace('        if actual != nil && self.autoplay { input.play() } else { input.pause() }', `        if actual != nil && self.autoplay { input.play() }
        else if input.canPause && input.state == .playing { input.pause() }`);
    source = source.replace('    zviewerManaged = true\n', '    cancelPendingSeek()\n    zviewerManaged = true\n');
  }
  if (!source.includes('ZViewerContinuousAudioSeek')) {
    source = source.replace('  // Verified decoder-clock seek:', `  // ZViewerContinuousAudioSeek: a playing music clock must keep advancing
  // during correction. A paused two-second settle would create fresh drift.
  func seekPlayingAudio(_ target: Int32, completion: ((Double?) -> Void)?) {
    guard let input = mediaPlayer else { completion?(nil); return }
    cancelPendingSeek()
    let sequence = zviewerSeekSequence
    zviewerSeeking = true
    let began = Date()
    var issuedAt = began
    var issued = false
    var arrived = false
    var previous: Int32?
    var advancing = 0
    var finished = false
    let finish: (Double?) -> Void = { [weak self, weak input] actual in
      guard !finished else { return }; finished = true
      guard let self, let input else { completion?(nil); return }
      if self.mediaPlayer === input && self.zviewerSeekSequence == sequence {
        self.zviewerSeeking = false; self.zviewerSeekCompletion = nil
        if !self.autoplay && input.canPause && input.state == .playing { input.pause() }
      }
      #if DEBUG
      NSLog("[ZViewerVLC] audio-seek revision=%ld target=%d actual=%d advancing=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, advancing, Date().timeIntervalSince(began), actual != nil ? 1 : 0)
      #endif
      completion?(actual)
    }
    zviewerSeekCompletion = finish
    func check() {
      guard !finished else { return }
      guard mediaPlayer === input, zviewerSeekSequence == sequence else { finish(nil); return }
      if Date().timeIntervalSince(began) >= 8 { finish(nil); return }
      // The user's latest pause wins immediately; never restart a paused intent.
      if !autoplay {
        if input.canPause && input.state == .playing { input.pause() }
        if input.state == .paused { finish(arrived ? Double(input.time.intValue) : nil); return }
      } else if !issued {
        if input.state == .paused { input.play() }
        if input.state == .playing && input.isSeekable {
          issuedAt = Date()
          let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
          issued = input.jump(withOffset: offset, completion: { arrived = true })
          if !issued { finish(nil); return }
        }
      }
      if issued && arrived && autoplay && input.state == .playing {
        let actual = input.time.intValue
        let expected = Double(target) + Date().timeIntervalSince(issuedAt) * Double(input.rate) * 1000
        // VLCKit's public watch clock updates discretely. Re-reading the same
        // sample is neither new progress nor evidence that playback stopped.
        if previous == nil || actual != previous {
          if abs(Double(actual) - expected) <= 500 {
            if let prior = previous, actual >= prior + 10 { advancing += 1; previous = actual }
            else if previous == nil { previous = actual }
            else if let prior = previous, actual < prior { previous = nil; advancing = 0 }
            // The immediate seek target can be cached. Require two subsequent
            // increasing native observations; return only the observed clock.
            if advancing >= 2 { finish(Double(actual)); return }
          } else { previous = nil; advancing = 0 }
        }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self, weak input] in
        guard self != nil, input != nil else { finish(nil); return }; check()
      }
    }
    check()
  }

  // Verified decoder-clock seek:`);
    source = source.replace('    let target = Int32(min(Double(Int32.max), max(0, milliseconds.rounded())))\n    cancelPendingSeek()', `    let target = Int32(min(Double(Int32.max), max(0, milliseconds.rounded())))
    if backgroundAudio && autoplay { seekPlayingAudio(target, completion: completion); return }
    cancelPendingSeek()`);
  }
  if (!source.includes('ZViewerContinuousAudioSeekV2')) {
    const audioStart = source.indexOf('  // ZViewerContinuousAudioSeek:');
    const audioEnd = source.indexOf('  // Verified decoder-clock seek:', audioStart);
    let audio = source.slice(audioStart, audioEnd);
    audio = audio.replace('    var arrived = false', `    var arrived = false
    // ZViewerContinuousAudioSeekV2: :start-paused can arrive after the jump.
    var resumeRequested = false
    var pausedAt: Date?
    var pausedDuration = 0.0`);
    audio = audio.replace('      // The user\'s latest pause wins immediately;', `      if input.state == .paused {
        if pausedAt == nil { pausedAt = Date() }
      } else if let paused = pausedAt {
        pausedDuration += Date().timeIntervalSince(paused); pausedAt = nil
      }
      if autoplay && input.state == .paused && !resumeRequested {
        resumeRequested = true; input.play()
      } else if input.state == .playing { resumeRequested = false }
      // The user's latest pause wins immediately;`);
    audio = audio.replace('        if input.state == .paused { input.play() }\n', '');
    audio = audio.replace(`          issuedAt = Date()
          let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
          issued = input.jump(withOffset: offset, completion: { arrived = true })`, `          issuedAt = Date(); pausedDuration = 0; pausedAt = nil
          let offset = Int32(clamping: Int64(target) - Int64(input.time.intValue))
          // Initial near-zero attachment already meets the same strict clock
          // tolerance. Do not manufacture a new decoder seek for this case.
          if abs(Int64(offset)) <= 500 { issued = true; arrived = true }
          else { issued = input.jump(withOffset: offset, completion: { arrived = true }) }`);
    audio = audio.replace('Date().timeIntervalSince(issuedAt) * Double(input.rate)', '(Date().timeIntervalSince(issuedAt) - pausedDuration) * Double(input.rate)');
    source = source.slice(0, audioStart) + audio + source.slice(audioEnd);
  }
  if (!source.includes('ZViewerContinuousAudioSeekV3')) {
    const audioStart = source.indexOf('  // ZViewerContinuousAudioSeek:');
    const audioEnd = source.indexOf('  // Verified decoder-clock seek:', audioStart);
    let audio = source.slice(audioStart, audioEnd);
    audio = audio.replace('    var previous: Int32?', `    // ZViewerContinuousAudioSeekV3: playing can precede the first audio data.
    // Arrival, actual clock advancement and its rate are separate evidence.
    var noOp = false
    var targetObserved = false
    var targetAt = Date()
    var targetPausedDuration = 0.0
    var anchorClock: Int32?
    var anchorAt = Date()
    var anchorPausedDuration = 0.0
    var previous: Int32?`);
    audio = audio.replace('actual=%d advancing=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, advancing,', 'actual=%d noOp=%d targetObserved=%d anchored=%d advancing=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, noOp ? 1 : 0, targetObserved ? 1 : 0, anchorClock != nil ? 1 : 0, advancing,');
    audio = audio.replace('if abs(Int64(offset)) <= 500 { issued = true; arrived = true }', 'if abs(Int64(offset)) <= 500 { noOp = true; issued = true; arrived = true }');
    const phaseStart = audio.indexOf('      if issued && arrived && autoplay && input.state == .playing {');
    const phaseEnd = audio.indexOf('      DispatchQueue.main.asyncAfter(deadline: .now() + 0.05)', phaseStart);
    audio = audio.slice(0, phaseStart) + `      if issued && arrived && autoplay && input.state == .playing {
        let actual = input.time.intValue
        let now = Date()
        if actual >= 0 && !targetObserved && abs(Int64(actual) - Int64(target)) <= 500 {
          targetObserved = true; targetAt = now; targetPausedDuration = pausedDuration
          previous = actual
        } else if targetObserved, let prior = previous, actual != prior {
          if actual < prior { finish(nil); return }
          if let anchor = anchorClock {
            // Ignore repeated cached samples. Only a new observed clock can
            // confirm progress, within the unchanged strict half-second limit.
            let elapsed = max(0, now.timeIntervalSince(anchorAt) - (pausedDuration - anchorPausedDuration))
            let expected = Double(anchor) + elapsed * Double(input.rate) * 1000
            if abs(Double(actual) - expected) > 500 { finish(nil); return }
            if Int64(actual) - Int64(prior) >= 10 {
              advancing += 1; previous = actual
              if advancing >= 2 { finish(Double(actual)); return }
            }
          } else if Int64(actual) - Int64(prior) >= 100 {
            // The first tiny watchpoint after an ACK can precede usable audio.
            // A meaningful native increase establishes the clock-rate epoch;
            // initial buffering time never becomes a permanent clock error.
            let elapsed = max(0, now.timeIntervalSince(targetAt) - (pausedDuration - targetPausedDuration))
            if !noOp && Double(Int64(actual) - Int64(prior)) > elapsed * Double(input.rate) * 1000 + 500 { finish(nil); return }
            anchorClock = actual; anchorAt = now; anchorPausedDuration = pausedDuration
            previous = actual
            #if DEBUG
            NSLog("[ZViewerVLC] audio-seek-anchor revision=%ld target=%d actual=%d noOp=%d duration=%.3f", zviewerRevision, target, actual, noOp ? 1 : 0, now.timeIntervalSince(began))
            #endif
          }
        }
      }
` + audio.slice(phaseEnd);
    // The issued timestamp is no longer a moving-clock epoch. It only existed
    // to compare playback against wall time before real audio started.
    audio = audio.replace('    var issuedAt = began\n', '').replace('          issuedAt = Date(); pausedDuration = 0; pausedAt = nil', '          pausedDuration = 0; pausedAt = nil');
    source = source.slice(0, audioStart) + audio + source.slice(audioEnd);
  }
  if (!source.includes('ZViewerAudioSeekPauseGate')) {
    const audioStart = source.indexOf('  // ZViewerContinuousAudioSeek:');
    const audioEnd = source.indexOf('  // Verified decoder-clock seek:', audioStart);
    let audio = source.slice(audioStart, audioEnd);
    audio = audio.replace('    var noOp = false', `    // ZViewerAudioSeekPauseGate: an ACK alone cannot confirm a paused target.
    let diagnosticRevision = zviewerRevision
    var noOp = false`);
    audio = audio.replace('if input.state == .paused { finish(arrived ? Double(input.time.intValue) : nil); return }', `if input.state == .paused {
          let actual = input.time.intValue
          let matches = targetObserved && abs(Int64(actual) - Int64(target)) <= 500
          finish(arrived && matches ? Double(actual) : nil); return
        }`);
    audio = audio.replace('          if actual < prior { finish(nil); return }\n          if let anchor = anchorClock {', `          if actual < prior {
            if anchorClock == nil && abs(Int64(actual) - Int64(target)) <= 500 {
              // An initial watchpoint can settle backwards (e.g. 50 -> 21ms).
              // It is not progress, but remains a valid strict arrival sample.
              previous = actual; targetAt = now; targetPausedDuration = pausedDuration
            } else { finish(nil); return }
          } else if let anchor = anchorClock {`);
    audio = audio.replace('actual=%d noOp=%d targetObserved=%d anchored=%d advancing=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, noOp ? 1 : 0, targetObserved ? 1 : 0,', 'actual=%d issued=%d arrived=%d noOp=%d targetObserved=%d anchored=%d advancing=%ld duration=%.3f success=%d", self.zviewerRevision, target, input.time.intValue, issued ? 1 : 0, arrived ? 1 : 0, noOp ? 1 : 0, targetObserved ? 1 : 0,');
    audio = audio.replace('else { issued = input.jump(withOffset: offset, completion: { arrived = true }) }', `else {
            issued = input.jump(withOffset: offset, completion: { [weak input] in
              arrived = true
              #if DEBUG
              if let input { NSLog("[ZViewerVLC] audio-seek-ack revision=%ld target=%d actual=%d state=%ld", diagnosticRevision, target, input.time.intValue, input.state.rawValue) }
              #endif
            })
          }
          #if DEBUG
          NSLog("[ZViewerVLC] audio-seek-issued revision=%ld target=%d actual=%d noOp=%d state=%ld accepted=%d", diagnosticRevision, target, input.time.intValue, noOp ? 1 : 0, input.state.rawValue, issued ? 1 : 0)
          #endif`);
    source = source.slice(0, audioStart) + audio + source.slice(audioEnd);
  }
  if (!source.includes('ZViewerContinuousDecorationSeek')) {
    source = source.replace('    if backgroundAudio && autoplay { seekPlayingAudio(target, completion: completion); return }', `    // ZViewerContinuousDecorationSeek: a muted Bili video follows a moving
    // audio clock. Pausing it for strict stationary confirmation loses that
    // clock again before every seek completes. Keep progressive video running.
    if (backgroundAudio || (zviewerBackgroundDecoration && !zviewerPreciseVideoSeek)) && autoplay { seekPlayingAudio(target, completion: completion); return }`);
    source = source.replace('    guard backgroundAudio, autoplay, !zviewerSeeking, mediaPlayer === input else { return }', '    guard (backgroundAudio || zviewerBackgroundDecoration), autoplay, !zviewerSeeking, mediaPlayer === input else { return }');
    if (!source.includes('ZViewerContinuousDecorationSeek')) throw new Error('Review continuous decoration seek integration');
  }
  fs.writeFileSync(file, source);
  const moduleFile = path.join(root, 'ios/LibVlcPlayerModule.swift');
  let module = fs.readFileSync(moduleFile, 'utf8').replace(/\r\n/g, '\n');
  if (!module.includes('Prop("zviewerPreciseVideoSeek", false)')) {
    module = module.replace('Prop("zviewerRevision",', 'Prop("zviewerPreciseVideoSeek", false) { (view: LibVlcPlayerView, enabled: Bool) in view.zviewerPreciseVideoSeek = enabled }\n\n      Prop("zviewerRevision",');
    if (!module.includes('Prop("zviewerPreciseVideoSeek", false)')) throw new Error('Review HLS seek property integration');
    fs.writeFileSync(moduleFile, module);
  }
  if (!module.includes('ZViewerSeekPromise')) {
    module = module.replace('AsyncFunction("seek") { (view: LibVlcPlayerView, value: Double, type: String?) in\n        view.seek(value, type)', `// ZViewerSeekPromise: JS waits for a verified paused decoder clock.
      AsyncFunction("seek") { (view: LibVlcPlayerView, value: Double, type: String?, promise: Promise) in
        view.seek(value, type) { actual in
          if let actual { promise.resolve(actual) }
          else { promise.reject("VLC_SEEK", "媒体未能准确定位，请重试播放") }
        }`);
    if (!module.includes('ZViewerSeekPromise')) throw new Error('Review VLC seek Promise integration');
    fs.writeFileSync(moduleFile, module);
  }
  if (!module.includes('ZViewerSeekFailureClock')) {
    module = module.replace('else { promise.reject("VLC_SEEK", "媒体未能准确定位，请重试播放") }', `else if let input = view.mediaPlayer {
            // ZViewerSeekFailureClock: failure is explicit and carries only
            // the observed paused clock, never the requested target.
            promise.resolve(["success": false, "actualMilliseconds": Double(input.time.intValue)] as [String: Any])
          } else { promise.reject("VLC_SEEK", "媒体未能准确定位，请重试播放") }`);
    if (!module.includes('ZViewerSeekFailureClock')) throw new Error('Review VLC failed seek clock integration');
    fs.writeFileSync(moduleFile, module);
  }
  const playerFile = path.join(root, 'ios/Player/MediaPlayer.swift');
  let player = fs.readFileSync(playerFile, 'utf8').replace(/\r\n/g, '\n');
  if (!player.includes('ZViewerCancelReplacedSeek')) {
    player = player.replace('  func destroyPlayer() {', `  func destroyPlayer() {
    // ZViewerCancelReplacedSeek: source/options reinitialization also owns seeks.
    view.cancelPendingSeek()`);
    fs.writeFileSync(playerFile, player);
  }
  if (!player.includes('ZViewerDeinitSafeSeekCancellation')) {
    player = player.replace(`    // ZViewerCancelReplacedSeek: source/options reinitialization also owns seeks.
    view.cancelPendingSeek()
`, '');
    player = player.replace('  func initPlayer() {\n    if shouldInit {', `  func initPlayer() {
    if shouldInit {
      // ZViewerCancelReplacedSeek / ZViewerDeinitSafeSeekCancellation:
      // Only actual reinitialization cancels; destroyPlayer is also called by
      // view.deinit and must never load its unowned view reference there.
      view.cancelPendingSeek()`);
    if (!player.includes('ZViewerDeinitSafeSeekCancellation')) throw new Error('Review deinit-safe seek cancellation');
    fs.writeFileSync(playerFile, player);
  }
  player = player.replace('    view.cancelPendingSeek()\n    if shouldInit {', '    if shouldInit {\n      view.cancelPendingSeek()');
  fs.writeFileSync(playerFile, player);
  if (!player.includes('ZViewerSeekFrameDelegate')) {
    player = player.replace('  func mediaPlayerStateChanged(', `  // ZViewerSeekFrameDelegate: only current-input decoded frames settle HLS.
  func mediaPlayer(_ player: VLCMediaPlayer, nextFrameSteppedWith result: VLCMediaPlayerFrameStepResult) {
    if mediaPlayer === player && result == .success { view.zviewerFrameSequence += 1 }
  }

  func mediaPlayerStateChanged(`);
    if (!player.includes('ZViewerSeekFrameDelegate')) throw new Error('Review VLC frame-step delegate integration');
    fs.writeFileSync(playerFile, player);
  }
  if (!player.includes('view.resumeRequestedPlayback(player)')) {
    const paused = 'view.onPaused(["revision": view.zviewerRevision])';
    if (!player.includes(paused)) throw new Error('Review VLC paused callback integration');
    player = player.replace(paused, `${paused}\n      view.resumeRequestedPlayback(player)`);
    fs.writeFileSync(playerFile, player);
  }
}
module.exports = { patchVlcSeek };
