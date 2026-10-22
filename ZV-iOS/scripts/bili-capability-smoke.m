#import "../modules/zviewer-native/ios/ZVBiliCapabilities.h"
#import <TargetConditionals.h>

int main(void) {
  @autoreleasepool {
    const int32_t sizes[][2] = { {1920,1080}, {1080,1920}, {1280,720}, {720,1280}, {854,480}, {480,854}, {1080,2560}, {2560,1440}, {1440,2560}, {3840,2160}, {2160,3840} };
    for (NSUInteger index = 0; index < sizeof(sizes) / sizeof(sizes[0]); index++) {
      CMVideoFormatDescriptionRef format = ZVBiliCreateAvcFormat(sizes[index][0], sizes[index][1]);
      if (!format) { fprintf(stderr, "format creation failed at %d x %d\n", sizes[index][0], sizes[index][1]); return 1; }
      CMVideoDimensions actual = CMVideoFormatDescriptionGetDimensions(format);
      const uint8_t *sequence = NULL; size_t sequenceSize = 0, parameterCount = 0; int lengthSize = 0;
      OSStatus result = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, 0, &sequence, &sequenceSize, &parameterCount, &lengthSize);
      BOOL correct = actual.width == sizes[index][0] && actual.height == sizes[index][1] && result == noErr && sequenceSize > 4 && sequence[1] == 100 && parameterCount == 2 && lengthSize == 4;
      CFRelease(format);
      if (!correct) { fprintf(stderr, "SPS dimension/profile mismatch\n"); return 2; }
    }
    for (NSArray<NSNumber *> *size in @[@[@0,@1080], @[@1920,@0], @[@1081,@1920], @[@1920,@1081], @[@9000,@1080]]) {
      CMVideoFormatDescriptionRef format = ZVBiliCreateAvcFormat(size[0].intValue, size[1].intValue);
      if (format) { CFRelease(format); fprintf(stderr, "invalid dimensions accepted\n"); return 3; }
    }
    NSUInteger decoded = 0, formats = 0;
    for (NSDictionary *fixture in ZVBiliProbeFixtures()) {
      CMVideoFormatDescriptionRef format = ZVBiliCreateProbeFormat(fixture);
      if (!format) { fprintf(stderr, "invalid generated format\n"); return 7; }
      CFRelease(format); formats++;
      if (ZVBiliProbeDecoder(fixture, NO) || ZVBiliProbeDecoder(fixture, YES)) decoded++;
      else { fprintf(stderr, "fixture decode failed: %s %dx%d\n", [fixture[@"codec"] UTF8String], [fixture[@"width"] intValue], [fixture[@"height"] intValue]); return 8; }
    }
    if (formats != 20 || decoded != formats) return 9;
    NSMutableDictionary *bad = [ZVBiliProbeFixtures()[0] mutableCopy];
    bad[@"width"] = @1920;
    CMVideoFormatDescriptionRef invalid = ZVBiliCreateProbeFormat(bad);
    if (invalid) { CFRelease(invalid); return 10; }
    bad = [ZVBiliProbeFixtures()[0] mutableCopy]; bad[@"sample"] = @"AAAAAWU=";
    if (ZVBiliProbeDecoder(bad, NO) || ZVBiliProbeDecoder(bad, YES)) return 11;
    NSDictionary *first = [ZVBiliCapabilities snapshot], *cached = [ZVBiliCapabilities snapshot];
    if (first != cached || [first[@"hdrVerified"] boolValue] || [first[@"dolbyVerified"] boolValue]) return 4;
#if TARGET_OS_SIMULATOR
    if ([first[@"hardwareCapabilities"] count] || ![first[@"capabilities"] isEqual:first[@"softwareCapabilities"]]) return 5;
#endif
    for (NSDictionary *capability in first[@"capabilities"]) {
      if (![@[@"avc", @"hevc"] containsObject:capability[@"codec"]] || [capability[@"maxFrameRate"] intValue] > 30) return 6;
      if ([capability[@"decodeMode"] isEqual:@"software"] && (![capability[@"codec"] isEqual:@"avc"] || [capability[@"maxWidth"] intValue] > 1280 || [capability[@"maxHeight"] intValue] > 1280)) return 12;
    }
    printf("Hardware formats: %lu; software formats: %lu; reason: %s\n", (unsigned long)[first[@"hardwareCapabilities"] count], (unsigned long)[first[@"softwareCapabilities"] count], [first[@"reason"] UTF8String]);
    puts("Bili capability smoke: 20 real SDR keyframe decodes, exact portrait/landscape dimensions through 4K, corrupt-frame rejection and bounded cache passed");
  }
  return 0;
}
