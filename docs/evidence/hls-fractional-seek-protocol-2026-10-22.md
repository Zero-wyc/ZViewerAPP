# NAS HLS fractional seek protocol evidence (2026-10-22)

Scope: macOS arm64 VLCKit 4.0.0a24, real NAS media-library HLS through the production local relay, production generated Swift seek method, software video decoder with dummy video/audio outputs. This is not Simulator UI or physical-device acceptance, and does not establish audible output or sustained 4K/120 playback capability.

The input reported one 3840×1608 video track at 120/1 fps and one audio track. Frame-step success callbacks, decoded-video/audio counters and displayed-picture counters were observed. Both seeks kept the input paused with the original 1.5 playback-rate intent; the final 144.750 s clock remained unchanged eight seconds later. Targets were 129.842 s and 144.842 s, each finishing 92 ms before target within the strict 500 ms requirement (the implementation uses 100 ms).

Generated method SHA-256: `d0b1d4fb94e3fba67899fd99c615be619a53553d5db43e4e83dd70558911415a`.

NAS 81.043 s cold-input seek is still an unresolved boundary: timestamp mapping may overshoot, later frame preparation can stall, and bounded failure is not a pass. This record does not cover that target, proxy-direction switching, other HLS sources, or native UI acceptance. The native limit remains 30 seconds; a 35-second experiment did not resolve the boundary and was not adopted.

Safe diagnostics (no source address, credentials, headers or title):

```text
PROBE version=4.0.0-dev Otto Chriek changeset=4.0.0-dev-38816-gba1f1ef1b2
PROBE first actual=129750.0 raw=129750 state=3
PROBE second actual=144750.0 raw=144750 state=3
PROBE later actual=144750 state=3
PROBE media videoTracks=1 audioTracks=1 width=3840 height=1608 fpsNumerator=120 fpsDenominator=1 videoCodec=1668703592 audioCodec=1630826605 decodedVideo=137 decodedAudio=3 displayed=166
PROBE result=pass mode=product
2026-10-22 18:00:20.222 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek-issued revision=1 target=129842 actual=33 state=3 accepted=1 attempt=1
2026-10-22 18:00:30.425 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek revision=1 target=129842 actual=129750 success=1
2026-10-22 18:00:30.425 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek-frames revision=1 target=129842 actual=129750 steps=134 duration=10.683 success=1
2026-10-22 18:00:30.949 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek-issued revision=1 target=144842 actual=129750 state=3 accepted=1 attempt=1
2026-10-22 18:00:42.501 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek revision=1 target=144842 actual=144750 success=1
2026-10-22 18:00:42.502 zv-hls-fractional-probe-product-129842[79795:565863] [ZViewerVLC] seek-frames revision=1 target=144842 actual=144750 steps=169 duration=11.552 success=1
```
