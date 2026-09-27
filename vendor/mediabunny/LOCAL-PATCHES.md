# Local FLAC MP4 Fix

`dist/modules/src/isobmff/isobmff-boxes.js`: `soundSampleDescription` reads
FLAC bit depth from the decoder description's STREAMINFO block, matching the
existing FLAC muxer's parsing. The previous hardcoded 16-bit AudioSampleEntry
disagreed with 24-bit STREAMINFO and Chromium rejected the initialization segment:

`FLAC AudioSampleEntry sample size mismatches FLACSpecificBox STREAMINFO sample size`

Reapply this patch when replacing the vendored fork. Existing DTS patches in
other files must also be retained.

Regression: `npx playwright test tests/flac.spec.ts` remuxes synthetic 16-bit and
24-bit FLAC and verifies actual Chromium MSE playback. Before this patch only
the 24-bit test fails with the exact error above.
