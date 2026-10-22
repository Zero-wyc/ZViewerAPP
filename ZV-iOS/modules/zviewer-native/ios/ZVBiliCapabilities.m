#import "ZVBiliCapabilities.h"
#import <VideoToolbox/VideoToolbox.h>
#import <TargetConditionals.h>
#import "ZVBiliProbeFixtures.h"

@interface ZVAvcBits : NSObject
@property(nonatomic, strong) NSMutableData *data;
@property(nonatomic) uint8_t byte;
@property(nonatomic) int count;
- (void)bit:(uint32_t)value;
- (void)ue:(uint32_t)value;
- (NSData *)nal:(uint8_t)header;
@end
@implementation ZVAvcBits
- (instancetype)init { if ((self = [super init])) _data = [NSMutableData data]; return self; }
- (void)bit:(uint32_t)value {
  self.byte = (self.byte << 1) | (value & 1); self.count++;
  if (self.count == 8) { uint8_t value = self.byte; [self.data appendBytes:&value length:1]; self.byte = 0; self.count = 0; }
}
- (void)ue:(uint32_t)value {
  uint32_t code = value + 1; int bits = 0;
  for (uint32_t current = code; current; current >>= 1) bits++;
  for (int index = 1; index < bits; index++) [self bit:0];
  for (int index = bits - 1; index >= 0; index--) [self bit:code >> index];
}
- (NSData *)nal:(uint8_t)header {
  [self bit:1]; while (self.count) [self bit:0];
  NSMutableData *nal = [NSMutableData dataWithBytes:&header length:1]; int zeros = 0;
  const uint8_t *bytes = self.data.bytes;
  for (NSUInteger index = 0; index < self.data.length; index++) {
    uint8_t value = bytes[index];
    if (zeros >= 2 && value <= 3) { uint8_t escape = 3; [nal appendBytes:&escape length:1]; zeros = 0; }
    [nal appendBytes:&value length:1]; zeros = value == 0 ? zeros + 1 : 0;
  }
  return nal;
}
@end

CMVideoFormatDescriptionRef ZVBiliCreateAvcFormat(int32_t width, int32_t height) {
  if (width < 16 || height < 16 || width > 8192 || height > 8192 || width % 2 || height % 2) return NULL;
  const uint32_t columns = (width + 15) / 16, rows = (height + 15) / 16;
  // High-profile, 8-bit 4:2:0 SDR, level 5.1. Encode each orientation's
  // actual SPS dimensions; rotating a landscape limit proves nothing.
  ZVAvcBits *sps = [ZVAvcBits new];
  for (int bit = 7; bit >= 0; bit--) [sps bit:100 >> bit]; // profile_idc
  for (int bit = 0; bit < 8; bit++) [sps bit:0];
  for (int bit = 7; bit >= 0; bit--) [sps bit:51 >> bit];
  [sps ue:0]; [sps ue:1]; [sps ue:0]; [sps ue:0]; [sps bit:0]; [sps bit:0];
  [sps ue:0]; [sps ue:0]; [sps ue:0]; [sps ue:1]; [sps bit:0];
  [sps ue:columns - 1]; [sps ue:rows - 1]; [sps bit:1]; [sps bit:1];
  const BOOL crop = columns * 16 != (uint32_t)width || rows * 16 != (uint32_t)height; [sps bit:crop];
  if (crop) { [sps ue:0]; [sps ue:(columns * 16 - width) / 2]; [sps ue:0]; [sps ue:(rows * 16 - height) / 2]; }
  [sps bit:0]; // no VUI/HDR colour metadata
  ZVAvcBits *pps = [ZVAvcBits new];
  [pps ue:0]; [pps ue:0]; [pps bit:1]; [pps bit:0]; [pps ue:0]; [pps ue:0]; [pps ue:0];
  [pps bit:0]; [pps bit:0]; [pps bit:0]; [pps ue:0]; [pps ue:0]; [pps ue:0]; [pps bit:1]; [pps bit:0]; [pps bit:0];
  NSData *sequence = [sps nal:0x67], *picture = [pps nal:0x68];
  const uint8_t *parameters[] = { sequence.bytes, picture.bytes };
  const size_t sizes[] = { sequence.length, picture.length };
  CMVideoFormatDescriptionRef format = NULL;
  if (CMVideoFormatDescriptionCreateFromH264ParameterSets(kCFAllocatorDefault, 2, parameters, sizes, 4, &format) != noErr) return NULL;
  CMVideoDimensions dimensions = CMVideoFormatDescriptionGetDimensions(format);
  if (dimensions.width != width || dimensions.height != height) { CFRelease(format); return NULL; }
  return format;
}

