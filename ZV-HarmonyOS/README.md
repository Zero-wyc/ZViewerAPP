# ZViewer HarmonyOS

This is the Stage/ArkWeb host for the shared React client. The current H5
release candidate covers connection, login, lobby, room, chat, playlist,
MP4/MKV playback, subtitles, danmaku, realtime audio, and native Bilibili
login with local DASH proxying and manual quality selection. The host also
supplies native back dispatch, screen orientation, immersive window requests,
microphone permission handling, and secure local credential storage.

## Toolchain

Initial build used DevEco Studio 26.0.0.851, HarmonyOS SDK 26.0.0.105,
Hvigor 6.26.8, ohpm 26.0.0.630, and DevEco's Node 24.14.1 on Windows.
The project currently targets API 26 for both compatibility and target level.
Lower API support has not been tested. The bundle name is provisionally
`com.zviewer.mobile`; confirm its registration before release signing.

## Build

From `ZViewer-client/`:

```powershell
npm run harmony:web
```

This runs the shared TypeScript/Vite build with relative generated asset URLs
and copies `dist/` to `entry/src/main/resources/rawfile/web/`. The copied web
tree is generated and ignored by Git. Re-run this command after each shared
web change and before compiling the HAP. The script inserts a local-only
bootstrap that checks `zviewerHost.getPlatform()` and exposes the existing
`window.zviewerNative.platform` contract before React starts. ArkWeb serves
rawfiles at the fixed virtual origin `https://zviewer.local` so ES modules,
styles, fonts, worker and absolute local paths use one secure origin.

Open this directory in DevEco Studio and build `entry` for the `default`
product. For command-line builds on this machine, set `DEVECO_SDK_HOME` to
the parent directory of the installed `default/` SDK, then run:

```powershell
& 'F:\DevEco Studio\tools\hvigor\bin\hvigorw.bat' --mode module -p product=default -p buildMode=debug assembleHap
```

Without a signing configuration this produces `entry-default-unsigned.hap`.
The local API 26 emulator accepts it for development. Release signing and
store publication remain an external finalization step; keep signing keys,
profiles and credentials outside the repository.

## Delivery test device rule

Use the Pura 90 Pro phone emulator as the primary device for each development
and acceptance iteration. A passing emulator test counts as acceptance for
that iteration. Do not repeat the same acceptance run on a tablet each time;
the user will test tablet adaptation at project close. Record any untested
tablet behavior in the release note rather than inferring a tablet result from
the phone test.

## Current bridge and limits

The 2026-10-01 sync includes the current Android v4.2.1 shared Web code and
global mobile appearance. `isGlobalAppearanceRuntime()` enables the same
appearance shell on Android and HarmonyOS across connection, lobby, watch
and music rooms. Room settings expose Appearance; document-level variables
also theme body Portals. Theme changes preserve the active video/audio
element. Client package version is 1.3.0 (130).

DevEco Studio's Pura 90 Pro API 26 emulator passed appearance, native Back,
orientation, fullscreen, persistence and H.264 MP4/MKV checks. The two user
HEVC Main 10 MKV files failed video decoding, including a video-only MP4
control retaining the original HEVC track. See
[`harmonyos-v4.2.1-adaptation-report.md`](../docs/harmonyos-v4.2.1-adaptation-report.md)
for measurements and untested device scenarios.

ArkWeb debugging is gated by generated `BuildProfile.DEBUG`. For debug HAP
inspection, discover `webview_devtools_remote_<pid>` with hdc and forward it
to a local CDP port. Rediscover the socket after restarting the Ability.
Release builds disable Web debugging.

ArkWeb receives a `zviewerHost` proxy with a platform handshake, background
action and request/response methods for orientation, immersive display,
microphone permission, and Bilibili account operations. Only the local virtual
origin is allowed to navigate inside the component. Bilibili media is resolved
by the ArkTS host and proxied only from allowlisted CDN domains; credentials
are not exposed to the Web client. See `docs/harmonyos-maintenance-architecture.md`
for the maintenance boundary and `docs/releases/` for device evidence.
