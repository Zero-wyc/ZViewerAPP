#import "ZVBiliBridge.h"
#import <Bilicore/Bilicore.h>
#import <Security/Security.h>
#import <VideoToolbox/VideoToolbox.h>
#import <CommonCrypto/CommonDigest.h>

static NSDictionary *decode(NSString *raw) {
  NSData *data = [raw dataUsingEncoding:NSUTF8StringEncoding];
  id value = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}
static NSDictionary *keyQuery(void) { return @{(__bridge id)kSecClass:(__bridge id)kSecClassGenericPassword, (__bridge id)kSecAttrService:@"com.zviewer.mobile.bilicore", (__bridge id)kSecAttrAccount:@"cookie"}; }
static NSString *readCookie(void) {
  NSMutableDictionary *query = [keyQuery() mutableCopy]; query[(__bridge id)kSecReturnData] = @YES; CFTypeRef result = NULL;
  if (SecItemCopyMatching((__bridge CFDictionaryRef)query, &result) != errSecSuccess) return @"";
  return [[NSString alloc] initWithData:(__bridge_transfer NSData *)result encoding:NSUTF8StringEncoding] ?: @"";
}
static BOOL saveCookie(NSString *cookie) {
  NSDictionary *query = keyQuery(); SecItemDelete((__bridge CFDictionaryRef)query);
  NSMutableDictionary *value = [query mutableCopy]; value[(__bridge id)kSecValueData] = [cookie dataUsingEncoding:NSUTF8StringEncoding]; value[(__bridge id)kSecAttrAccessible] = (__bridge id)kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly;
  return SecItemAdd((__bridge CFDictionaryRef)value, NULL) == errSecSuccess;
}
static NSDictionary *biliGet(NSString *path, NSDictionary *params) {
  NSURLComponents *url = [NSURLComponents componentsWithString:[@"https://api.bilibili.com" stringByAppendingString:path]];
  NSMutableArray *query = [NSMutableArray array];
  for (NSString *key in [[params allKeys] sortedArrayUsingSelector:@selector(compare:)]) [query addObject:[NSURLQueryItem queryItemWithName:key value:[params[key] description]]];
  url.queryItems = query;
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url.URL]; request.timeoutInterval = 20;
  [request setValue:readCookie() forHTTPHeaderField:@"Cookie"];
  [request setValue:@"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36" forHTTPHeaderField:@"User-Agent"];
  [request setValue:@"https://www.bilibili.com/" forHTTPHeaderField:@"Referer"];
  NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration; config.HTTPShouldSetCookies = NO;
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config]; dispatch_semaphore_t done = dispatch_semaphore_create(0);
  __block NSData *body; __block NSInteger code = 0;
  NSURLSessionDataTask *task = [session dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) { body = data; code = ((NSHTTPURLResponse *)response).statusCode; dispatch_semaphore_signal(done); }];
  [task resume]; if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 21*NSEC_PER_SEC))) [task cancel]; [session invalidateAndCancel];
  if (code != 200 || body.length > 4*1024*1024) return @{};
  id result = body ? [NSJSONSerialization JSONObjectWithData:body options:0 error:nil] : nil;
  return [result isKindOfClass:NSDictionary.class] ? result : @{};
}
static NSDictionary *wbi(NSDictionary *params) {
  NSDictionary *nav = biliGet(@"/x/web-interface/nav", @{});
  NSDictionary *navData = nav[@"data"];
  if (![navData isKindOfClass:NSDictionary.class]) return nil;
  NSDictionary *images = navData[@"wbi_img"];
  if (![images isKindOfClass:NSDictionary.class]) return nil;
  NSString *key = [[[[NSURL URLWithString:images[@"img_url"]] lastPathComponent] stringByDeletingPathExtension] stringByAppendingString:[[[NSURL URLWithString:images[@"sub_url"]] lastPathComponent] stringByDeletingPathExtension]];
  if (key.length != 64) return nil;
  const int order[] = {46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13};
  NSMutableString *mixin = [NSMutableString string]; for (int i=0;i<32;i++) [mixin appendFormat:@"%C", [key characterAtIndex:order[i]]];
  NSMutableDictionary *values = [params mutableCopy]; values[@"wts"] = @((NSInteger)NSDate.date.timeIntervalSince1970);
  NSMutableArray *pairs = [NSMutableArray array];
  NSMutableCharacterSet *allowed = [[NSCharacterSet alphanumericCharacterSet] mutableCopy]; [allowed addCharactersInString:@"-_.~"];
  NSCharacterSet *bad = [NSCharacterSet characterSetWithCharactersInString:@"!'()*"];
  for (NSString *name in [[values allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    NSString *value = [[[values[name] description] componentsSeparatedByCharactersInSet:bad] componentsJoinedByString:@""]; values[name] = value;
    [pairs addObject:[NSString stringWithFormat:@"%@=%@", [name stringByAddingPercentEncodingWithAllowedCharacters:allowed], [value stringByAddingPercentEncodingWithAllowedCharacters:allowed]]];
  }
  NSData *input = [[[pairs componentsJoinedByString:@"&"] stringByAppendingString:mixin] dataUsingEncoding:NSUTF8StringEncoding];
  unsigned char hash[CC_MD5_DIGEST_LENGTH]; CC_MD5(input.bytes, (CC_LONG)input.length, hash);
  NSMutableString *digest = [NSMutableString string]; for (int i=0;i<CC_MD5_DIGEST_LENGTH;i++) [digest appendFormat:@"%02x",hash[i]]; values[@"w_rid"] = digest; return values;
}
static NSArray *subtitleLines(NSString *address) {
  if ([address hasPrefix:@"//"]) address = [@"https:" stringByAppendingString:address];
  NSURL *url = [NSURL URLWithString:address];
  if (![url.scheme isEqual:@"https"] || !([url.host isEqual:@"hdslb.com"] || [url.host hasSuffix:@".hdslb.com"])) return @[];
  NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration; config.HTTPShouldSetCookies = NO; config.timeoutIntervalForRequest = 15;
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config]; dispatch_semaphore_t done = dispatch_semaphore_create(0); __block NSData *body;
  NSURLSessionDataTask *task = [session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) { if (((NSHTTPURLResponse *)response).statusCode == 200) body = data; dispatch_semaphore_signal(done); }];
  [task resume]; if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 16*NSEC_PER_SEC))) [task cancel]; [session invalidateAndCancel];
  if (!body || body.length > 2*1024*1024) return @[];
  NSDictionary *json = [NSJSONSerialization JSONObjectWithData:body options:0 error:nil]; if (![json isKindOfClass:NSDictionary.class] || ![json[@"body"] isKindOfClass:NSArray.class]) return @[];
  NSMutableArray *lines = [NSMutableArray array];
  for (NSDictionary *cue in json[@"body"]) {
    if (lines.count >= 20000) break;
    if (![cue isKindOfClass:NSDictionary.class] || ![cue[@"content"] isKindOfClass:NSString.class] || ![cue[@"from"] isKindOfClass:NSNumber.class]) continue;
    NSString *text = cue[@"content"]; [lines addObject:@{ @"time":cue[@"from"], @"content":[text substringToIndex:MIN(text.length, 2000)] }];
  }
  return lines;
}
@implementation ZVBiliBridge
+ (NSDictionary *)perform:(NSString *)operation value:(NSString *)value {
  @synchronized(self) {
    NSError *error = nil; NSString *raw = @"{}";
    if ([operation isEqual:@"start"]) raw = [decode(MobileStatus())[@"ready"] boolValue] ? MobileStatus() : MobileStart(readCookie(), &error);
    else if ([operation isEqual:@"status"]) raw = MobileStatus();
    else if ([operation isEqual:@"qr"]) raw = MobileQR(&error);
    else if ([operation isEqual:@"poll"]) {
      raw = MobilePollQR(value, &error);
      NSMutableDictionary *result = [decode(raw) mutableCopy]; NSString *cookie = result[@"cookie"];
      [result removeObjectForKey:@"cookie"];
      if ([result[@"loggedIn"] boolValue] && cookie.length) {
        MobileSetCookie(cookie, &error);
        if (!error && !saveCookie(cookie)) { MobileLogout(); return @{ @"success":@NO, @"message":@"无法安全保存 B站登录信息" }; }
      }
      if (error) return @{ @"success":@NO, @"message":@"B站登录失败，请重新扫码" };
      result[@"success"] = @YES; return result;
    } else if ([operation isEqual:@"logout"]) { SecItemDelete((__bridge CFDictionaryRef)keyQuery()); raw = MobileLogout(); }
    else if ([operation isEqual:@"stop"]) { MobileStop(); return @{ @"success":@YES }; }
    else if ([operation isEqual:@"catalog"]) {
      NSDictionary *options = decode(value); NSString *kind = options[@"kind"]; NSDictionary *status = decode(MobileStatus());
      if (![status[@"ready"] boolValue]) status = decode(MobileStart(readCookie(), &error));
      NSDictionary *user = status[@"user"];
      NSString *mid = [user isKindOfClass:NSDictionary.class] ? [user[@"mid"] description] ?: @"0" : @"0";
      NSInteger page = MAX(1, MIN(1000, [options[@"page"] integerValue]));
      NSString *path; NSDictionary *params;
      if ([kind isEqual:@"search"]) { path = @"/x/web-interface/wbi/search/type"; params = wbi(@{ @"keyword": options[@"keyword"] ?: @"", @"search_type":@"video", @"page":@(page) }); }
      else if ([kind isEqual:@"lyrics"]) { path = @"/x/player/wbi/v2"; params = wbi(@{ @"bvid": options[@"bvid"] ?: @"", @"cid": options[@"cid"] ?: @0 }); }
      else if ([kind isEqual:@"recommended"]) { path = @"/x/web-interface/index/top/rcmd"; params = @{ @"ps":@20 }; }
      else if ([kind isEqual:@"folders"]) { path = @"/x/v3/fav/folder/created/list-all"; params = @{ @"up_mid":mid }; }
      else if ([kind isEqual:@"favorites"]) { path = @"/x/v3/fav/resource/list"; params = @{ @"media_id": options[@"id"] ?: @0, @"pn":@(page), @"ps":@20 }; }
      else if ([kind isEqual:@"following"]) { path = @"/x/space/bangumi/follow/list"; params = @{ @"vmid":mid, @"type":@1, @"pn":@(page), @"ps":@15 }; }
      else if ([kind isEqual:@"episodes"]) { path = @"/pgc/view/web/season"; params = @{ @"season_id":options[@"id"] ?: @0 }; }
      else if ([kind isEqual:@"collection"]) { path = @"/x/polymer/web-space/seasons_archives_list"; params = @{ @"mid": options[@"mid"] ?: @0, @"season_id":options[@"id"] ?: @0, @"page_num":@(page), @"page_size":@20 }; }
      else return @{ @"success":@NO, @"message":@"不支持的 B站栏目" };
      if (!params) return @{ @"success":@NO, @"message":@"B站检索签名初始化失败" };
      NSDictionary *response = biliGet(path, params);
      if (!response[@"code"] || [response[@"code"] intValue] != 0) return @{ @"success":@NO, @"message":@"B站栏目暂不可用，请检查账号权限或稍后重试" };
      if ([kind isEqual:@"lyrics"]) {
        NSDictionary *data = response[@"data"]; NSDictionary *subtitle = [data isKindOfClass:NSDictionary.class] ? data[@"subtitle"] : nil;
        NSArray *tracks = [subtitle isKindOfClass:NSDictionary.class] ? subtitle[@"subtitles"] : nil;
        NSDictionary *track = [tracks isKindOfClass:NSArray.class] && tracks.count ? tracks[0] : nil;
        NSString *address = [track isKindOfClass:NSDictionary.class] ? track[@"subtitle_url"] : nil;
        return @{ @"success":@YES, @"data":@{ @"lines":[address isKindOfClass:NSString.class] ? subtitleLines(address) : @[] } };
      }
      return @{ @"success":@YES, @"data":response[@"data"] ?: response[@"result"] ?: @{} };
    }
    else if ([operation isEqual:@"resolve"]) {
      NSDictionary *options = decode(value); NSDictionary *status = decode(MobileStatus());
      if (![status[@"ready"] boolValue]) status = decode(MobileStart(readCookie(), &error));
      if (error || ![status[@"loggedIn"] boolValue]) return @{ @"success":@NO, @"message":@"请先在本机扫码登录 B站账号" };
      NSString *base = status[@"proxyUrl"]; if (![base hasPrefix:@"http://127.0.0.1:"]) return @{ @"success":@NO, @"message":@"本机媒体服务未启动" };
      NSMutableArray *caps = [NSMutableArray arrayWithObject:@{ @"codec":@"avc", @"maxWidth":@1920, @"maxHeight":@1080, @"maxFrameRate":@60 }];
      if (VTIsHardwareDecodeSupported(kCMVideoCodecType_HEVC)) [caps addObject:@{ @"codec":@"hevc", @"maxWidth":@3840, @"maxHeight":@2160, @"maxFrameRate":@60 }];
      NSString *capText = [[NSString alloc] initWithData:[NSJSONSerialization dataWithJSONObject:caps options:0 error:nil] encoding:NSUTF8StringEncoding];
      NSURLComponents *url = [NSURLComponents componentsWithString:[base stringByAppendingString:@"/resolve"]];
      url.queryItems = @[[NSURLQueryItem queryItemWithName:@"bvid" value:options[@"url"] ?: @""], [NSURLQueryItem queryItemWithName:@"cid" value:[options[@"cid"] description] ?: @"0"], [NSURLQueryItem queryItemWithName:@"qn" value:[options[@"qn"] description] ?: @"0"], [NSURLQueryItem queryItemWithName:@"qualityMode" value:[options[@"qn"] intValue] > 0 ? @"manual" : @"autoMax"], [NSURLQueryItem queryItemWithName:@"fallbackQn" value:[options[@"fallbackQn"] description] ?: @"0"], [NSURLQueryItem queryItemWithName:@"capabilities" value:capText], [NSURLQueryItem queryItemWithName:@"timeoutMs" value:@"40000"]];
      dispatch_semaphore_t ready = dispatch_semaphore_create(0); __block NSData *body = nil; __block NSInteger code = 0;
      NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration; config.timeoutIntervalForRequest = 45; config.HTTPShouldSetCookies = NO;
      NSURLSession *session = [NSURLSession sessionWithConfiguration:config];
      NSURLSessionDataTask *task = [session dataTaskWithURL:url.URL completionHandler:^(NSData *data, NSURLResponse *response, NSError *failure) { body = data; code = ((NSHTTPURLResponse *)response).statusCode; dispatch_semaphore_signal(ready); }];
      [task resume]; if (dispatch_semaphore_wait(ready, dispatch_time(DISPATCH_TIME_NOW, 46 * NSEC_PER_SEC))) [task cancel]; [session invalidateAndCancel];
      if (code != 200 || !body) return @{ @"success":@NO, @"message":@"本机 B站解析失败，请检查登录、权限和网络" };
      NSMutableDictionary *result = [[NSJSONSerialization JSONObjectWithData:body options:0 error:nil] mutableCopy];
      if (![result isKindOfClass:NSDictionary.class] || ![result[@"success"] boolValue]) return @{ @"success":@NO, @"message":@"本机 B站解析未返回可播放源" };
      for (NSString *key in @[@"videoUrl", @"audioUrl"]) {
        NSString *target = result[key]; if (!target.length) continue;
        NSURLComponents *proxy = [NSURLComponents componentsWithString:[base stringByAppendingString:@"/proxy"]]; proxy.queryItems = @[[NSURLQueryItem queryItemWithName:@"url" value:target]]; result[key] = proxy.string;
      }
      [result removeObjectForKey:@"videoBackupUrls"]; [result removeObjectForKey:@"audioBackupUrls"]; result[@"sessionVersion"] = status[@"sessionVersion"]; return result;
    } else return @{ @"success":@NO, @"message":@"无效的本机操作" };
    if (error) return @{ @"success":@NO, @"message":@"本机 B站操作失败，请检查网络或重新扫码" };
    NSMutableDictionary *result = [decode(raw) mutableCopy]; result[@"success"] = @YES; return result;
  }
}
@end