NSArray<NSDictionary *> *ZVBiliProbeFixtures(void) { return ZVBiliDecoderProbeFixtures(); }

CMVideoFormatDescriptionRef ZVBiliCreateProbeFormat(NSDictionary *fixture) {
  NSArray *encoded = fixture[@"parameters"];
  BOOL hevc = [fixture[@"codec"] isEqual:@"hevc"];
  if (![encoded isKindOfClass:NSArray.class] || encoded.count != (hevc ? 3 : 2)) return NULL;
  __attribute__((objc_precise_lifetime)) NSMutableArray<NSData *> *storage = [NSMutableArray array];
  const uint8_t *parameters[3]; size_t sizes[3];
  for (NSUInteger index = 0; index < encoded.count; index++) {
    NSData *data = [[NSData alloc] initWithBase64EncodedString:encoded[index] options:0];
    if (!data.length) return NULL;
    [storage addObject:data]; parameters[index] = data.bytes; sizes[index] = data.length;
  }
  CMVideoFormatDescriptionRef format = NULL;
  OSStatus status = hevc
    ? CMVideoFormatDescriptionCreateFromHEVCParameterSets(kCFAllocatorDefault, encoded.count, parameters, sizes, 4, NULL, &format)
    : CMVideoFormatDescriptionCreateFromH264ParameterSets(kCFAllocatorDefault, encoded.count, parameters, sizes, 4, &format);
  // The parameter data must outlive the CoreMedia call under ARC.
  (void)storage;
  if (status || !format) return NULL;
  CMVideoDimensions dimensions = CMVideoFormatDescriptionGetDimensions(format);
  if (dimensions.width != [fixture[@"width"] intValue] || dimensions.height != [fixture[@"height"] intValue]) { CFRelease(format); return NULL; }
  return format;
}

typedef struct { int32_t width, height; BOOL decoded; } ZVProbeOutput;
static void decodedProbe(void *context, void *source, OSStatus status, VTDecodeInfoFlags flags, CVImageBufferRef image, CMTime presentation, CMTime duration) {
  ZVProbeOutput *result = context;
  result->decoded = status == noErr && image && CVPixelBufferGetWidth(image) == result->width && CVPixelBufferGetHeight(image) == result->height;
}

BOOL ZVBiliProbeDecoder(NSDictionary *fixture, BOOL hardwareRequired) {
  if (@available(iOS 17.0, macOS 10.13, *)) {
    CMVideoFormatDescriptionRef format = ZVBiliCreateProbeFormat(fixture); if (!format) return NO;
    VTDecompressionSessionRef session = NULL;
    NSDictionary *specification = hardwareRequired
      ? @{ (__bridge NSString *)kVTVideoDecoderSpecification_RequireHardwareAcceleratedVideoDecoder: @YES }
      : @{ (__bridge NSString *)kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder: @NO };
    NSDictionary *output = @{ (__bridge NSString *)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange) };
    ZVProbeOutput result = { [fixture[@"width"] intValue], [fixture[@"height"] intValue], NO };
    VTDecompressionOutputCallbackRecord callback = { decodedProbe, &result };
    OSStatus status = VTDecompressionSessionCreate(kCFAllocatorDefault, format, (__bridge CFDictionaryRef)specification, (__bridge CFDictionaryRef)output, &callback, &session);
    BOOL supported = NO;
    if (status == noErr && session) {
      CFTypeRef hardware = NULL;
      OSStatus property = VTSessionCopyProperty(session, kVTDecompressionPropertyKey_UsingHardwareAcceleratedVideoDecoder, kCFAllocatorDefault, &hardware);
      BOOL hardwareActive = property == noErr && hardware && CFEqual(hardware, kCFBooleanTrue);
      BOOL softwareActive = !hardwareActive && (property == noErr || property == kVTPropertyNotSupportedErr);
      if (VTDecompressionSessionCanAcceptFormatDescription(session, format) && (hardwareRequired ? hardwareActive : softwareActive)) {
        NSData *data = [[NSData alloc] initWithBase64EncodedString:fixture[@"sample"] options:0];
        CMBlockBufferRef block = NULL; CMSampleBufferRef sample = NULL;
        status = data.length ? CMBlockBufferCreateWithMemoryBlock(kCFAllocatorDefault, NULL, data.length, kCFAllocatorDefault, NULL, 0, data.length, 0, &block) : kCMBlockBufferBadLengthParameterErr;
        if (!status) status = CMBlockBufferReplaceDataBytes(data.bytes, block, 0, data.length);
        CMSampleTimingInfo timing = { CMTimeMake(1, 30), kCMTimeZero, kCMTimeInvalid };
        size_t length = data.length;
        if (!status) status = CMSampleBufferCreateReady(kCFAllocatorDefault, block, format, 1, 1, &timing, 1, &length, &sample);
        if (!status) status = VTDecompressionSessionDecodeFrame(session, sample, 0, NULL, NULL);
        if (!status) status = VTDecompressionSessionWaitForAsynchronousFrames(session);
        supported = status == noErr && result.decoded;
        if (sample) CFRelease(sample); if (block) CFRelease(block);
      }
      if (hardware) CFRelease(hardware);
      VTDecompressionSessionInvalidate(session); CFRelease(session);
    }
    CFRelease(format); return supported;
  }
  return NO;
}

