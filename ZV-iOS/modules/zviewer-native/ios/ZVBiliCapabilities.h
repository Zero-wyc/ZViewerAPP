#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>

NS_ASSUME_NONNULL_BEGIN

// Internal format factory shared with the native dimension smoke test.
CMVideoFormatDescriptionRef _Nullable ZVBiliCreateAvcFormat(int32_t width, int32_t height) CF_RETURNS_RETAINED;

// Internal probe entry points shared with native fixture/decode tests.
NSArray<NSDictionary *> *ZVBiliProbeFixtures(void);
CMVideoFormatDescriptionRef _Nullable ZVBiliCreateProbeFormat(NSDictionary *fixture) CF_RETURNS_RETAINED;
BOOL ZVBiliProbeDecoder(NSDictionary *fixture, BOOL hardwareRequired);

@interface ZVBiliCapabilities : NSObject
+ (NSDictionary *)snapshot;
@end

NS_ASSUME_NONNULL_END
