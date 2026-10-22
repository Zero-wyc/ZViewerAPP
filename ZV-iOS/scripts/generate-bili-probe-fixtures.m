// Generates owned, synthetic 8-bit SDR keyframes with Apple VideoToolbox.
#import <Foundation/Foundation.h>
#import <VideoToolbox/VideoToolbox.h>

static void encoded(void *context, void *source, OSStatus status, VTEncodeInfoFlags flags, CMSampleBufferRef sample) {
  if (status || !sample) return;
  NSMutableDictionary *out = (__bridge NSMutableDictionary *)context;
  CMFormatDescriptionRef format = CMSampleBufferGetFormatDescription(sample);
  BOOL hevc = CMFormatDescriptionGetMediaSubType(format) == kCMVideoCodecType_HEVC;
  NSMutableArray *parameters = [NSMutableArray array];
  size_t count = 0;
  for (size_t i = 0; i < (hevc ? 3 : 2); i++) {
    const uint8_t *data = NULL; size_t size = 0; int length = 0;
    OSStatus result = hevc ? CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(format, i, &data, &size, &count, &length) : CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, i, &data, &size, &count, &length);
    if (result || length != 4) return;
    [parameters addObject:[[NSData dataWithBytes:data length:size] base64EncodedStringWithOptions:0]];
  }
  CMBlockBufferRef block = CMSampleBufferGetDataBuffer(sample);
  NSMutableData *data = [NSMutableData dataWithLength:CMBlockBufferGetDataLength(block)];
  if (CMBlockBufferCopyDataBytes(block, 0, data.length, data.mutableBytes)) return;
  out[@"parameters"] = parameters;
  out[@"sample"] = [data base64EncodedStringWithOptions:0];
}
int main(void) { @autoreleasepool {
  NSMutableArray *fixtures = [NSMutableArray array];
  const int sizes[][2] = {{1280,720},{720,1280},{854,480},{480,854},{1920,1080},{1080,1920},{2560,1440},{1440,2560},{3840,2160},{2160,3840}};
  for (NSString *codec in @[@"avc",@"hevc"]) for (int i=0;i<sizeof(sizes)/sizeof(sizes[0]);i++) {
    int width=sizes[i][0],height=sizes[i][1]; BOOL hevc=[codec isEqual:@"hevc"];
    NSMutableDictionary *out=[@{@"codec":codec,@"width":@(width),@"height":@(height),@"fps":@30} mutableCopy];
    VTCompressionSessionRef session=NULL;
    OSStatus status=VTCompressionSessionCreate(NULL,width,height,hevc?kCMVideoCodecType_HEVC:kCMVideoCodecType_H264,NULL,NULL,NULL,encoded,(__bridge void*)out,&session);
    if(status) { fprintf(stderr,"create %d\n",(int)status);return 1; }
    VTSessionSetProperty(session,kVTCompressionPropertyKey_ProfileLevel,hevc?kVTProfileLevel_HEVC_Main_AutoLevel:kVTProfileLevel_H264_High_AutoLevel);
    VTSessionSetProperty(session,kVTCompressionPropertyKey_ExpectedFrameRate,(__bridge CFNumberRef)@30);
    VTSessionSetProperty(session,kVTCompressionPropertyKey_AllowFrameReordering,kCFBooleanFalse);
    VTSessionSetProperty(session,kVTCompressionPropertyKey_AverageBitRate,(__bridge CFNumberRef)@1000000);
    CVPixelBufferRef pixel=NULL;
    status=CVPixelBufferCreate(NULL,width,height,kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,(__bridge CFDictionaryRef)@{(__bridge NSString*)kCVPixelBufferIOSurfacePropertiesKey:@{}},&pixel);
    if(status)return 2;
    CVPixelBufferLockBaseAddress(pixel,0);
    for(size_t p=0;p<2;p++)memset(CVPixelBufferGetBaseAddressOfPlane(pixel,p),p?128:64,CVPixelBufferGetBytesPerRowOfPlane(pixel,p)*CVPixelBufferGetHeightOfPlane(pixel,p));
    CVPixelBufferUnlockBaseAddress(pixel,0);
    status=VTCompressionSessionEncodeFrame(session,pixel,kCMTimeZero,CMTimeMake(1,30),(__bridge CFDictionaryRef)@{(__bridge NSString*)kVTEncodeFrameOptionKey_ForceKeyFrame:@YES},NULL,NULL);
    if(!status)status=VTCompressionSessionCompleteFrames(session,kCMTimeInvalid);
    CVPixelBufferRelease(pixel); VTCompressionSessionInvalidate(session);CFRelease(session);
    if(status || !out[@"sample"]) { fprintf(stderr,"encode %d %s %dx%d\n",(int)status,codec.UTF8String,width,height);return 3; }
    [fixtures addObject:out];
  }
  NSData *data=[NSJSONSerialization dataWithJSONObject:fixtures options:NSJSONWritingPrettyPrinted error:NULL];
  fwrite(data.bytes,1,data.length,stdout);
}}
