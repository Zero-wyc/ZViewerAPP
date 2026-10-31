# ZViewer HarmonyOS

This is the ArkTS/ArkWeb host for the shared React client. Current source and published HAP are **2.3.5 / versionCode 235**. The host supplies the `zviewerNative` bridge, native connection and media services, microphone permission, orientation, system media and local Bilibili resolution.

## Build the web payload

From the repository root, run after changing shared React code:

```sh
npm run harmony:web
```

This runs the TypeScript/Vite build and copies the generated web app to `entry/src/main/resources/rawfile/web/`. That directory is generated; make persistent fixes in `src/`, `public/`, `vendor/` or the bridge bootstrap, then rebuild it.

Open `ZV-HarmonyOS/` in DevEco Studio and build the `default` product HAP. Configure the local HarmonyOS SDK and signing identity on the build machine; signing keys, profiles, passwords and local SDK paths stay outside published source. Confirm the HAP version, signature, embedded web payload and checksum for release.

## Bridge and validation

ArkWeb loads the packaged web app at the fixed local origin `https://zviewer.local`. `Index.ets` and `scripts/bridge-bootstrap.js` expose `zviewerHost` through the `window.zviewerNative` contract. Bilibili credentials and proxy state remain in ArkTS; validate the random loopback proxy, allowed media hosts, Range requests, playback tracks, app lifecycle and resource cleanup independently.

UI previews and simulators do not prove hardware decoding, microphone, Bluetooth, background playback or cross-device synchronization. The platform-specific module map, build workflow, security boundaries, troubleshooting guide and acceptance matrix are in [`docs/harmonyos-maintenance-architecture.md`](../docs/harmonyos-maintenance-architecture.md). Historical releases are available from Git history and [GitHub Releases](https://github.com/Zero-wyc/ZViewerAPP/releases).
