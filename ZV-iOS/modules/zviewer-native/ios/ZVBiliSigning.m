#import "ZVBiliSigning.h"
#import <CommonCrypto/CommonDigest.h>
NSDictionary *ZVBiliSignedParameters(NSDictionary *parameters, NSString *keys, NSInteger timestamp) {
  if (keys.length != 64) return nil;
  const int order[] = {46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13};
  NSMutableString *mixin = [NSMutableString string];
  for (int i = 0; i < 32; i++) [mixin appendFormat:@"%C", [keys characterAtIndex:order[i]]];
  NSMutableDictionary *values = [parameters mutableCopy]; values[@"wts"] = @(timestamp);
  // WBI canonicalization uses UTF-8 percent encoding, including Chinese keywords.
  NSCharacterSet *allowed = [NSCharacterSet characterSetWithCharactersInString:@"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~"];
  NSCharacterSet *bad = [NSCharacterSet characterSetWithCharactersInString:@"!'()*"];
  NSMutableArray *pairs = [NSMutableArray array];
  for (NSString *name in [[values allKeys] sortedArrayUsingSelector:@selector(compare:)]) {
    NSString *value = [[[values[name] description] componentsSeparatedByCharactersInSet:bad] componentsJoinedByString:@""]; values[name] = value;
    [pairs addObject:[NSString stringWithFormat:@"%@=%@", [name stringByAddingPercentEncodingWithAllowedCharacters:allowed], [value stringByAddingPercentEncodingWithAllowedCharacters:allowed]]];
  }
  NSData *input = [[[pairs componentsJoinedByString:@"&"] stringByAppendingString:mixin] dataUsingEncoding:NSUTF8StringEncoding];
  unsigned char hash[CC_MD5_DIGEST_LENGTH]; CC_MD5(input.bytes, (CC_LONG)input.length, hash);
  NSMutableString *digest = [NSMutableString string];
  for (int i = 0; i < CC_MD5_DIGEST_LENGTH; i++) [digest appendFormat:@"%02x", hash[i]];
  values[@"w_rid"] = digest; return values;
}