@implementation ZVBiliCapabilities
+ (NSDictionary *)snapshot {
  @synchronized(self) {
    static NSDictionary *cached; static CFAbsoluteTime until = 0;
    CFAbsoluteTime now = CFAbsoluteTimeGetCurrent(); if (cached && now < until) return cached;
    NSMutableArray *hardware = [NSMutableArray array], *software = [NSMutableArray array];
    NSString *reason = @"no-verified-decoder-format";
    if (@available(iOS 17.0, macOS 10.13, *)) {
      for (NSDictionary *fixture in ZVBiliProbeFixtures()) {
        BOOL fallback = [fixture[@"codec"] isEqual:@"avc"] && [fixture[@"width"] intValue] <= 1280 && [fixture[@"height"] intValue] <= 1280;
#if TARGET_OS_SIMULATOR
        if (!fallback) continue;
#endif
        if (CFAbsoluteTimeGetCurrent() - now > 3) { reason = @"probe-budget-exhausted"; break; }
        NSDictionary *(^capability)(NSString *) = ^NSDictionary *(NSString *mode) {
          return @{ @"codec": fixture[@"codec"], @"maxWidth": fixture[@"width"], @"maxHeight": fixture[@"height"], @"maxFrameRate": fixture[@"fps"], @"decodeMode": mode };
        };
#if !TARGET_OS_SIMULATOR
        // Exact landscape/portrait SDR keyframes, plus a confirmed hardware
        // decoder. Never infer HEVC or 4K support from the device model name.
        if (ZVBiliProbeDecoder(fixture, YES)) [hardware addObject:capability(@"hardware")];
#endif
        // Simulator software remains bounded to AVC 720p30. The real-device
        // path can expose AVC/HEVC up to 4K30 only after decoding its keyframe.
        if (fallback && CFAbsoluteTimeGetCurrent() - now <= 3 && ZVBiliProbeDecoder(fixture, NO)) [software addObject:capability(@"software")];
      }
      if ((hardware.count || software.count) && ![reason isEqual:@"probe-budget-exhausted"]) reason = TARGET_OS_SIMULATOR ? @"simulator-verified-software-avc-sdr" : @"verified-avc-hevc-sdr-keyframes";
    } else reason = @"hardware-verification-api-unavailable";
    NSArray *capabilities = [hardware arrayByAddingObjectsFromArray:software];
    cached = @{ @"success": @YES, @"capabilities": capabilities, @"hardwareCapabilities": hardware, @"softwareCapabilities": software, @"simulator": @(TARGET_OS_SIMULATOR), @"hdrVerified": @NO, @"dolbyVerified": @NO, @"frameRatePolicyLimit": @30, @"reason": reason };
    until = now + (capabilities.count ? 600 : 30); return cached;
  }
}
@end
