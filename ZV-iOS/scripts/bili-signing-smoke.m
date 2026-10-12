#import <Foundation/Foundation.h>
#import "ZVBiliSigning.h"
int main(void) {
  @autoreleasepool {
    NSString *keys = @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
    NSArray *cases = @[@[@"中文 搜索!()", @"b244f33e66601ab072bf4d2e4f638575"], @[@"video&music", @"1bca13e7952c54c9ad8efb9ae382694f"]];
    for (NSArray *value in cases) {
      NSDictionary *signedValues = ZVBiliSignedParameters(@{@"keyword":value[0], @"page":@2, @"search_type":@"video"}, keys, 1700000000);
      if (![signedValues[@"w_rid"] isEqual:value[1]]) { fprintf(stderr, "WBI canonicalization regression\n"); return 1; }
    }
    if (ZVBiliSignedParameters(@{}, @"invalid", 1700000000)) return 1;
    puts("Native WBI Chinese/search query checks passed.");
  }
  return 0;
}
