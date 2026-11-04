#import <Foundation/Foundation.h>
#import <CoreMedia/CoreMedia.h>
#import <LiveKitWebRTC/RTCAudioDevice.h>

NS_ASSUME_NONNULL_BEGIN
@interface ZVShareAudioDevice : NSObject <RTC_OBJC_TYPE(RTCAudioDevice)>
@property(atomic) BOOL enabled;
@property(atomic, readonly) NSUInteger sampleCount;
- (void)appendSample:(CMSampleBufferRef)sample;
- (void)shutdown;
@end
NS_ASSUME_NONNULL_END
