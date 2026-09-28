# ZViewer HarmonyOS

This is the Stage/ArkWeb host for the shared React client. Current milestone:
H0 scaffold, local page packaging, a host handshake, and native back dispatch.
Room features and media capabilities still need emulator and physical-device
validation. No Bilibili account or local proxy implementation is present.

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
The local API 26 emulators accept it for development, but it is not a
signed real-device test package. Keep signing keys, profiles and credentials
outside the repository.

## Current bridge and limits

ArkWeb receives a minimal `zviewerHost` proxy with a platform handshake and
background action. Only the local virtual origin is allowed to navigate inside
the component. Rotation, immersive display, microphone, background media, and
Bilibili methods are pending native implementation. See
`docs/harmonyos-development-plan.md` for the milestones and test matrix.
