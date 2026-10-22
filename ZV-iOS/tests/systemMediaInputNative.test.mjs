import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const run = promisify(execFile);

test('actual native progress freezes input identity and rejects time callbacks from a retired VLC player', async () => {
  const source = readFileSync(new URL('../node_modules/expo-libvlc-player/ios/Player/MediaPlayer.swift', import.meta.url), 'utf8');
  const capture = source.match(/^    zviewerProgressInput = .+$/m)?.[0];
  const guard = source.match(/^    if let origin = notification.object as\? VLCMediaPlayer.+$/m)?.[0];
  const time = source.slice(source.indexOf('  func mediaPlayerTimeChanged('));
  const value = time.match(/userInfo: (zviewerProgressInput\.merging\(.+\})\)/)?.[1];
  assert(capture && guard && value, 'test must execute current native patch statements');
  const directory = mkdtempSync(join(tmpdir(), 'zv-system-media-identity-'));
  try {
    const file = join(directory, 'main.swift'), binary = join(directory, 'identity');
    writeFileSync(file, `import Foundation
final class View { var source: String? = "same"; var zviewerOwnerId = "owner"; var zviewerRevision = 7; var backgroundAudio = true }
enum State { case playing, opening }
final class Time { var intValue: Int32 = 12000 }
final class VLCMediaPlayer: NSObject { var time = Time(); var state = State.playing; var isPlaying = true }
final class Harness {
 let view = View(); var mediaPlayer: VLCMediaPlayer?; var firstPlay = false
 var zviewerProgressInput: [String: Any] = [:]; var received: [[String: Any]] = []
 func capture() { ${capture} }
 func progress(_ notification: Notification) {
   guard let player = mediaPlayer else { return }
   ${guard}
   received.append(${value})
 }
}
@main enum Cases { static func main() {
 let h = Harness(); let old = VLCMediaPlayer(); h.mediaPlayer = old; h.capture()
 h.view.source = "new"; h.view.zviewerRevision = 8; h.view.zviewerOwnerId = "new-owner"; h.view.backgroundAudio = false
 h.progress(Notification(name: Notification.Name("time"), object: old))
 precondition(h.received.count == 1)
 precondition(h.received[0]["uri"] as? String == "same")
 precondition(h.received[0]["ownerId"] as? String == "owner")
 precondition(h.received[0]["revision"] as? Int == 7)
 precondition(h.received[0]["backgroundAudio"] as? Bool == true)
 let next = VLCMediaPlayer(); h.mediaPlayer = next; h.capture()
 h.progress(Notification(name: Notification.Name("time"), object: old))
 precondition(h.received.count == 1, "retired notification must not read the current player")
 next.state = .opening
 h.progress(Notification(name: Notification.Name("time"), object: next))
 precondition(h.received.last?["ready"] as? Bool == false)
 next.state = .playing
 h.progress(Notification(name: Notification.Name("time"), object: next))
 precondition(h.received.last?["revision"] as? Int == 8)
 precondition(h.received.last?["ready"] as? Bool == true)
} }
`);
    await run('xcrun', ['swiftc', '-parse-as-library', file, '-o', binary]);
    await run(binary);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('actual Swift gate rejects same-URI decoration/retired inputs and waits for ready audio clock advancement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'zv-system-media-input-'));
  try {
    const file = join(directory, 'main.swift'), binary = join(directory, 'gate');
    writeFileSync(file, `import Foundation
@main enum Cases {
 static func main() {
  var gate = ZVSystemMediaInputGate()
  var state: [String: Any] = ["kind":"audio", "uri":"same-media", "ownerId":"audio-owner", "inputRevision":7, "playbackRate":1]
  func event(_ position: Double, _ owner: String = "audio-owner", _ revision: Int = 7, _ audio: Bool = true, _ ready: Bool = true, _ playing: Bool = true) -> [String: Any] {
   ["uri":"same-media", "ownerId":owner, "revision":revision, "backgroundAudio":audio, "ready":ready, "playing":playing, "position":position]
  }
  precondition(!gate.accepts(event(9,"audio-owner",7,false),state:state), "same URI muted video must be rejected")
  precondition(!gate.accepts(event(9,"retired-owner"),state:state), "same URI different player must be rejected")
  precondition(!gate.accepts(event(9,"audio-owner",6),state:state), "same URI old input must be rejected")
  precondition(!gate.accepts(["uri":"same-media","playing":true],state:state), "untyped legacy events cannot own music")
  precondition(!gate.advancedReadyAudio(event(0,"audio-owner",7,true,false),state:state,now:1), "opening is not ready")
  precondition(!gate.advancedReadyAudio(event(0),state:state,now:2), "first ready sample is not clock advancement")
  precondition(!gate.advancedReadyAudio(event(0),state:state,now:2.2), "stationary play event is insufficient")
  precondition(!gate.advancedReadyAudio(event(80,"retired-owner"),state:state,now:2.3))
  precondition(gate.advancedReadyAudio(event(0.2),state:state,now:2.4), "actual selected audio advancement completes transition")
  state["inputRevision"] = 8
  precondition(!gate.advancedReadyAudio(event(1),state:state,now:3), "retired input cannot finish a replacement")
  precondition(!gate.advancedReadyAudio(event(0,"audio-owner",8),state:state,now:4))
  precondition(!gate.advancedReadyAudio(event(50,"audio-owner",8),state:state,now:4.1), "jump is not running clock proof")
  precondition(!gate.advancedReadyAudio(event(50.1,"audio-owner",8,true,true,false),state:state,now:4.2), "paused metadata cannot finish transition")
  precondition(gate.advancedReadyAudio(event(50.2,"audio-owner",8),state:state,now:4.3))
  gate.reset()
  precondition(!gate.advancedReadyAudio(event(51,"audio-owner",8),state:state,now:5))
  print("input isolation and transition cases passed")
 }
}`);
    await run('xcrun', ['swiftc', '-parse-as-library', new URL('../modules/zviewer-native/ios/ZVSystemMediaInputGate.swift', import.meta.url).pathname, file, '-o', binary]);
    assert.match((await run(binary)).stdout, /input isolation and transition cases passed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
