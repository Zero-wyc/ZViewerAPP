import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = promisify(execFile);

test('native view deinit cancels once without loading an unowned host or delivering late controls', { skip: process.platform !== 'darwin', timeout: 15000 }, async () => {
  const native = new URL('../node_modules/expo-libvlc-player/ios/', import.meta.url);
  const source = await readFile(new URL('LibVlcPlayerView.swift', native), 'utf8');
  const playerSource = await readFile(new URL('Player/MediaPlayer.swift', native), 'utf8');
  const destroy = playerSource.slice(playerSource.indexOf('  func destroyPlayer() {'), playerSource.indexOf('\n  private func setupPlayer()', playerSource.indexOf('  func destroyPlayer() {')));
  assert(!destroy.includes('view.'), 'unowned host cannot be loaded during view.deinit');
  const init = playerSource.slice(playerSource.indexOf('  func initPlayer() {'), playerSource.indexOf('\n  private func createPlayer()'));
  assert(init.indexOf('if shouldInit {') < init.indexOf('view.cancelPendingSeek()'), 'ordinary prop passes cannot cancel active seeks');
  const cancel = source.slice(source.indexOf('  func cancelPendingSeek() {'), source.indexOf('\n  // ZViewerContinuousAudioSeek:', source.indexOf('  func cancelPendingSeek() {')));
  const fixture = `import Foundation
enum Stats { static var cancelled = 0; static var stopped = 0; static var lateControls = 0; static var released = 0 }
final class Input {
  weak var delegate: Driver?
  func stop() { precondition(delegate == nil); Stats.stopped += 1 }
}
final class Dialog { weak var customRenderer: Driver? }
final class Host {
  var player: Driver!; var zviewerSeekSequence = 0; var zviewerSeeking = true
  var zviewerSeekCompletion: ((Double?) -> Void)?
  init() { player = Driver(self) }
  deinit { cancelPendingSeek(); player.destroyPlayer() }
${cancel}
}
final class Driver {
  unowned let view: Host
  var library: Int? = 1; var mediaPlayer: Input? = Input(); var vlcDialog: Dialog? = Dialog()
  init(_ view: Host) { self.view = view; mediaPlayer?.delegate = self; vlcDialog?.customRenderer = self }
  deinit { Stats.released += 1 }
  func lateControl() { _ = view.zviewerSeekSequence; Stats.lateControls += 1 }
${destroy}
}
@main struct Main {
  static func main() {
    weak var observedHost: Host?; weak var observedDriver: Driver?
    var oldInput: Input?
    do {
      let host = Host(); observedHost = host; observedDriver = host.player; oldInput = host.player.mediaPlayer
      host.zviewerSeekCompletion = { [weak host] actual in
        precondition(actual == nil && host == nil); Stats.cancelled += 1
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak driver = host.player] in driver?.lateControl() }
    }
    precondition(observedHost == nil && observedDriver == nil && Stats.cancelled == 1 && Stats.stopped == 1 && Stats.released == 1)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { oldInput?.delegate?.lateControl() }
    RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    precondition(Stats.cancelled == 1 && Stats.lateControls == 0 && oldInput?.delegate == nil)
    print("Actual destroy is deinit-safe; cancellation and late callbacks are isolated")
  }
}`;
  const root = await mkdtemp(join(tmpdir(), 'zviewer-deinit-'));
  try {
    const file = join(root, 'smoke.swift'), binary = join(root, 'smoke'); await writeFile(file, fixture);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    const result = await run(binary, [], { timeout: 3000 }); assert.match(result.stdout, /Actual destroy is deinit-safe/);
    // Negative control reproduces the original P0 with the same Swift unowned
    // semantics. It runs in a separate fixture process, never the app.
    await writeFile(file, fixture.replace(destroy, destroy.replace('  func destroyPlayer() {', '  func destroyPlayer() {\n    _ = view.zviewerSeekSequence')));
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    let rejected = false;
    try { await run(binary, [], { timeout: 3000 }); } catch (error) { rejected = error.signal === 'SIGABRT' || /unowned reference/i.test(error.stderr || ''); }
    assert(rejected, 'the original unowned load must fail the lifecycle regression');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('opening pause preserves preparation; continuous audio checks actual advancement and obsolete seeks cannot control replacements', { skip: process.platform !== 'darwin', timeout: 20000 }, async () => {
  const source = await readFile(new URL('../node_modules/expo-libvlc-player/ios/LibVlcPlayerView.swift', import.meta.url), 'utf8');
  const start = source.indexOf('  // ZViewerConfirmedSeek:');
  const methods = source.slice(start, source.indexOf('\n  func record(', start));
  const pause = source.slice(source.indexOf('  func pause() {'), source.indexOf('\n  func stop()', source.indexOf('  func pause() {')));
  const fixture = `import Foundation
enum State: Int { case opening = 1, playing = 2, paused = 3, stopped = 4 }
final class Time { var intValue: Int32 = 0 }
final class Media { var length = Time() }
final class Input {
  var media: Media? = Media(); var time = Time(); var state: State = .opening
  var canPause = false; var rate: Float = 1; var isSeekable = true
  var pauses = 0; var plays = 0; var jumps = 0; var latePause = false; var startupDelay = 0.0; var jumpBias: Int32 = 0; var advances = true; var videoTracks: [Int] = []
  func play() { plays += 1; state = .playing }
  func pause() { pauses += 1; state = canPause ? .paused : .stopped }
  func gotoNextFrame() {}
  func jump(withOffset offset: Int32, completion: @escaping () -> Void) -> Bool {
    precondition(state == .playing || state == .paused)
    jumps += 1; time.intValue += offset + jumpBias; completion()
    if latePause { latePause = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { self.state = .paused } }
    if advances {
      for tick in 1...4 {
        DispatchQueue.main.asyncAfter(deadline: .now() + startupDelay + Double(tick) * 0.1) {
          if self.state == .playing { self.time.intValue += 100 }
        }
      }
    }
    return true
  }
}
final class Probe {
  var mediaPlayer: Input?; var autoplay = false; var backgroundAudio = true; var zviewerRevision = 1
  var zviewerSeekSequence = 0; var zviewerSeeking = false
  var zviewerPreciseVideoSeek = false; var zviewerFrameSequence = 0
  var zviewerSeekCompletion: ((Double?) -> Void)?
${pause}
${methods}
}
func wait(_ seconds: Double) {
  let deadline = Date().addingTimeInterval(seconds)
  while Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.01)) }
}
@main struct Main {
  static func main() {
    let input = Input(); let probe = Probe(); probe.mediaPlayer = input
    probe.pause(); precondition(input.state == .opening && input.pauses == 0 && !probe.autoplay)
    input.canPause = true; input.state = .playing
    probe.pause(); precondition(input.state == .paused && input.pauses == 1)
    input.state = .playing; input.pauses = 0; probe.autoplay = true
    var completed = false; let began = Date()
    probe.seek(30000) { actual in
      precondition(actual != nil && actual! > 30000 && input.pauses == 0 && input.plays == 0)
      precondition(Date().timeIntervalSince(began) >= 0.18)
      completed = true
    }
    wait(0.5); precondition(completed && !probe.zviewerSeeking)
    // An ACK plus a cached target must not be accepted as a running clock.
    input.advances = false; var cancelled = 0
    probe.seek(40000) { actual in precondition(actual == nil); cancelled += 1 }
    wait(0.25); precondition(cancelled == 0 && probe.zviewerSeeking)
    let replacement = Input(); replacement.state = .playing; replacement.canPause = true
    probe.cancelPendingSeek(); probe.mediaPlayer = replacement
    wait(0.15); precondition(cancelled == 1 && input.pauses == 0 && replacement.pauses == 0)
    // A superseded paused-decoder operation cannot issue its failure pause
    // after the new continuous audio seek has taken ownership of this input.
    probe.backgroundAudio = false; replacement.isSeekable = false
    var oldCancelled = 0; var newerCompleted = false
    probe.seek(45000) { actual in precondition(actual == nil); oldCancelled += 1 }
    probe.backgroundAudio = true; replacement.isSeekable = true
    probe.seek(50000) { actual in precondition(actual != nil); newerCompleted = true }
    wait(0.5)
    precondition(oldCancelled == 1 && newerCompleted && replacement.pauses == 0 && replacement.plays == 0)
    // Reproduce delayed :start-paused after the jump, with latest intent play.
    replacement.latePause = true; var resumedCompleted = false
    probe.seek(52000) { actual in precondition(actual != nil); resumedCompleted = true }
    wait(0.5); precondition(resumedCompleted && replacement.state == .playing && replacement.plays == 1 && replacement.pauses == 0)
    // Already near the new track's zero: no unnecessary jump, still require
    // actual changing native clock samples before confirmation.
    let fresh = Input(); fresh.state = .playing; fresh.canPause = true; probe.mediaPlayer = fresh
    var freshDone = false; probe.seek(1) { actual in precondition(actual != nil); freshDone = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { fresh.time.intValue = 100 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { fresh.time.intValue = 200 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) { fresh.time.intValue = 300 }
    wait(0.4); precondition(freshDone && fresh.jumps == 0 && fresh.pauses == 0)
    // Real startup may be playing while the clock stays at zero for >1s.
    let stalled = Input(); stalled.state = .playing; stalled.canPause = true; probe.mediaPlayer = stalled
    var stalledDone = false; probe.seek(1) { actual in precondition(actual == 300); stalledDone = true }
    for tick in 1...4 { DispatchQueue.main.asyncAfter(deadline: .now() + 1.2 + Double(tick) * 0.1) { stalled.time.intValue = Int32(tick * 100) } }
    wait(1.7); precondition(stalledDone && stalled.jumps == 0 && stalled.pauses == 0)
    stalled.startupDelay = 1.2; var jumpedDone = false
    probe.seek(30000) { actual in precondition(actual == 30300); jumpedDone = true }
    wait(1.7); precondition(jumpedDone && stalled.jumps == 1 && stalled.pauses == 0)
    // A nonzero jump which never actually reaches target cannot anchor itself
    // at an unrelated advancing clock and claim success.
    stalled.startupDelay = 0; stalled.jumpBias = 6000; var incorrect: Double? = nil
    probe.seek(40000) { actual in incorrect = actual }
    wait(0.5); precondition(incorrect == nil && probe.zviewerSeeking)
    probe.pause(); wait(0.15)
    precondition(incorrect == nil && !probe.zviewerSeeking && stalled.state == .paused)
    // A settling initial watchpoint can move 50 -> 21ms before audio starts.
    let jitter = Input(); jitter.state = .playing; jitter.canPause = true; jitter.time.intValue = 50
    probe.mediaPlayer = jitter; probe.autoplay = true; var jitterDone = false
    probe.seek(1) { actual in precondition(actual != nil && actual! >= 350); jitterDone = true }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { jitter.time.intValue = 21 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { jitter.time.intValue = 150 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.22) { jitter.time.intValue = 250 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { jitter.time.intValue = 350 }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.42) { jitter.time.intValue = 450 }
    wait(0.5); precondition(jitterDone && jitter.pauses == 0 && jitter.jumps == 0)
    probe.mediaPlayer = replacement; probe.autoplay = true
    replacement.advances = false
    probe.seek(55000) { _ in }
    probe.pause(); wait(0.15)
    precondition(replacement.state == .paused && replacement.pauses == 1 && !probe.zviewerSeeking && replacement.plays == 1)
    print("Opening intent, moving audio clock, cancellation and latest pause verified")
  }
}`;
  const root = await mkdtemp(join(tmpdir(), 'zviewer-audio-seek-'));
  try {
    const file = join(root, 'smoke.swift'), binary = join(root, 'smoke'); await writeFile(file, fixture);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    const result = await run(binary, [], { timeout: 12000 }); assert.match(result.stdout, /Opening intent, moving audio clock, cancellation and latest pause verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('generated native seek waits for the asynchronous paused transition before issuing a jump', { skip: process.platform !== 'darwin', timeout: 15000 }, async () => {
  const source = await readFile(new URL('../node_modules/expo-libvlc-player/ios/LibVlcPlayerView.swift', import.meta.url), 'utf8');
  const start = source.indexOf('  // ZViewerConfirmedSeek:'); const end = source.indexOf('\n  func record(', start);
  assert(start >= 0 && end > start);
  const method = source.slice(start, end);
  const fixture = `import Foundation
enum State: Int { case playing = 2, paused = 3 }
final class Time { var intValue: Int32 = 0 }
final class Media { var length = Time() }
final class Input {
  var media: Media? = Media(); var time = Time(); var state: State = .playing
  var videoTracks: [Int] = []; var canPause = true; var rate: Float = 1
  var isSeekable = true; var jumps = 0; var pauseRequested = false
  func play() { state = .playing }
  func gotoNextFrame() { preconditionFailure("progressive input must not frame-step") }
  func pause() {
    if pauseRequested { return }; pauseRequested = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.state = .paused }
  }
  func jump(withOffset offset: Int32, completion: @escaping () -> Void) -> Bool {
    precondition(state == .paused, "jump was issued before native pause completed")
    jumps += 1; time.intValue += offset
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { completion() }; return true
  }
}
final class Probe {
  var mediaPlayer: Input?; var autoplay = false; var backgroundAudio = false; var zviewerRevision = 1
  var zviewerSeekSequence = 0; var zviewerSeeking = false
  var zviewerPreciseVideoSeek = false; var zviewerFrameSequence = 0
  var zviewerSeekCompletion: ((Double?) -> Void)?
${method}
}
@main struct Main {
  static func main() {
    let input = Input(); let probe = Probe(); probe.mediaPlayer = input
    var completed = false; let began = Date()
    probe.seek(90000, "time") { actual in
      precondition(actual == 90000 && input.state == .paused && input.jumps == 1)
      precondition(Date().timeIntervalSince(began) >= 2.3)
      completed = true
    }
    let deadline = Date().addingTimeInterval(6)
    while !completed && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    precondition(completed, "confirmed seek did not complete")
    print("Paused transition and settled clock verified")
  }
}`;
  const root = await mkdtemp(join(tmpdir(), 'zviewer-seek-'));
  try {
    const file = join(root, 'smoke.swift'); const binary = join(root, 'smoke'); await writeFile(file, fixture);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    const result = await run(binary, [], { timeout: 8000 }); assert.match(result.stdout, /Paused transition and settled clock verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HLS seek requires decoded frame progress and cancellation cannot resume an obsolete seek', { skip: process.platform !== 'darwin', timeout: 15000 }, async () => {
  const source = await readFile(new URL('../node_modules/expo-libvlc-player/ios/LibVlcPlayerView.swift', import.meta.url), 'utf8');
  const method = source.slice(source.indexOf('  // ZViewerConfirmedSeek:'), source.indexOf('\n  func record(', source.indexOf('  // ZViewerConfirmedSeek:')));
  const fixture = `import Foundation
enum State: Int { case playing = 2, paused = 3 }
final class Time { var intValue: Int32 = 0 }
final class Media { var length = Time() }
final class Input {
  var media: Media? = Media(); var time = Time(); var state: State = .paused
  var canPause = true; var rate: Float = 1; var videoTracks = [1]; var isSeekable = true; var frames = 0; var plays = 0; var deliverFrames = true
  var frame: (() -> Void)?
  func play() { plays += 1; state = .playing }
  func pause() { state = .paused }
  func jump(withOffset offset: Int32, completion: @escaping () -> Void) -> Bool {
    precondition(state == .paused); time.intValue += offset
    DispatchQueue.main.asyncAfter(deadline:.now()+0.01) { completion() }; return true
  }
  func gotoNextFrame() {
    precondition(state == .paused && plays == 0)
    guard deliverFrames else { return }
    DispatchQueue.main.asyncAfter(deadline:.now()+0.01) {
      self.time.intValue += 250; self.frames += 1; self.frame?()
    }
  }
}
final class Probe {
  var mediaPlayer: Input?; var autoplay = false; var backgroundAudio = false; var zviewerRevision = 1
  var zviewerSeekSequence = 0; var zviewerSeeking = false
  var zviewerPreciseVideoSeek = true; var zviewerFrameSequence = 0
  var zviewerSeekCompletion: ((Double?) -> Void)?
${method}
}
@main struct Main {
  static func main() {
    let input = Input(); let probe = Probe(); probe.mediaPlayer = input
    input.frame = { probe.zviewerFrameSequence += 1 }
    var first = false; var cancelled = false; var latest = false
    probe.seek(90000) { actual in
      precondition(actual == 90000 && input.frames >= 10 && input.plays == 0 && input.state == .paused)
      first = true
      input.deliverFrames = false
      probe.seek(95000) { old in precondition(old == nil); cancelled = true }
      DispatchQueue.main.asyncAfter(deadline:.now()+2.2) {
        precondition(!cancelled, "a seek ACK without a decoded frame was accepted")
        input.deliverFrames = true
        probe.seek(100000) { actual in
          precondition(actual == 100000 && input.plays == 0 && input.state == .paused)
          latest = true
        }
      }
    }
    let deadline = Date().addingTimeInterval(10)
    while !latest && Date() < deadline { RunLoop.current.run(until:Date().addingTimeInterval(0.01)) }
    precondition(first && cancelled && latest && !probe.zviewerSeeking)
    print("Decoded HLS frames, paused intent and cancelled seek verified")
  }
}`;
  const root = await mkdtemp(join(tmpdir(), 'zviewer-hls-seek-'));
  try {
    const file = join(root, 'smoke.swift'), binary = join(root, 'smoke'); await writeFile(file, fixture);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    const result = await run(binary, [], { timeout: 11000 }); assert.match(result.stdout, /Decoded HLS frames, paused intent and cancelled seek verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
