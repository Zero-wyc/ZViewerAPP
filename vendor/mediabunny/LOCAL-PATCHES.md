# Local FLAC MP4 Fix

`dist/modules/src/isobmff/isobmff-boxes.js`: `soundSampleDescription` reads
FLAC bit depth from the decoder description's STREAMINFO block, matching the
existing FLAC muxer's parsing. The previous hardcoded 16-bit AudioSampleEntry
disagreed with 24-bit STREAMINFO and Chromium rejected the initialization segment:

`FLAC AudioSampleEntry sample size mismatches FLACSpecificBox STREAMINFO sample size`

Reapply this patch when replacing the vendored fork. Existing DTS patches in
other files must also be retained.

历史回归曾使用合成 16/24 位 FLAC 和 Chromium MSE 验证；测试脚本与夹具已从客户端交付树清理。
