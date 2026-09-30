#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface ZVVoiceCodec : NSObject
- (nullable instancetype)init;
- (nullable NSData *)encode:(NSData *)pcm;
- (nullable NSData *)decode:(NSData *)packet;
@end
NS_ASSUME_NONNULL_END
