#import "ZVShareAudioDevice.h"
#import <AVFoundation/AVFoundation.h>
#import <pthread.h>

@implementation ZVShareAudioDevice {
  id<RTC_OBJC_TYPE(RTCAudioDeviceDelegate)> _delegate;
  AVAudioConverter *_converter;
  AVAudioFormat *_sourceFormat;
  AVAudioFormat *_outputFormat;
  NSMutableData *_pending;
  NSThread *_worker;
  NSCondition *_condition;
  BOOL _closed;
  BOOL _initialized, _recording, _playing;
  NSUInteger _sampleCount;
}
- (instancetype)init {
  if ((self = [super init])) {
    _pending = [NSMutableData data];
    _condition = [NSCondition new];
    _outputFormat = [[AVAudioFormat alloc] initWithCommonFormat:AVAudioPCMFormatInt16 sampleRate:48000 channels:1 interleaved:YES];
    _worker = [[NSThread alloc] initWithTarget:self selector:@selector(deliver) object:nil];
    _worker.name = @"ZViewer.BroadcastAudio";
    [_worker start];
  }
  return self;
}
- (NSUInteger)sampleCount { @synchronized(self) { return _sampleCount; } }
- (void)appendSample:(CMSampleBufferRef)sample {
  if (!self.enabled || !CMSampleBufferDataIsReady(sample)) return;
  const AudioStreamBasicDescription *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(CMSampleBufferGetFormatDescription(sample));
  if (!asbd || asbd->mFormatID != kAudioFormatLinearPCM) return;
  AVAudioFormat *format = [[AVAudioFormat alloc] initWithStreamDescription:asbd];
  AVAudioPCMBuffer *input = [[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:(AVAudioFrameCount)CMSampleBufferGetNumSamples(sample)];
  if (!input) return;
  input.frameLength = input.frameCapacity;
  if (CMSampleBufferCopyPCMDataIntoAudioBufferList(sample, 0, (int32_t)input.frameLength, input.mutableAudioBufferList) != noErr) return;
  // Convert before ReplayKit returns. Only owned PCM enters the bounded queue.
  if (![_sourceFormat isEqual:format]) {
    _sourceFormat = format;
    _converter = [[AVAudioConverter alloc] initFromFormat:format toFormat:_outputFormat];
  }
  if (!_converter) return;
  AVAudioFrameCount capacity = (AVAudioFrameCount)ceil(input.frameLength * 48000.0 / format.sampleRate) + 32;
  AVAudioPCMBuffer *output = [[AVAudioPCMBuffer alloc] initWithPCMFormat:_outputFormat frameCapacity:capacity];
  __block BOOL supplied = NO;
  NSError *error;
  [_converter convertToBuffer:output error:&error withInputFromBlock:^AVAudioBuffer *(AVAudioPacketCount count, AVAudioConverterInputStatus *status) {
    if (supplied) { *status = AVAudioConverterInputStatus_NoDataNow; return nil; }
    supplied = YES; *status = AVAudioConverterInputStatus_HaveData; return input;
  }];
  if (error || !output.frameLength) return;
  [_condition lock];
  if (!_closed) {
    if (_pending.length + output.frameLength * 2 > 19200) [_pending setLength:0];
    [_pending appendBytes:output.int16ChannelData[0] length:output.frameLength * 2];
    [_condition signal];
  }
  [_condition unlock];
}
- (void)deliver {
  @autoreleasepool {
    while (YES) {
      [_condition lock];
      while (!_closed && _pending.length < 960) [_condition wait];
      if (_closed) { [_condition unlock]; return; }
      NSData *frame = [_pending subdataWithRange:NSMakeRange(0, 960)];
      [_pending replaceBytesInRange:NSMakeRange(0, 960) withBytes:NULL length:0];
      [_condition unlock];
      @synchronized(self) {
        if (_recording && _delegate && self.enabled) {
          AudioBufferList list = { .mNumberBuffers = 1, .mBuffers = {{ .mNumberChannels = 1, .mDataByteSize = 960, .mData = (void *)frame.bytes }} };
          AudioTimeStamp time = { .mSampleTime = (Float64)_sampleCount, .mFlags = kAudioTimeStampSampleTimeValid };
          AudioUnitRenderActionFlags flags = 0;
          _delegate.deliverRecordedData(&flags, &time, 0, 480, &list, NULL, nil);
          _sampleCount += 480;
        }
      }
    }
  }
}
- (void)shutdown {
  [_condition lock]; _closed = YES; [_pending setLength:0]; [_condition signal]; [_condition unlock];
  @synchronized(self) { _delegate = nil; _recording = NO; }
}
- (double)deviceInputSampleRate { return 48000; }
- (double)deviceOutputSampleRate { return 48000; }
- (NSTimeInterval)inputIOBufferDuration { return .01; }
- (NSTimeInterval)outputIOBufferDuration { return .01; }
- (NSInteger)inputNumberOfChannels { return 1; }
- (NSInteger)outputNumberOfChannels { return 1; }
- (NSTimeInterval)inputLatency { return .01; }
- (NSTimeInterval)outputLatency { return 0; }
- (BOOL)isInitialized { return _initialized; }
- (BOOL)isPlayoutInitialized { return YES; }
- (BOOL)isRecordingInitialized { return YES; }
- (BOOL)isPlaying { return _playing; }
- (BOOL)isRecording { @synchronized(self) { return _recording; } }
- (BOOL)initializeWithDelegate:(id<RTC_OBJC_TYPE(RTCAudioDeviceDelegate)>)delegate {
  @synchronized(self) { _delegate = delegate; _initialized = YES; }
  return YES;
}
- (BOOL)terminateDevice { @synchronized(self) { _delegate = nil; _initialized = NO; _recording = NO; } return YES; }
- (BOOL)initializePlayout { return YES; }
- (BOOL)initializeRecording { return YES; }
- (BOOL)startPlayout { _playing = YES; return YES; }
- (BOOL)stopPlayout { _playing = NO; return YES; }
- (BOOL)startRecording { @synchronized(self) { _recording = YES; } return YES; }
- (BOOL)stopRecording { @synchronized(self) { _recording = NO; } return YES; }
@end
