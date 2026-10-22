#import "ZVBiliSession.h"

static NSDictionary *sessionStatus(NSString *raw) {
  NSData *data = [raw dataUsingEncoding:NSUTF8StringEncoding];
  id value = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}

NSDictionary *ZVBiliEnsureSession(NSString *(^status)(void), NSString *(^cookie)(void), NSString *(^start)(NSError **), NSString *(^restore)(NSString *, NSError **)) {
  NSError *error = nil;
  NSMutableDictionary *result = [sessionStatus(status()) mutableCopy];
  // MobileStart(cookie) swallows validation failures. Start the transport
  // separately so a ready but anonymous service can retry authentication.
  if (![result[@"ready"] boolValue]) result = [sessionStatus(start(&error)) mutableCopy];
  if (error || ![result[@"ready"] boolValue]) return @{ @"success":@NO, @"message":@"本机 B站媒体服务启动失败，请重试" };
  result[@"success"] = @YES;
  if ([result[@"loggedIn"] boolValue]) return result;

  NSString *saved = cookie();
  if (!saved.length) return result;
  NSDictionary *next = sessionStatus(restore(saved, &error));
  if (!error && [next[@"ready"] boolValue] && [next[@"loggedIn"] boolValue]) {
    result = [next mutableCopy]; result[@"success"] = @YES; return result;
  }
  // Preserve Keychain credentials for a later retry; expose only safe text.
  BOOL expired = [error.localizedDescription containsString:@"B站登录已失效"];
  result[@"loginError"] = expired ? @"本机 B站登录已过期，请重新扫码登录" : @"本机 B站登录恢复失败，请检查网络后重试";
  return result;
}

NSString *ZVBiliResolveErrorMessage(NSString *code) {
  NSDictionary *messages = @{
    @"REGION_LIMITED":@"该内容受地区限制",
    @"NO_PERMISSION":@"当前 B站账号没有该内容或画质的播放权限",
    @"NOT_LOGGED_IN":@"本机 B站登录已过期，请重新扫码登录",
    @"EP_NOT_FOUND":@"该番剧暂无目标分集",
    @"CID_MISMATCH":@"分集与 cid 不一致，请重新选集",
    @"NO_SUPPORTED_TRACK":@"所选画质没有当前账号和本机解码策略可用的视频轨道，请尝试自动、720P 或 480P",
    @"QUALITY_UNAVAILABLE":@"源站未提供所选画质，请选择其他画质或自动",
    @"NO_SUPPORTED_AUDIO":@"源站未返回本机可播放的 AAC 音轨，请稍后重试"
  };
  return messages[code] ?: @"本机 B站解析失败，请检查网络后重试";
}
