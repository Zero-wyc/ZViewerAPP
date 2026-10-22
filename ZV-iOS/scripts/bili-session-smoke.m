#import "../modules/zviewer-native/ios/ZVBiliSession.h"

static NSString *json(NSDictionary *value) { return [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:value options:0 error:nil] encoding:NSUTF8StringEncoding]; }
#define CHECK(condition) do { if (!(condition)) { fprintf(stderr, "Bili session assertion failed at line %d\n", __LINE__); return 1; } } while (0)
int main(void) {
  @autoreleasepool {
    __block BOOL ready = NO, loggedIn = NO, network = NO;
    __block int starts = 0, restores = 0, reads = 0, epoch = 1;
    NSString *(^status)(void) = ^{ return json(@{ @"ready":@(ready), @"loggedIn":@(loggedIn), @"sessionVersion":@(epoch) }); };
    NSString *(^cookie)(void) = ^{ reads++; return @"fixture-native-only"; };
    NSString *(^start)(NSError **) = ^NSString *(NSError **error) { starts++; ready = YES; return status(); };
    NSString *(^restore)(NSString *, NSError **) = ^NSString *(NSString *saved, NSError **error) {
      restores++;
      if (!network) { *error = [NSError errorWithDomain:@"fixture" code:1 userInfo:@{NSLocalizedDescriptionKey:@"network failed https://secret.invalid/?cookie=private"}]; return @""; }
      loggedIn = [saved isEqual:@"fixture-native-only"]; epoch++; return status();
    };
    NSDictionary *failed = ZVBiliEnsureSession(status, cookie, start, restore);
    CHECK([failed[@"ready"] boolValue] && ![failed[@"loggedIn"] boolValue] && [failed[@"loginError"] containsString:@"网络"]);
    CHECK(![json(failed) containsString:@"private"] && ![json(failed) containsString:@"https:"] && starts == 1 && restores == 1);
    network = YES;
    NSDictionary *recovered = ZVBiliEnsureSession(status, cookie, start, restore);
    CHECK([recovered[@"loggedIn"] boolValue] && !recovered[@"loginError"] && [recovered[@"sessionVersion"] intValue] == 2 && starts == 1 && restores == 2);
    ZVBiliEnsureSession(status, cookie, start, restore);
    CHECK(reads == 2 && restores == 2 && epoch == 2); // Active sessions keep their issued media and epoch.
    ready = NO; loggedIn = NO;
    NSDictionary *restarted = ZVBiliEnsureSession(status, cookie, start, restore);
    CHECK([restarted[@"loggedIn"] boolValue] && starts == 2 && restores == 3);
    loggedIn = NO;
    NSDictionary *anonymous = ZVBiliEnsureSession(status, ^{ return @""; }, start, restore);
    CHECK(![anonymous[@"loggedIn"] boolValue] && !anonymous[@"loginError"] && restores == 3);
    NSDictionary *expired = ZVBiliEnsureSession(status, cookie, start, ^NSString *(NSString *saved, NSError **error) { *error = [NSError errorWithDomain:@"fixture" code:1 userInfo:@{NSLocalizedDescriptionKey:@"B站登录已失效，请重新登录"}]; return @""; });
    CHECK([expired[@"loginError"] containsString:@"重新扫码"]);
    ready = NO;
    NSDictionary *unavailable = ZVBiliEnsureSession(status, cookie, ^NSString *(NSError **error) { return @"{}"; }, restore);
    CHECK(![unavailable[@"success"] boolValue] && [unavailable[@"message"] containsString:@"服务启动失败"] && restores == 3);
    CHECK([ZVBiliResolveErrorMessage(@"NO_SUPPORTED_TRACK") containsString:@"轨道"]);
    CHECK([ZVBiliResolveErrorMessage(@"QUALITY_UNAVAILABLE") containsString:@"源站"]);
    CHECK([ZVBiliResolveErrorMessage(@"NO_SUPPORTED_AUDIO") containsString:@"AAC"]);
    CHECK(![ZVBiliResolveErrorMessage(@"RESOLVE_FAILED") containsString:@"登录"]);
    CHECK(![ZVBiliResolveErrorMessage(@"https://secret.invalid/?cookie=private") containsString:@"private"]);
    puts("Bili session smoke passed: failed restore retries, restart restores, active epoch stays stable, anonymous/expired/startup errors and safe quality reasons");
  }
  return 0;
}
