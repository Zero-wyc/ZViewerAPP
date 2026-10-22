#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface ZVBiliBridge : NSObject
+ (NSDictionary *)perform:(NSString *)operation value:(NSString *)value;
+ (NSUInteger)resolveGeneration;
+ (void)cancelResolve;
+ (NSDictionary *)configureServer:(NSString *)url allow:(BOOL)allow;
+ (NSDictionary *)probeServer:(NSString *)url;
@end
NS_ASSUME_NONNULL_END
