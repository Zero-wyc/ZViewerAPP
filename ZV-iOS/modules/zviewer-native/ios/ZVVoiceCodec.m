#import "ZVVoiceCodec.h"
#include "opus.h"
@implementation ZVVoiceCodec {
  OpusEncoder *_encoder;
  OpusDecoder *_decoder;
}
- (instancetype)init {
  if ((self = [super init])) { int error = 0; _encoder = opus_encoder_create(48000, 1, OPUS_APPLICATION_VOIP, &error); _decoder = opus_decoder_create(48000, 1, &error); if (!_encoder || !_decoder) return nil; opus_encoder_ctl(_encoder, OPUS_SET_BITRATE(32000)); opus_encoder_ctl(_encoder, OPUS_SET_COMPLEXITY(5)); }
  return self;
}
- (NSData *)encode:(NSData *)pcm {
  if (pcm.length != 960 * sizeof(float)) return nil;
  unsigned char packet[4000]; int count = opus_encode_float(_encoder, pcm.bytes, 960, packet, sizeof(packet));
  return count > 0 ? [NSData dataWithBytes:packet length:count] : nil;
}
- (NSData *)decode:(NSData *)packet {
  if (!packet.length || packet.length > 4000) return nil;
  float pcm[5760]; int frames = opus_decode_float(_decoder, packet.bytes, (opus_int32)packet.length, pcm, 5760, 0);
  return frames > 0 ? [NSData dataWithBytes:pcm length:frames * sizeof(float)] : nil;
}
- (void)dealloc { if (_encoder) opus_encoder_destroy(_encoder); if (_decoder) opus_decoder_destroy(_decoder); }
@end
