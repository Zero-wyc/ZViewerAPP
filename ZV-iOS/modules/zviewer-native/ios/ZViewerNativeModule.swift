import ExpoModulesCore
import AVFoundation

public class ZViewerNativeModule: Module {
  private let voice = ZVVoiceEngine()
  private let biliQueue = DispatchQueue(label: "zviewer.bili", qos: .userInitiated)
  public func definition() -> ModuleDefinition {
    Name("ZViewerNative")
    Events("onVoiceFrame", "onVoiceStatus")
    OnCreate { [weak self] in
      // A previous process may have terminated during a call.
      UserDefaults.standard.set(false, forKey: "ZViewerVoiceActive")
      self?.voice.frame = { [weak self] data, clock in self?.sendEvent("onVoiceFrame", ["data": data.base64EncodedString(), "mediaTs": clock]) }
      self?.voice.status = { [weak self] message in self?.sendEvent("onVoiceStatus", ["message": message]) }
    }
    AsyncFunction("bili") { (operation: String, value: String, promise: Promise) in
      self.biliQueue.async { promise.resolve(ZVBiliBridge.perform(operation, value: value)) }
    }
    AsyncFunction("voiceStart") { (promise: Promise) in
      AVAudioSession.sharedInstance().requestRecordPermission { allowed in
        guard allowed else { promise.reject("MIC_PERMISSION", "请在系统设置中允许麦克风访问"); return }
        self.voice.queue.async {
          do { try self.voice.start(); promise.resolve(nil) }
          catch { self.voice.stop(); promise.reject("VOICE_START", "无法启动语音，请检查音频设备或系统权限") }
        }
      }
    }
    AsyncFunction("voiceMute") { (muted: Bool) in self.voice.queue.async { self.voice.muted = muted } }
    AsyncFunction("voicePlay") { (peer: String, encoded: Bool, sampleRate: Double, clock: Double, data: String) in
      guard peer.count <= 128, let bytes = Data(base64Encoded: data), bytes.count <= 23040 else { return }
      self.voice.queue.async { self.voice.play(peer: peer, encoded: encoded, sampleRate: sampleRate, clock: clock, bytes: bytes) }
    }
    AsyncFunction("voiceDrop") { (peer: String) in self.voice.queue.async { self.voice.drop(peer) } }
    AsyncFunction("voiceStop") { (promise: Promise) in self.voice.queue.async { self.voice.stop(); promise.resolve(nil) } }
    OnAppEntersBackground { self.voice.queue.async { self.voice.background = true } }
    OnAppEntersForeground { self.voice.queue.async { self.voice.background = false } }
    OnDestroy {
      self.voice.queue.async { self.voice.stop() }
      self.biliQueue.async { _ = ZVBiliBridge.perform("stop", value: "") }
    }
  }
}

