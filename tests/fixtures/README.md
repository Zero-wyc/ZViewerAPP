# FLAC Regression Samples

These original synthetic 440 Hz tones contain no third-party media. Generate with:

```powershell
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 0.4 -c:a flac -sample_fmt s16 flac-16.flac
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=48000 -t 0.4 -c:a flac -sample_fmt s32 flac-24.flac
```

FFmpeg's FLAC encoder stores the `s32` input at 24-bit precision. The browser
regression remuxes both files through the same vendored Mediabunny code used by
playsvideo, then appends and plays the resulting fragmented MP4 through MSE.
