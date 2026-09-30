#include <opus.h>
#include <assert.h>
#include <math.h>
#include <stdio.h>
int main(void) {
  int error = 0;
  OpusEncoder *encoder = opus_encoder_create(48000, 1, OPUS_APPLICATION_VOIP, &error); assert(encoder && error == OPUS_OK);
  OpusDecoder *decoder = opus_decoder_create(48000, 1, &error); assert(decoder && error == OPUS_OK);
  float input[960], output[5760]; unsigned char packet[4000]; double energy = 0;
  assert(opus_encoder_ctl(encoder, OPUS_SET_BITRATE(32000)) == OPUS_OK);
  for (int frame = 0; frame < 50; frame++) {
    for (int i = 0; i < 960; i++) input[i] = 0.25f * sinf(6.2831853f * 440 * (frame * 960 + i) / 48000);
    int size = opus_encode_float(encoder, input, 960, packet, sizeof(packet)); assert(size > 0 && size <= 4000);
    int count = opus_decode_float(decoder, packet, size, output, 5760, 0); assert(count == 960);
    for (int i = 0; i < count; i++) { assert(isfinite(output[i])); energy += output[i] * output[i]; }
  }
  assert(energy > 100); opus_encoder_destroy(encoder); opus_decoder_destroy(decoder);
  puts("Opus host smoke: 50 mono/48kHz/20ms encode-decode frames passed (not device capture acceptance)."); return 0;
}