// One serial queue owns codecs, engines and buffer counters. Incoming packets
// have a bounded 200 ms queue; late/duplicate packets never build up latency.
private final class ZVVoiceEngine {
  let queue = DispatchQueue(label: "zviewer.voice", qos: .userInteractive)
  var frame: ((Data, Double) -> Void)?
  var status: ((String) -> Void)?
  var muted = true
  var background = false
  private var engine: AVAudioEngine?
  private var encoder: ZVVoiceCodec?
  private var converter: AVAudioConverter?
  private var samples: [Float] = []
  private var peers: [String: Peer] = [:]
  private var observers: [NSObjectProtocol] = []
  private var generation = 0
  private var clock: Double = 0
  private let tapLock = NSLock()
  private var pendingTaps = 0
  private let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 48000, channels: 1, interleaved: false)!
  private final class Peer {
    let player = AVAudioPlayerNode()
    let codec = ZVVoiceCodec()
    var queued = 0 // PCM frames, limited to 200ms regardless of packet duration.
    var lastClock: Double = -1
  }
  func start() throws {
    stop(); generation += 1; let revision = generation
    let session = AVAudioSession.sharedInstance()
    UserDefaults.standard.set(true, forKey: "ZViewerVoiceActive")
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
    try session.setPreferredSampleRate(48000)
    try session.setPreferredIOBufferDuration(0.02)
    try session.setActive(true)
    let audio = AVAudioEngine(); engine = audio
    try audio.inputNode.setVoiceProcessingEnabled(true)
    let input = audio.inputNode.outputFormat(forBus: 0)
    guard input.sampleRate > 0, input.channelCount > 0, let codec = ZVVoiceCodec(), let convert = AVAudioConverter(from: input, to: format) else { throw NSError(domain: "Voice", code: 1) }
    encoder = codec; converter = convert; clock = 0; muted = true
    audio.inputNode.installTap(onBus: 0, bufferSize: 960, format: input) { [weak self] buffer, _ in
      guard let self else { return }
      self.tapLock.lock()
      if self.pendingTaps >= 4 { self.tapLock.unlock(); return }
      self.pendingTaps += 1; self.tapLock.unlock()
      // The tap's memory is reused by AVAudioEngine: copy before dispatching.
      guard let copy = AVAudioPCMBuffer(pcmFormat: input, frameCapacity: buffer.frameLength) else { self.tapLock.lock(); self.pendingTaps -= 1; self.tapLock.unlock(); return }
      copy.frameLength = buffer.frameLength
      for channel in 0..<Int(input.channelCount) {
        if let src = buffer.floatChannelData?[channel], let dst = copy.floatChannelData?[channel] { dst.update(from: src, count: Int(buffer.frameLength)) }
      }
      self.queue.async {
        defer { self.tapLock.lock(); self.pendingTaps -= 1; self.tapLock.unlock() }
        guard self.generation == revision else { return }; self.capture(copy)
      }
    }
    audio.prepare(); try audio.start()
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: nil) { [weak self] note in
      let kind = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue
      self?.queue.async {
        guard let self else { return }
        self.muted = true
        if kind == AVAudioSession.InterruptionType.ended.rawValue { try? session.setActive(true); try? self.engine?.start() }
        self.status?("语音音频会话发生中断，麦克风已静音；恢复后可手动开启")
      }
    })
    observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: audio, queue: nil) { [weak self] _ in
      self?.queue.async { self?.muted = true; self?.status?("音频设备已变化，请退出并重新加入语音") }
    })
  }
  private func capture(_ input: AVAudioPCMBuffer) {
    guard let converter, let encoder else { return }
    if muted || background { samples.removeAll(keepingCapacity: true); return }
    let capacity = AVAudioFrameCount(ceil(Double(input.frameLength) * 48000 / input.format.sampleRate) + 64)
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return }
    var supplied = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if supplied { status.pointee = .noDataNow; return nil }
      supplied = true; status.pointee = .haveData; return input
    }
    guard error == nil, let values = output.floatChannelData?[0] else { return }
    samples.append(contentsOf: UnsafeBufferPointer(start: values, count: Int(output.frameLength)))
    if samples.count > 9600 { samples.removeAll(keepingCapacity: true); return }
    while samples.count >= 960 {
      let pcm = samples.withUnsafeBufferPointer { Data(bytes: $0.baseAddress!, count: 960 * MemoryLayout<Float>.size) }
      samples.removeFirst(960)
      if let packet = encoder.encode(pcm) { frame?(packet, clock); clock += 20000 }
    }
  }
  func play(peer: String, encoded: Bool, sampleRate: Double, clock: Double, bytes: Data) {
    guard let engine, engine.isRunning, peers.count < 32 || peers[peer] != nil else { return }
    let target: Peer
    if let existing = peers[peer] { target = existing }
    else { target = Peer(); engine.attach(target.player); engine.connect(target.player, to: engine.mainMixerNode, format: format); peers[peer] = target }
    guard clock.isFinite, clock >= 0, clock > target.lastClock, target.queued < 9600 else { return }
    target.lastClock = clock
    let pcm: Data
    if encoded { guard let decoded = target.codec?.decode(bytes) else { return }; pcm = decoded }
    else {
      guard bytes.count % 4 == 0, sampleRate >= 8000, sampleRate <= 96000 else { return }
      if sampleRate == 48000 { pcm = bytes }
      else {
        // Legacy Float32 PCM: bounded linear resampling into the room's 48kHz.
        let count = bytes.count / 4
        guard count > 1 else { return }
        let input = bytes.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
        let frames = min(5760, Int(Double(count) * 48000 / sampleRate))
        var output = [Float](repeating: 0, count: frames)
        for i in 0..<frames { let p = Double(i) * sampleRate / 48000; let a = min(count - 1, Int(p)); let b = min(count - 1, a + 1); output[i] = input[a] + (input[b] - input[a]) * Float(p - Double(a)) }
        pcm = output.withUnsafeBytes { Data($0) }
      }
    }
    let frames = pcm.count / 4
    guard frames > 0, frames <= 5760, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)), let dest = buffer.floatChannelData?[0] else { return }
    buffer.frameLength = AVAudioFrameCount(frames)
    pcm.withUnsafeBytes { raw in dest.update(from: raw.bindMemory(to: Float.self).baseAddress!, count: frames) }
    for i in 0..<frames { if !dest[i].isFinite { dest[i] = 0 } }
    guard target.queued + frames <= 9600 else { return }
    target.queued += frames
    target.player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self, weak target] _ in
      self?.queue.async { if let target { target.queued = max(0, target.queued - frames) } }
    }
    if !target.player.isPlaying && target.queued >= 2880 { target.player.play() }
  }
  func drop(_ peer: String) { if let target = peers.removeValue(forKey: peer) { target.player.stop(); engine?.detach(target.player) } }
  func stop() {
    generation += 1; muted = true; samples.removeAll(); observers.forEach { NotificationCenter.default.removeObserver($0) }; observers.removeAll()
    for peer in Array(peers.keys) { drop(peer) }
    engine?.inputNode.removeTap(onBus: 0); engine?.stop(); engine = nil; converter = nil; encoder = nil
    UserDefaults.standard.set(false, forKey: "ZViewerVoiceActive")
    // Restore playback after leaving voice while VLC may still be playing.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
  }
}
