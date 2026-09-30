# ZViewer native services

Local Expo module discovered through `modules/`; CNG generates the app project.
Only `unsigned-device` currently prepares and builds its device ARM64 vendors.
The old simulator/development profiles need a matching vendor preparation step
before they can be used with this module; use the supplied unsigned build for
the current device acceptance.

`bili(operation, value)` owns QR login, Keychain, read-only catalogs, and the
unchanged shared Go `native/bilicore/mobile` implementation. Cookie never crosses
the JS bridge. Resolve returns only issued 127.0.0.1/random-capability proxy URLs;
ordinary room media still rejects loopback. Room movie URLs remain public BV
links. Each client resolves independently. Quality excludes HDR/Dolby and is
bounded by account access and device capabilities; playback retries at 720p
then 480p, at most twice. Stop closes the local listener and releases Go state.

Voice uses AVAudioEngine voice processing and Opus 1.6.1: mono/48kHz/20ms,
32kbps. AVAudioConverter adapts microphone input; receive also supports the
server's legacy Float32 PCM. Native codec and engine operations share a serial
queue. Capture work is bounded; receive starts with 60ms preroll and is bounded
at 200ms. Socket.IO main and media connections follow v4.2.0 unchanged; server
mute/kick are authoritative. Join starts muted. Background stops capture;
interruption mutes and requires manual unmute; route changes request rejoin.
Leaving releases both sockets and the native engine. A CNG plugin preserves the
voice-owned audio session when VLC changes its playback state.

`stage-native-core.cjs` copies shared Go sources without changing them and writes
a SHA-256 manifest. EAS verifies pinned Go/Opus download digests, builds vendors,
and runs a macOS Opus encode/decode smoke check. This is compile/codec evidence,
not device microphone, networking, or playback acceptance. The offline IPA
inspector also requires all three native bridge classes in the device executable.

Go upstream is MIT; Opus is BSD. Vendor license notices are bundled in the app.
