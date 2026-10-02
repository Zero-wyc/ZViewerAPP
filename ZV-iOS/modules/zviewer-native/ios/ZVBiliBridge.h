#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface ZVBiliBridge : NSObject
+ (NSDictionary *)perform:(NSString *)operation value:(NSString *)value;
+ (NSUInteger)resolveGeneration;
+ (void)cancelResolve;
@end
NS_ASSUME_NONNULL_END
