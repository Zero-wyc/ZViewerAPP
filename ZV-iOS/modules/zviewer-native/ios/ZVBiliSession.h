#import <Foundation/Foundation.h>

// Called under the bridge's session lock. Cookie-bearing blocks stay native.
NSDictionary *ZVBiliEnsureSession(NSString *(^status)(void), NSString *(^cookie)(void), NSString *(^start)(NSError **), NSString *(^restore)(NSString *, NSError **));
NSString *ZVBiliResolveErrorMessage(NSString *code);
